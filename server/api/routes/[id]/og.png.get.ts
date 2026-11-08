import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import type { LineString } from 'geojson'
import { serverSupabaseServiceRole } from '#supabase/server'
import type { LngLat } from '#shared/utils/routes'

const FONTS = ['Inter-Regular.ttf', 'Inter-Bold.ttf']

// resvg only loads fonts from files: the bundled ones (server/assets/fonts) are copied to the
// temporary directory once per server instance.
let fontFiles: Promise<string[]> | undefined
function loadFonts(): Promise<string[]> {
  fontFiles ??= (async () => {
    const dir = join(tmpdir(), 'sport-map-fonts')
    await mkdir(dir, { recursive: true })
    return Promise.all(FONTS.map(async (name) => {
      const font = await useStorage('assets:server').getItemRaw<Buffer>(`fonts:${name}`)
      if (!font) throw new Error(`Missing font ${name}`)
      const path = join(dir, name)
      await writeFile(path, font)
      return path
    }))
  })().catch((error) => {
    fontFiles = undefined
    throw error
  })
  return fontFiles
}

// Link preview image of a route visible to the family: its title and track are shown to whoever has the link.
// Private routes get a 404 even for their owner, so that no cached copy of them can ever be served publicly.
export default defineEventHandler(async (event) => {
  const id = getRouteIdParam(event)
  // Set by the route page to its own language: link preview bots send no cookie.
  const { lang } = getQuery(event)
  // Bots send no session, and members-only policies would hide everything: only routes visible to the family
  // are read, through the filter below.
  const supabase = serverSupabaseServiceRole(event)
  const { data, error } = await supabase
    .from('routes')
    .select('name, sport_type, distance_m, elevation_gain_m, elevation_profile, geometry:route_geojson')
    .eq('id', id)
    .eq('is_public', true)
    // Entirely inside its owner's privacy zones (#254). Masked routes are cut in the row itself.
    .eq('privacy_hidden', false)
    .maybeSingle()

  if (error) {
    console.error('[GET /api/routes/:id/og.png]', error)
    throw apiError(event, 500, 'api.ogImageFailed')
  }
  if (!data) throw apiError(event, 404, 'api.routeNotFound')

  const svg = buildRouteOgSvg({
    name: data.name,
    sport: data.sport_type,
    distanceM: data.distance_m,
    elevationGainM: data.elevation_gain_m,
    coordinates: (data.geometry as unknown as LineString).coordinates as LngLat[],
    elevations: data.elevation_profile as number[] | null,
  }, isMessageLocale(lang) ? lang : getRequestLocale(event))
  const png = new Resvg(svg, {
    font: { loadSystemFonts: false, fontFiles: await loadFonts(), defaultFontFamily: 'Inter' },
  }).render().asPng()

  // The page links the image with ?v=<last update>, so a cached copy is replaced as soon as the route
  // changes. The short lifetime bounds how long an image stays reachable after a route turns private.
  setResponseHeaders(event, {
    'Content-Type': 'image/png',
    'Cache-Control': 'public, max-age=3600, s-maxage=3600',
  })
  return png
})
