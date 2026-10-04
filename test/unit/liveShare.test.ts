import { describe, expect, it } from 'vitest'
import { MAX_LIVE_POINTS_PER_SEND } from '#shared/utils/live'
import type { GpsFix } from '~/composables/useWatchPosition'
import { acknowledgeLivePoints, emptyLiveQueue, keepLivePoint, liveIsStale, liveSendDue, mergeLivePoints, nextLiveBatch, type LiveQueue } from '~/utils/liveShare'

const T0 = Date.parse('2026-10-04T08:00:00Z')
const fix = (lat: number, accuracyM = 5): GpsFix =>
  ({ position: [6.12, lat], accuracyM, altitudeM: null, headingDeg: null, speedMps: null })

// One fix a second for `seconds`, from `start` (ms).
function walk(queue: LiveQueue, start: number, seconds: number): LiveQueue {
  for (let s = 0; s < seconds; s++) queue = keepLivePoint(queue, fix(45.9 + s / 1e5), start + s * 1000)
  return queue
}

describe('keepLivePoint', () => {
  it('keeps one point every 30 s, timed and rounded', () => {
    const queue = walk(emptyLiveQueue(), T0, 95)
    expect(queue.pending.map(point => point.fixed_at)).toEqual([
      '2026-10-04T08:00:00.000Z', '2026-10-04T08:00:30.000Z', '2026-10-04T08:01:00.000Z', '2026-10-04T08:01:30.000Z',
    ])
    expect(queue.pending[1]).toMatchObject({ lng: 6.12, lat: 45.9003, accuracy_m: 5 })
  })

  it('skips fixes too inaccurate to place the member', () => {
    const queue = keepLivePoint(emptyLiveQueue(), fix(45.9, 250), T0)
    expect(queue.pending).toEqual([])
    expect(keepLivePoint(queue, fix(45.9, 20), T0 + 1000).pending).toHaveLength(1)
  })

  it('keeps at most a whole share of waiting points, dropping the oldest', () => {
    const queue = walk(emptyLiveQueue(), T0, 13 * 3600)
    expect(queue.pending).toHaveLength(1440)
    expect(queue.pending[0]!.fixed_at).toBe('2026-10-04T09:00:00.000Z')
  })
})

describe('sending the waiting points', () => {
  it('sends them oldest first, by batches, and forgets those received', () => {
    let queue = walk(emptyLiveQueue(), T0, 2 * 3600)
    const batch = nextLiveBatch(queue)
    expect(batch).toHaveLength(MAX_LIVE_POINTS_PER_SEND)
    expect(batch[0]!.fixed_at).toBe('2026-10-04T08:00:00.000Z')
    queue = acknowledgeLivePoints(queue, batch)
    expect(queue.pending).toHaveLength(240 - MAX_LIVE_POINTS_PER_SEND)
    expect(queue.pending[0]!.fixed_at).toBe('2026-10-04T09:00:00.000Z')
  })

  it('keeps the points taken while a batch was on its way', () => {
    let queue = walk(emptyLiveQueue(), T0, 61)
    const batch = nextLiveBatch(queue)
    queue = keepLivePoint(queue, fix(45.91), T0 + 90_000)
    expect(acknowledgeLivePoints(queue, batch).pending.map(point => point.lat)).toEqual([45.91])
  })

  it('tries again every 30 s', () => {
    expect(liveSendDue(null, T0)).toBe(true)
    expect(liveSendDue(T0, T0 + 29_000)).toBe(false)
    expect(liveSendDue(T0, T0 + 30_000)).toBe(true)
  })
})

describe('the family side', () => {
  const at = (minute: number) => ({ fixed_at: `2026-10-04T08:0${minute}:00.000Z`, lng: 6.12, lat: 45.9 + minute / 1000, accuracy_m: 5 })

  it('adds the fetched points once each, in order', () => {
    const shown = [at(0), at(1)]
    expect(mergeLivePoints(shown, [at(1), at(2), at(3)])).toEqual([at(0), at(1), at(2), at(3)])
    // As Postgres writes them.
    expect(mergeLivePoints(shown, [{ ...at(1), fixed_at: '2026-10-04T08:01:00+00:00' }, { ...at(2), fixed_at: '2026-10-04T08:02:00.5+00:00' }])).toHaveLength(3)
    expect(mergeLivePoints(shown, [at(1)])).toBe(shown)
    expect(mergeLivePoints([], [at(0)])).toEqual([at(0)])
  })

  it('tells when the latest position is more than 5 minutes old', () => {
    expect(liveIsStale(at(0).fixed_at, T0 + 5 * 60_000)).toBe(false)
    expect(liveIsStale(at(0).fixed_at, T0 + 5 * 60_000 + 1)).toBe(true)
  })
})
