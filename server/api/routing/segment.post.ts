import type { LngLatEle, RoutingSegmentResponse, WayInfo } from '#shared/utils/routes'

export default defineEventHandler(async (event): Promise<RoutingSegmentResponse> => {
  // Signed-in users only: the OpenRouteService quota is shared by the whole app.
  const user = await requireUser(event)

  const { from, to, mode, sport_type } = await readLocalizedBody(event, routingSegmentSchema)

  // Elevations come from the IGN (Open-Meteo abroad), not OpenRouteService (#176). Only routing counts in the quota.
  let points = null
  let wayInfo: WayInfo | null = null
  let remaining: number | undefined
  let snapped = mode === 'snap'
  if (snapped) {
    remaining = await consumeRoutingQuota(event)
    try {
      ({ points, wayInfo } = await routeAlongPaths(event, from, to, sport_type))
      // ORS's own elevations are kept when the measured ones fail or are slow.
      points = await withMeasuredElevations(event, points)
    }
    catch (error) {
      if (!(error instanceof NoRouteFoundError)) throw error
      snapped = false
    }
  }
  if (!points) {
    // A straight line has no elevations of its own to fall back on: when the services fail, the error reaches the
    // editor, which keeps the segment without elevations and says so.
    const line = sampleStraightLine(from, to)
    const elevations = await trackElevations(event, line)
    points = line.map(([lng, lat], i): LngLatEle => [lng, lat, elevations[i]!])
  }

  return {
    ...trackFields(points),
    snapped,
    ...(wayInfo ? { way_info: wayInfo } : {}),
    ...(remaining === undefined ? {} : { quota_remaining: remaining }),
  }
})
