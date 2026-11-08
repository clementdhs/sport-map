import { length, lineString } from '@turf/turf'
import type { LineString } from 'geojson'
import type { serverSupabaseClient } from '#supabase/server'
import type { Database, Json } from '#shared/types/database.types'
import { maskOutingTrack, maskRouteTrack } from '#shared/utils/privacyZones'
import type { MaskCircle, RouteTrack } from '#shared/utils/privacyZones'
import type { EditorState, LngLat, OutingTrackPoint, Poi, WayInfo } from '#shared/utils/routes'

// Privacy zones (#254, .claude/rules/privacy-zones.md): routes and route_outings hold what the team sees, the
// owner's full data of a masked route or outing is in route_originals / outing_originals (owner-only RLS).

type Supabase = Awaited<ReturnType<typeof serverSupabaseClient<Database>>>

// The circles cutting the caller's own tracks. Throws when they can't be read: saving unmasked would leak.
export async function loadMaskCircles(supabase: Supabase, userId: string): Promise<MaskCircle[]> {
  const { data, error } = await supabase.from('privacy_zones').select('mask_lng, mask_lat, radius_m').eq('owner_id', userId)
  if (error) throw error
  return data.map(zone => ({ center: [zone.mask_lng, zone.mask_lat], radiusM: zone.radius_m }))
}

export interface MaskedRouteColumns {
  // What goes in routes: the visible part, or the full track when nothing is cut or everything is hidden.
  route: TrackColumns & { privacy_masked: boolean, privacy_hidden: boolean }
  // What goes in route_originals: the full track, only when the routes row holds a cut one.
  original: TrackColumns | null
}

export function maskedRouteColumns(track: RouteTrack, circles: MaskCircle[]): MaskedRouteColumns {
  const masked = maskRouteTrack(track, circles)
  const full = trackColumns(track)
  if (masked.kind === 'trimmed') {
    return { route: { ...trackColumns(masked.track), privacy_masked: true, privacy_hidden: false }, original: full }
  }
  return { route: { ...full, privacy_masked: false, privacy_hidden: masked.kind === 'hidden' }, original: null }
}

// Keeps (or drops) a route's full data. The caller must own the route (RLS).
export async function saveRouteOriginal(supabase: Supabase, routeId: string, original: TrackColumns | null) {
  const { error } = original
    ? await supabase.from('route_originals').upsert({ route_id: routeId, ...original })
    : await supabase.from('route_originals').delete().eq('route_id', routeId)
  if (error) throw error
}

// Inserts a new route of the caller, cut by their zones. `full_distance_m` is the length of the whole track.
export async function insertMaskedRoute(
  supabase: Supabase,
  userId: string,
  row: ReturnType<typeof routeDetailsFromPayload>,
  track: RouteTrack,
) {
  let circles: MaskCircle[] = []
  try {
    circles = await loadMaskCircles(supabase, userId)
  }
  catch (error) {
    return { data: null, error, circles }
  }
  const { route, original } = maskedRouteColumns(track, circles)
  const { data, error } = await supabase.from('routes').insert({ owner_id: userId, ...row, ...route }).select('id, distance_m').single()
  if (error) return { data: null, error, circles }
  if (original) {
    try {
      await saveRouteOriginal(supabase, data.id, original)
    }
    catch (originalError) {
      // Without its full data, the owner would lose the hidden part: no route at all.
      await supabase.from('routes').delete().eq('id', data.id)
      return { data: null, error: originalError, circles }
    }
  }
  const fullDistanceM = original ? length(lineString(track.coordinates), { units: 'meters' }) : data.distance_m
  return { data: { id: data.id, full_distance_m: fullDistanceM }, error: null, circles }
}

export interface MaskedOutingColumns {
  track: OutingTrackPoint[] | null
  original: OutingTrackPoint[] | null
}

export function maskedOutingColumns(track: OutingTrackPoint[] | null | undefined, circles: MaskCircle[]): MaskedOutingColumns {
  if (!track) return { track: null, original: null }
  const masked = maskOutingTrack(track, circles)
  if (masked.kind === 'visible') return { track, original: null }
  return { track: masked.kind === 'trimmed' ? masked.track : null, original: track }
}

export async function saveOutingOriginal(supabase: Supabase, outingId: string, original: OutingTrackPoint[] | null) {
  const { error } = original
    ? await supabase.from('outing_originals').upsert({ outing_id: outingId, track: original as unknown as Json })
    : await supabase.from('outing_originals').delete().eq('outing_id', outingId)
  if (error) throw error
}

// The columns a route detail reads, and their full version for its owner (embedded, null for anyone else).
export const ORIGINAL_COLUMNS = 'original:route_originals(geometry:route_original_geojson, elevation_profile, elevation_gain_m, elevation_loss_m, distance_m, editor_state, pois, way_info)' as const

