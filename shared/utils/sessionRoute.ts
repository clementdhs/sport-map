import type { SessionPlan } from './coachSessions'
import { rankByGain } from './loops'
import { type LngLat, LOOP_MAX_M, LOOP_MIN_M, smoothByDistance, trackDistances } from './routes'
import { type Climb, climbs } from './slopes'

// The route of the session of the day (#266): loops generated from home at the session's distance, ranked by its
// gain and, for hill repeats, by the climbs they go through.

// A climb fits a hill repeat when it is at least this share of one effort's length and of its grade: steeper or
// longer is fine, the member runs the effort's time of it.
const LENGTH_SHARE = 0.8
const GRADE_SHARE = 0.6
// A climb starts where it has gained this share of its gain: the smoothing rounds its foot off.
const RISE_SHARE = 0.03

export type SessionHill = {
  // One effort uphill: its length (m) and grade (%)
  lengthM: number
  grade: number
  // How many repeats
  count: number
}

// Whether a session has a route to trace: not on rest and race days, nor out of the loop generator's range.
export function hasSessionRoute(plan: SessionPlan): boolean {
  return plan.minutes > 0 && plan.kind !== 'raceDay' && plan.distanceM >= LOOP_MIN_M && plan.distanceM <= LOOP_MAX_M
}

// The hill a session's repeats need, null for a session without hill repeats.
export function sessionHill(plan: SessionPlan): SessionHill | null {
  if (!plan.reps?.hill) return null
  const effort = plan.blocks.find(block => block.kind === 'effort')
  if (!effort || effort.distanceM <= 0) return null
  return { lengthM: effort.distanceM, grade: (effort.gainM / effort.distanceM) * 100, count: plan.reps.count }
}

// The climbs of a track long and steep enough for the session's hill, in order. Found with a gain and a tolerance
// of dips sized on that hill (a short hill gains about 10 m, under climbs()'s default 20 m tolerance), each
// starting where it really rises: climbs() starts it at the low point, which a flat stretch before drags back.
export function sessionClimbs(coordinates: LngLat[], elevations: number[], hill: SessionHill): Climb[] {
  if (coordinates.length < 2 || elevations.length !== coordinates.length) return []
  const gainM = (hill.lengthM * hill.grade) / 100
  const along = trackDistances(coordinates)
  const smoothed = smoothByDistance(coordinates, elevations)
  const index = (meters: number) => along.findIndex(value => value >= meters - 0.01)
  return climbs(coordinates, elevations, along, Math.max(4, gainM * 0.4), Math.min(20, Math.max(3, gainM * 0.5)))
    .map((climb) => {
      const top = index(climb.endM)
      let start = index(climb.startM)
      const rises = smoothed[start]! + Math.max(0.5, climb.gainM * RISE_SHARE)
      while (start + 1 < top && smoothed[start + 1]! <= rises) start++
      const lengthM = along[top]! - along[start]!
      const gain = smoothed[top]! - smoothed[start]!
      return { startM: along[start]!, endM: along[top]!, gainM: gain, averageGrade: lengthM > 0 ? (gain / lengthM) * 100 : 0 }
    })
    .filter(climb => climb.endM - climb.startM >= hill.lengthM * LENGTH_SHARE && climb.averageGrade >= hill.grade * GRADE_SHARE)
}

// Named: an inline type would hide the next export from the auto-imports (see CLAUDE.md).
type SessionProposal = { status: string, distanceM: number, gainM: number | null, climbs: Climb[] | null }

// The session's gain per km (m), the target of rankByGain.
export function sessionGainPerKm(plan: SessionPlan): number {
  return plan.distanceM > 0 ? (plan.gainM / plan.distanceM) * 1000 : 0
}

// Proposals for a session, best first. The server already brings each loop within 10 % of the session's distance,
// so they are ranked by their gain per km against the session's (rankByGain); for hill repeats, the climbs the
// session lacks come first: a loop with its 4 hills beats a closer gain without them. Missing proposals last.
export function rankForSession<T extends SessionProposal>(proposals: T[], plan: SessionPlan): T[] {
  const byGain = rankByGain(proposals, sessionGainPerKm(plan))
  const hill = sessionHill(plan)
  if (!hill) return byGain
  const missing = (proposal: T) => proposal.status === 'ready' ? Math.max(0, hill.count - (proposal.climbs?.length ?? 0)) : hill.count + 1
  return byGain
    .map((proposal, index) => ({ proposal, index }))
    .sort((a, b) => missing(a.proposal) - missing(b.proposal) || a.index - b.index)
    .map(({ proposal }) => proposal)
}

export type ClimbsSummary = {
  count: number
  // Mean length (m, by 50 m) and grade (%, whole) of the climbs
  lengthM: number
  grade: number
}

// "4 côtes · 7 %": how many climbs and how steep on average; null without any.
export function climbsSummary(found: Climb[]): ClimbsSummary | null {
  if (!found.length) return null
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
  return {
    count: found.length,
    lengthM: Math.max(50, Math.round(mean(found.map(climb => climb.endM - climb.startM)) / 50) * 50),
    grade: Math.round(mean(found.map(climb => climb.averageGrade))),
  }
}

// The stretch of a track between two distances along it (a climb's start and top), to draw it on the map.
export function trackStretch(coordinates: LngLat[], startM: number, endM: number): LngLat[] {
  const along = trackDistances(coordinates)
  return coordinates.filter((_, i) => along[i]! >= startM - 0.01 && along[i]! <= endM + 0.01)
}
