// One-off recompute (#177) of the elevations of saved routes with the IGN (Open-Meteo abroad), as routed tracks get
// them since #176, then of their elevation_profile, elevation_gain_m and elevation_loss_m. OpenRouteService's 90 m
// model overestimated the gain by 7 to 25 % around Grenoble. Which points are recomputed: `routedRanges`
// (scripts/routeElevations.ts); GPX files' and recordings' own points are never touched.
//
//   npx jiti scripts/recompute-route-elevations.ts             local Supabase (`npm run db:start`), report only
//   npx jiti scripts/recompute-route-elevations.ts --apply     local Supabase, saves the changes
//   npx jiti scripts/recompute-route-elevations.ts --hosted    hosted project (.env), report only
//
// --hosted reads NUXT_PUBLIC_SUPABASE_URL and NUXT_SUPABASE_SECRET_KEY (service role) from .env: only once #176 is
// in production, otherwise routes drawn meanwhile still get OpenRouteService's elevations. A route that fails is
// reported and the others go on; running it again only changes what is still different (failures, Open-Meteo quota).
import { execSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../shared/types/database.types'
import type { EditorState, LngLat, RouteSource } from '../shared/utils/routes'
import type { ElevationSources } from '../shared/utils/trackElevation'
import { recomputeRoute, type SavedRoute } from './routeElevations'

const IGN_URL = 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json'
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/elevation'
// The IGN takes 5 requests a second per IP address.
const IGN_INTERVAL_MS = 250
const IGN_RETRY_MS = 2000
const IGN_NO_DATA = -9999
// Open-Meteo counts every point as a call: 600 a minute, 10,000 a day (the app's own imports abroad included).
const OPEN_METEO_MS_PER_POINT = 100
const OPEN_METEO_DAILY_POINTS = 8000
const PAGE_SIZE = 50

const args = new Set(process.argv.slice(2))
const unknown = [...args].filter(arg => arg !== '--hosted' && arg !== '--apply')
if (unknown.length) {
  console.error(`Options inconnues : ${unknown.join(' ')} (--hosted, --apply)`)
  process.exit(1)
}
const hosted = args.has('--hosted')
const apply = args.has('--apply')

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function connection(): { url: string, key: string } {
  if (hosted) {
    process.loadEnvFile('.env')
    const url = process.env.NUXT_PUBLIC_SUPABASE_URL
    const key = process.env.NUXT_SUPABASE_SECRET_KEY
    if (!url || !key) throw new Error('NUXT_PUBLIC_SUPABASE_URL et NUXT_SUPABASE_SECRET_KEY manquent dans .env')
    return { url, key }
  }
  let status
  try {
    status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
  }
  catch {
    throw new Error('Supabase local ne répond pas : lance Docker Desktop, puis `npm run db:start`.')
  }
  const url: string = status.API_URL ?? ''
  if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`Configuration Supabase locale inattendue : ${url}`)
  return { url, key: status.SERVICE_ROLE_KEY ?? status.SECRET_KEY }
}

class HttpError extends Error {
  constructor(public status: number, service: string) {
    super(`${service} : HTTP ${status}`)
  }
}