interface StoredTrack {
  geometry: unknown
  elevation_profile: unknown
  editor_state: unknown
  pois: unknown
  way_info: unknown
}

function toRouteTrack(row: StoredTrack): RouteTrack {
  const coordinates = (row.geometry as LineString).coordinates as LngLat[]
  const elevations = row.elevation_profile as number[] | null
  return {
    coordinates,
    elevations: elevations?.length === coordinates.length ? elevations : null,
    pois: (row.pois as Poi[] | null) ?? [],
    way_info: row.way_info as WayInfo | null,
    editor_state: row.editor_state as EditorState | null,
  }
}

const ROUTES_PER_REQUEST = 10
const OUTINGS_PER_REQUEST = 5

// Cuts every route and outing of the caller again with their current zones, after one was added or removed.
// Returns false when some could not be saved (logged): the next change of zones tries again.
export async function applyPrivacyZones(supabase: Supabase, userId: string): Promise<boolean> {
  const circles = await loadMaskCircles(supabase, userId)
  const [routesOk, outingsOk] = await Promise.all([remaskRoutes(supabase, userId, circles), remaskOutings(supabase, userId, circles)])
  return routesOk && outingsOk
}

async function remaskRoutes(supabase: Supabase, userId: string, circles: MaskCircle[]): Promise<boolean> {
  const { data: ids, error } = await supabase.from('routes').select('id').eq('owner_id', userId)
  if (error) {
    console.error('[applyPrivacyZones] routes', error)
    return false
  }
  let ok = true
  for (let i = 0; i < ids.length; i += ROUTES_PER_REQUEST) {
    const { data: rows, error: loadError } = await supabase
      .from('routes')
      .select(`id, privacy_masked, privacy_hidden, geometry:route_geojson, elevation_profile, editor_state, pois, way_info, ${ORIGINAL_COLUMNS}`)
      .in('id', ids.slice(i, i + ROUTES_PER_REQUEST).map(row => row.id))
    if (loadError) {
      console.error('[applyPrivacyZones] routes', loadError)
      ok = false
      continue
    }
    const results = await Promise.all(rows.map(async (row) => {
      const { route, original } = maskedRouteColumns(toRouteTrack(row.original ?? row), circles)
      // The team sees the same as before: nothing to write (a new geom would also clear the route's OSM places).
      const sameCut = route.privacy_masked === row.privacy_masked && route.privacy_hidden === row.privacy_hidden
        && (!route.privacy_masked || route.geom === toLineStringEwkt(toRouteTrack(row).coordinates))
      if (sameCut) return true
      try {
        // Full data first: should the routes update fail, the owner keeps it all and the team the old cut.
        if (original) await saveRouteOriginal(supabase, row.id, original)
        const { error: updateError } = await supabase.from('routes').update(route).eq('id', row.id)
        if (updateError) throw updateError
        if (!original) await saveRouteOriginal(supabase, row.id, null)
        return true
      }
      catch (saveError) {
        console.error('[applyPrivacyZones] route', row.id, saveError)
        return false
      }
    }))
    ok &&= results.every(Boolean)
  }
  return ok
}

async function remaskOutings(supabase: Supabase, userId: string, circles: MaskCircle[]): Promise<boolean> {
  const { data: list, error } = await supabase
    .from('route_outings')
    .select('id, has_track, original:outing_originals(outing_id)')
    .eq('user_id', userId)
  if (error) {
    console.error('[applyPrivacyZones] outings', error)
    return false
  }
  const ids = list.filter(outing => outing.has_track || outing.original).map(outing => outing.id)
  let ok = true
  for (let i = 0; i < ids.length; i += OUTINGS_PER_REQUEST) {
    const { data: rows, error: loadError } = await supabase
      .from('route_outings')
      .select('id, track, original:outing_originals(track)')
      .in('id', ids.slice(i, i + OUTINGS_PER_REQUEST))
    if (loadError) {
      console.error('[applyPrivacyZones] outings', loadError)
      ok = false
      continue
    }
    const results = await Promise.all(rows.map(async (row) => {
      const hadOriginal = !!row.original
      const full = (row.original?.track ?? row.track) as unknown as OutingTrackPoint[] | null
      const { track, original } = maskedOutingColumns(full, circles)
      if (!original && !hadOriginal) return true
      try {
        if (original) await saveOutingOriginal(supabase, row.id, original)
        const { error: updateError } = await supabase.from('route_outings').update({ track: track as unknown as Json }).eq('id', row.id)
        if (updateError) throw updateError
        if (!original) await saveOutingOriginal(supabase, row.id, null)
        return true
      }
      catch (saveError) {
        console.error('[applyPrivacyZones] outing', row.id, saveError)
        return false
      }
    }))
    ok &&= results.every(Boolean)
  }
  return ok
}
