import type { LivePoint } from '#shared/types/live'
import { LIVE_POINT_INTERVAL_S, LIVE_SEND_INTERVAL_S, LIVE_SHARE_MAX_HOURS, LIVE_STALE_AFTER_MIN, MAX_LIVE_POINTS_PER_SEND } from '#shared/utils/live'
import type { GpsFix } from '~/composables/useWatchPosition'

// The points of a live share not yet received by the server. Pure functions over a plain state: the phone
// keeps one point every LIVE_POINT_INTERVAL_S and sends the waiting ones in order, so that a track cut by a
// network gap is filled in once the network is back.

// Fixes less accurate than this are skipped: a wrong place on the family's map is worse than an older one.
export const LIVE_MAX_ACCURACY_M = 100
// A whole share's worth of points at most; beyond, the oldest waiting ones are dropped.
const MAX_PENDING_POINTS = (LIVE_SHARE_MAX_HOURS * 3600) / LIVE_POINT_INTERVAL_S

export interface LiveQueue {
  // When the latest point was kept (ms)
  lastKeptAt: number | null
  pending: LivePoint[]
}

export const emptyLiveQueue = (): LiveQueue => ({ lastKeptAt: null, pending: [] })

export function keepLivePoint(queue: LiveQueue, fix: GpsFix, now: number): LiveQueue {
  if (fix.accuracyM > LIVE_MAX_ACCURACY_M) return queue
  if (queue.lastKeptAt !== null && now - queue.lastKeptAt < LIVE_POINT_INTERVAL_S * 1000) return queue
  const [lng, lat] = fix.position
  const point: LivePoint = { fixed_at: new Date(now).toISOString(), lng, lat, accuracy_m: Math.round(fix.accuracyM) }
  return { lastKeptAt: now, pending: [...queue.pending, point].slice(-MAX_PENDING_POINTS) }
}

// The oldest waiting points, as many as one request takes.
export const nextLiveBatch = (queue: LiveQueue): LivePoint[] => queue.pending.slice(0, MAX_LIVE_POINTS_PER_SEND)

// Once a batch is received: its points (and any older one) stop waiting. By time rather than by count, in case
// the oldest waiting points were dropped meanwhile. ISO times from toISOString compare as strings.
export function acknowledgeLivePoints(queue: LiveQueue, sent: LivePoint[]): LiveQueue {
  const last = sent.at(-1)?.fixed_at
  if (!last) return queue
  return { ...queue, pending: queue.pending.filter(point => point.fixed_at > last) }
}

// Sending again once LIVE_SEND_INTERVAL_S has passed since the last try, whether it worked or not (battery).
export const liveSendDue = (lastTryAt: number | null, now: number): boolean =>
  lastTryAt === null || now - lastTryAt >= LIVE_SEND_INTERVAL_S * 1000

// The family's side: points fetched since the latest one already shown, added once each. Times come from
// Postgres ("…+00:00", trimmed milliseconds): compared as dates.
export function mergeLivePoints(shown: LivePoint[], fetched: LivePoint[]): LivePoint[] {
  const last = shown.at(-1)?.fixed_at
  const newer = last ? fetched.filter(point => Date.parse(point.fixed_at) > Date.parse(last)) : fetched
  return newer.length ? [...shown, ...newer] : shown
}

// The latest position is getting old: no network, or the phone has stopped.
export const liveIsStale = (lastFixedAt: string, now: number): boolean =>
  now - Date.parse(lastFixedAt) > LIVE_STALE_AFTER_MIN * 60_000