let nextIgnAt = 0
async function ignElevations(points: LngLat[], retried = false): Promise<(number | null)[]> {
  await wait(nextIgnAt - Date.now())
  nextIgnAt = Date.now() + IGN_INTERVAL_MS
  const response = await fetch(IGN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      lon: points.map(([lng]) => lng).join('|'),
      lat: points.map(([, lat]) => lat).join('|'),
      delimiter: '|',
      resource: 'ign_rge_alti_wld',
      zonly: 'true',
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (response.status === 429 && !retried) {
    await wait(IGN_RETRY_MS)
    return ignElevations(points, true)
  }
  if (!response.ok) throw new HttpError(response.status, 'IGN')
  const { elevations } = await response.json() as { elevations?: number[] }
  if (elevations?.length !== points.length) throw new Error('IGN : réponse inattendue')
  return elevations.map(elevation => elevation > IGN_NO_DATA ? elevation : null)
}

let openMeteoPoints = 0
let nextOpenMeteoAt = 0
async function openMeteoElevations(points: LngLat[]): Promise<number[]> {
  if (openMeteoPoints + points.length > OPEN_METEO_DAILY_POINTS) throw new Error('quota Open-Meteo du jour atteint, à relancer demain')
  await wait(nextOpenMeteoAt - Date.now())
  nextOpenMeteoAt = Date.now() + points.length * OPEN_METEO_MS_PER_POINT
  openMeteoPoints += points.length
  const query = new URLSearchParams({
    latitude: points.map(([, lat]) => lat).join(','),
    longitude: points.map(([lng]) => lng).join(','),
  })
  const response = await fetch(`${OPEN_METEO_URL}?${query}`, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new HttpError(response.status, 'Open-Meteo')
  const { elevation } = await response.json() as { elevation?: number[] }
  if (elevation?.length !== points.length || !elevation.every(Number.isFinite)) throw new Error('Open-Meteo : réponse inattendue')
  return elevation
}

const sources: ElevationSources = { precise: ignElevations, fallback: openMeteoElevations }

interface Change { name: string, source: RouteSource, before: number | null, after: number }

async function main() {
  const { url, key } = connection()
  const supabase = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  console.log(`${hosted ? 'Projet hébergé' : 'Supabase local'} : ${url}${apply ? '' : ' (compte rendu seul, --apply pour enregistrer)'}`)

  const changes: Change[] = []
  const counts = { changed: 0, unchanged: 0 }
  const skipped = new Map<string, number>()
  const failures: string[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    // Drawn routes, and imports or recordings whose editor state may hold routed segments.
    const { data, error } = await supabase
      .from('routes')
      .select('id, name, source, editor_state, elevation_profile, elevation_gain_m, elevation_loss_m, geometry:route_geojson')
      .or('source.eq.drawn,editor_state.not.is.null')
      .order('id')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`Lecture des parcours : ${error.message}`)

    for (const row of data) {
      const route: SavedRoute = {
        id: row.id,
        source: row.source,
        coordinates: (row.geometry as { coordinates: LngLat[] } | null)?.coordinates ?? [],
        elevations: row.elevation_profile as number[] | null,
        gain: row.elevation_gain_m,
        loss: row.elevation_loss_m,
        editorState: row.editor_state as EditorState | null,
      }
      const label = `${row.name} (${row.source}, ${row.id})`
      try {
        const result = await recomputeRoute(route, sources)
        if (result.status === 'skipped') {
          skipped.set(result.reason, (skipped.get(result.reason) ?? 0) + 1)
          continue
        }
        counts[result.status]++
        changes.push({ name: row.name, source: row.source, before: route.gain, after: result.gain })
        if (result.status === 'unchanged' || !apply) continue
        const { error } = await supabase
          .from('routes')
          .update({ elevation_profile: result.elevations, elevation_gain_m: result.gain, elevation_loss_m: result.loss })
          .eq('id', row.id)
        if (error) throw new Error(`enregistrement : ${error.message}`)
        console.log(`✓ ${label} : D+ ${format(route.gain)} → ${format(result.gain)} m`)
      }
      catch (error) {
        failures.push(`${label} : ${(error as Error).message}`)
        console.error(`✗ ${label} : ${(error as Error).message}`)
      }
    }
    if (data.length < PAGE_SIZE) break
  }

  report(changes, counts, skipped, failures)
  if (failures.length) process.exitCode = 1
}

const SKIP_REASONS: Record<string, string> = {
  'no routed segment': 'aucun segment routé',
  'no elevations': 'altitudes absentes',
  'points': 'nombre de points',
}

const format = (value: number | null) => value === null ? '—' : Math.round(value).toLocaleString('fr-FR')

function report(changes: Change[], counts: Record<'changed' | 'unchanged', number>, skipped: Map<string, number>, failures: string[]) {
  const compared = changes.filter(change => change.before !== null)
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / (values.length || 1)
  console.log(`\nParcours recalculés : ${changes.length} (${counts.changed} ${apply ? 'modifiés' : 'à modifier'}, ${counts.unchanged} inchangés)`)
  for (const [reason, count] of skipped) console.log(`Ignorés (${SKIP_REASONS[reason] ?? reason}) : ${count}`)
  console.log(`Échecs : ${failures.length}`)
  for (const failure of failures) console.log(`  ${failure}`)
  console.log(`Points Open-Meteo demandés : ${openMeteoPoints}`)
  if (compared.length) {
    console.log(`D+ moyen : ${format(mean(compared.map(change => change.before!)))} → ${format(mean(compared.map(change => change.after)))} m (${compared.length} parcours qui en avaient un)`)
  }
  const biggest = compared
    .filter(change => Math.round(change.before!) !== Math.round(change.after))
    .sort((a, b) => Math.abs(b.after - b.before!) - Math.abs(a.after - a.before!))
    .slice(0, 10)
  if (biggest.length) console.log('Plus grands écarts de D+ :')
  for (const change of biggest) {
    const percent = change.before ? ` (${Math.round((change.after - change.before!) / change.before! * 100)} %)` : ''
    console.log(`  ${change.name} [${change.source}] : ${format(change.before)} → ${format(change.after)} m${percent}`)
  }
}

main().catch((error) => {
  console.error((error as Error).message)
  process.exit(1)
})
