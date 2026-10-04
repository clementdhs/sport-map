import * as z from 'zod'

// Live location sharing with the family during an outing (#46): the sharer's phone keeps one point every
// LIVE_POINT_INTERVAL_S and sends the ones not yet received every LIVE_SEND_INTERVAL_S (battery); the family's
// pages fetch new points every LIVE_POLL_INTERVAL_S. A share lasts LIVE_SHARE_MAX_HOURS at most
// (migration 20261004120000_live_shares.sql).
export const LIVE_POINT_INTERVAL_S = 30
export const LIVE_SEND_INTERVAL_S = 30
export const LIVE_POLL_INTERVAL_S = 20
export const LIVE_SHARE_MAX_HOURS = 12
// Beyond this, the family is told the last position is getting old.
export const LIVE_STALE_AFTER_MIN = 5
// Points sent at once: an hour without network, at one point every 30 s.
export const MAX_LIVE_POINTS_PER_SEND = 120

export const liveShareStartSchema = z.object({
  // The route followed, none when recording freely.
  route_id: z.uuid().nullish(),
})

export type LiveShareStartPayload = z.infer<typeof liveShareStartSchema>

export const livePointSchema = z.object({
  // When the GPS took the fix.
  fixed_at: z.iso.datetime({ offset: true }),
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  accuracy_m: z.number().min(0).max(100_000).nullish(),
})

export const livePointsSchema = z.object({
  points: z.array(livePointSchema).min(1).max(MAX_LIVE_POINTS_PER_SEND),
})

export type LivePointsPayload = z.infer<typeof livePointsSchema>

// Only the points taken after `after` (the latest one already received), to fetch the track bit by bit.
export const liveShareQuerySchema = z.object({
  after: z.iso.datetime({ offset: true }).optional(),
})
