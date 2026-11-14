import type { RoutingLoopResponse } from '#shared/utils/routes'
import type { LoopTry } from '#shared/utils/loops'

// One proposal of automatic loop (#50): asked again with a corrected length until it is within the tolerance,
// each OpenRouteService call counting in the user's routing quota. Only the accepted loop gets measured elevations
// (#176), which don't count in the quota. A loop through a place and an out and back (#214) are routed through
// points placed by `loopRoutePoints` instead of an ORS round trip; an out and back only on its way out. Towards a
// named place out of reach (#293), the browser only sends its bearing. Several places (#326): `vias`, each within
// `namedPlaceReach` and the tour through them within the length, else refused before any ORS call.
export default defineEventHandler(async (event): Promise<RoutingLoopResponse> => {
  await requireUser(event)

  const { start, length_m, sport_type, seed, shape, precision, vias: asked, via, heading, prefer_paths } = await readLocalizedBody(event, routingLoopSchema)
  const vias = asked ?? (via ? [via] : [])
  const tolerance = LOOP_TOLERANCES[precision]
  const tooFar = vias.some(point => !isViaInReach(start, point, length_m, tolerance))
    || tourCrowM(shape, start, orderVias(shape, start, vias, point => point)) > maxTourCrowM(length_m, tolerance)
  if (tooFar) throw apiError(event, 422, 'api.loopViaTooFar')
  const offTarget = shape === 'out_and_back' ? 'api.outAndBackOffTarget' : 'api.loopOffTarget'
  // Paths preferred (#295): a profile that takes more of them, at no extra call.
  const profile = loopProfile(sport_type, prefer_paths)

  async function propose(requestedM: number) {
    const route = loopRoutePoints(shape, start, requestedM, seed, vias, heading)
    if (!route) return roundTrip(event, start, requestedM, sport_type, seed, profile)
    const leg = await routeThrough(event, route.points, route.radiuses, sport_type, profile)
    return shape === 'out_and_back' ? { ...leg, lengthM: 2 * leg.lengthM } : leg
  }

  const tries: LoopTry[] = []
  while (tries.length < LOOP_ATTEMPTS) {
    const remaining = await consumeRoutingQuota(event)
    const requestedM = nextLoopLength(length_m, tries)
    let loop
    try {
      loop = await propose(requestedM)
    }
    catch (error) {
      if (error instanceof NoRouteFoundError) throw apiError(event, 422, vias.length ? 'api.loopViaNotFound' : 'api.loopNotFound')
      throw error
    }
    if (isOnTarget(loop.lengthM, length_m, tolerance)) {
      // The way back of an out and back is the way out reversed: measured once.
      const measured = await withMeasuredElevations(event, loop.points)
      const track = shape === 'out_and_back' ? outAndBack(measured, loop.wayInfo) : { points: measured, wayInfo: loop.wayInfo }
      return {
        ...trackFields(track.points),
        ...(track.wayInfo ? { way_info: track.wayInfo } : {}),
        quota_remaining: remaining,
      }
    }
    // Already the shortest way through the places and back, and still too long: asking again would give the same route,
    // as for a foot-walking route to a peak only reached by mountain paths (31.6 km for a 10 km loop).
    if (vias.length && loop.lengthM > length_m && isShortestThrough(shape, start, requestedM, vias)) {
      throw apiError(event, 422, 'api.loopViaTooFar')
    }
    tries.push({ requestedM, lengthM: loop.lengthM })
  }
  throw apiError(event, 422, offTarget)
})
