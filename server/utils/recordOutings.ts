import type { serverSupabaseClient } from '#supabase/server'
import type { Database } from '#shared/types/database.types'
import type { RecordOuting } from '#shared/types/routes'
import { type BestEfforts, bestEfforts, bestEffortsAreFresh } from '#shared/utils/bestEfforts'
import { type OutingTrackPoint, SPORT_KINDS, type SportKind } from '#shared/utils/routes'
import type { Feeling } from '#shared/utils/trainingForm'

type Supabase = Awaited<ReturnType<typeof serverSupabaseClient<Database>>>

const OUTING_COLUMNS = 'id, route_id, started_at, duration_s, moving_s, distance_m, has_track, best_efforts, feeling, route:routes(name, sport_type, distance_m, elevation_gain_m)'
// Tracks are loaded this many at a time: up to 10,000 points each.
const TRACKS_PER_REQUEST = 10

// The member's own GPS outings, as their statistics and records count them, with their best efforts (#140).
// Outings whose best efforts were never worked out (recorded since, or before #140), were worked out by an
// older version or for another kind of sport (the route's sport changed) get them from their track now, kept
// on the row: a profile loads every track at most once. null when the outings can't be read.
export async function ownRecordedOutings(supabase: Supabase, userId: string): Promise<RecordOuting[] | null> {
  const { data, error } = await supabase.from('route_outings').select(OUTING_COLUMNS).eq('user_id', userId)
  if (!data) {
    console.error('[ownRecordedOutings]', error)
    return null
  }
  // A route its owner has since made private comes back without its route: skip it.
  const rows = data.filter(outing => outing.route)
  const efforts = await freshBestEfforts(supabase, rows.map(outing => ({
    id: outing.id,
    has_track: !!outing.has_track,
    best_efforts: outing.best_efforts,
    kind: SPORT_KINDS[outing.route!.sport_type],
  })))
  return rows.map(({ route, ...outing }) => ({
    sport_type: route!.sport_type,
    distance_m: route!.distance_m,
    elevation_gain_m: route!.elevation_gain_m,
    route_name: route!.name,
    route_id: outing.route_id,
    completed_at: outingEnd(outing.started_at, outing.duration_s),
    moving_s: outing.moving_s,
    outing_id: outing.id,
    covered_m: outing.distance_m,
    best_efforts: efforts.get(outing.id) ?? null,
    // The check constraint keeps it to FEELINGS.
    feeling: outing.feeling as Feeling | null,
  }))
}

type DoneRoute = Pick<RecordOuting, 'route_id' | 'completed_at' | 'route_name' | 'sport_type' | 'distance_m' | 'elevation_gain_m'>

// A route only marked as done, as the statistics and records count it: no GPS outing, so no times.
export function doneRecordOuting(route: DoneRoute): RecordOuting {
  return { ...route, moving_s: null, outing_id: null, covered_m: null, best_efforts: null }
}

interface StoredEfforts {
  id: string
  has_track: boolean
  best_efforts: unknown
  kind: SportKind
}

async function freshBestEfforts(supabase: Supabase, rows: StoredEfforts[]): Promise<Map<string, BestEfforts>> {
  const efforts = new Map<string, BestEfforts>()
  const stale: StoredEfforts[] = []
  for (const row of rows) {
    if (!row.has_track) continue
    if (bestEffortsAreFresh(row.best_efforts, row.kind)) efforts.set(row.id, row.best_efforts)
    else stale.push(row)
  }

  for (let i = 0; i < stale.length; i += TRACKS_PER_REQUEST) {
    const chunk = new Map(stale.slice(i, i + TRACKS_PER_REQUEST).map(row => [row.id, row.kind]))
    // The recorder's full points when the team sees them cut by privacy zones (#254).
    const { data, error } = await supabase.from('route_outings').select('id, track, original:outing_originals(track)').in('id', [...chunk.keys()])
    if (!data) {
      // The records then miss these outings' best times, until the next load.
      console.error('[freshBestEfforts] tracks', error)
      return efforts
    }
    await Promise.all(data.map(async ({ id, track: visible, original }) => {
      const track = original?.track ?? visible
      if (!Array.isArray(track) || track.length < 2) return
      const computed = bestEfforts(track as unknown as OutingTrackPoint[], chunk.get(id)!)
      efforts.set(id, computed)
      const saved = await supabase.from('route_outings').update({ best_efforts: computed }).eq('id', id)
      if (saved.error) console.error('[freshBestEfforts] save', saved.error)
    }))
  }
  return efforts
}
