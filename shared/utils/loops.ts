import { estimateDurationMin, type LngLat, LOOP_MAX_M, LOOP_MIN_M, type SportType, trackDistances } from './routes'

// Automatic loops (#50): OpenRouteService round trips only aim at the length they are given. Detours around
// rivers, hills and dead ends made test loops up to 2.5 times too long, so a loop is asked again, with a
// corrected length, until it is close enough.

// A loop is kept when its length is within 10 % of the one asked for.
export const LOOP_TOLERANCE = 0.1
// OpenRouteService calls for one proposal, each counted in the routing quota. Three calls gave a loop on target
// for 8 directions out of 10 around Grenoble, and every time in flat country.
export const LOOP_ATTEMPTS = 3
export const LOOP_PROPOSALS = 3

// Waypoints of a chosen loop: about every 2 km, 4 to 10 segments.
const LOOP_SEGMENT_M = 2000
const LOOP_MIN_SEGMENTS = 4
const LOOP_MAX_SEGMENTS = 10

export interface LoopTry {
  requestedM: number
  lengthM: number
}

export function isOnTarget(lengthM: number, targetM: number): boolean {
  return Math.abs(lengthM - targetM) <= LOOP_TOLERANCE * targetM
}

// The length to ask for next: the target first, then the last length scaled by how far off its loop was, or,
// after two tries, the line through them (when longer requests did give longer loops).
export function nextLoopLength(targetM: number, tries: LoopTry[]): number {
  const last = tries.at(-1)
  if (!last) return targetM
  let next = last.requestedM * targetM / last.lengthM
  const before = tries.at(-2)
  if (before) {
    const slope = (last.lengthM - before.lengthM) / (last.requestedM - before.requestedM)
    if (Number.isFinite(slope) && slope > 0) next = last.requestedM + (targetM - last.lengthM) / slope
  }
  const bounded = Math.min(Math.max(next, targetM / 4), targetM * 2)
  return Math.round(Math.min(Math.max(bounded, LOOP_MIN_M), LOOP_MAX_M))
}

// Distance covered in that time on the flat, at the member's pace (#146) or the sport's default one.
export function loopLengthForDuration(sport: SportType, minutes: number, paceMinPerKm?: number): number {
  return Math.round(minutes / estimateDurationMin(sport, 1000, null, paceMinPerKm) * 1000)
}

// Indices of the waypoints that split a loop into segments of about the same length, first and last point
// included: the chosen loop can then be edited like a drawn route.
export function loopWaypointIndices(coordinates: LngLat[]): number[] {
  const last = coordinates.length - 1
  if (last < 1) return [0, Math.max(last, 0)]
  const along = trackDistances(coordinates)
  const total = along[last]!
  const count = Math.min(last, Math.max(LOOP_MIN_SEGMENTS, Math.min(LOOP_MAX_SEGMENTS, Math.round(total / LOOP_SEGMENT_M))))
  const indices = [0]
  for (let k = 1; k < count; k++) {
    let i = indices.at(-1)! + 1
    while (i < last && along[i]! < (k * total) / count) i++
    if (i < last) indices.push(i)
  }
  indices.push(last)
  return indices
}
