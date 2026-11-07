import type { RecordOuting } from '../types/routes'
import { DISTANCE_EFFORTS, HOUR_EFFORT_KINDS } from './bestEfforts'
import { localDate } from './outings'
import { SPORT_KINDS, SPORT_TYPES, type SportType } from './routes'

// Personal records of a member (#140), from the outings of their statistics: the longest outing (the GPS
// distance of a recorded one, the route's for one only marked as done), the biggest gain and the longest moving time, and the best times of each sport (DISTANCE_EFFORTS) from the best efforts
// kept with each GPS outing. Ties go to the earliest outing: it got there first.

export type RecordMetric = 'distance' | 'gain' | 'moving' | 'time' | 'hour'

// What a record is of: a metric, and for best times which distance (an effort id).
export interface RecordKind {
  metric: RecordMetric
  effort: string | null
}

export interface PersonalRecord extends RecordKind {
  // Unique within a list of records
  key: string
  // The sport of best times and best hours, null for the other records
  sport: SportType | null
  // Distance of a best time (m)
  meters: number | null
  // Metres for distance, gain and hour, seconds for moving time and best times
  value: number
  outing: RecordOuting
}

type Candidate = Omit<PersonalRecord, 'outing'>

const HIGHER_IS_BETTER: Record<RecordMetric, boolean> = { distance: true, gain: true, moving: true, time: false, hour: true }

// The records an outing could hold. `perSport` keys the longest outing, gain and duration by sport too.
function candidates(outing: RecordOuting, perSport: boolean): Candidate[] {
  const sport = outing.sport_type
  const scope = perSport ? `:${sport}` : ''
  const list: Candidate[] = [
    { key: `distance${scope}`, metric: 'distance', effort: null, sport: null, meters: null, value: outing.covered_m ?? outing.distance_m },
  ]
  if (outing.elevation_gain_m) {
    list.push({ key: `gain${scope}`, metric: 'gain', effort: null, sport: null, meters: null, value: outing.elevation_gain_m })
  }
  if (outing.moving_s) {
    list.push({ key: `moving${scope}`, metric: 'moving', effort: null, sport: null, meters: null, value: outing.moving_s })
  }
  const efforts = outing.best_efforts
  // Efforts computed for another kind of sport would compare with nothing of this one.
  if (!efforts || efforts.kind !== SPORT_KINDS[sport]) return list
  for (const { id, meters } of DISTANCE_EFFORTS[efforts.kind]) {
    const time = efforts.times[id]
    if (time) list.push({ key: `time:${sport}:${id}`, metric: 'time', effort: id, sport, meters, value: time })
  }
  if (HOUR_EFFORT_KINDS.includes(efforts.kind) && efforts.hour_m) {
    list.push({ key: `hour:${sport}`, metric: 'hour', effort: null, sport, meters: null, value: efforts.hour_m })
  }
  return list
}

// The translation key that names a record.
export function recordLabelKey({ metric, effort }: RecordKind): string {
  return metric === 'time' ? `records.efforts.${effort}` : `records.metrics.${metric}`
}

const better = (metric: RecordMetric, value: number, than: number) => (HIGHER_IS_BETTER[metric] ? value > than : value < than)
const chronological = (outings: RecordOuting[]) => [...outings].sort((a, b) => a.completed_at.localeCompare(b.completed_at))

// The years with outings, latest first.
export function recordYears(outings: RecordOuting[]): number[] {
  return [...new Set(outings.map(outing => Number(localDate(outing.completed_at).slice(0, 4))))].sort((a, b) => b - a)
}

// The records of a sport (or every sport) in a year (French, like the statistics) or ever: the longest outing,
// gain and duration first, then the best times of each sport in the order of SPORT_TYPES and of their distances.
export function personalRecords(outings: RecordOuting[], sport: SportType | 'all', year: number | 'all'): PersonalRecord[] {
  const best = new Map<string, PersonalRecord>()
  for (const outing of chronological(outings)) {
    if (sport !== 'all' && outing.sport_type !== sport) continue
    if (year !== 'all' && !localDate(outing.completed_at).startsWith(String(year))) continue
    for (const candidate of candidates(outing, false)) {
      const held = best.get(candidate.key)
      if (!held || better(candidate.metric, candidate.value, held.value)) best.set(candidate.key, { ...candidate, outing })
    }
  }
  const order = (record: PersonalRecord) => {
    if (!record.sport) return ['distance', 'gain', 'moving'].indexOf(record.metric)
    const kind = SPORT_KINDS[record.sport]
    const effort = record.metric === 'hour'
      ? DISTANCE_EFFORTS[kind].length
      : DISTANCE_EFFORTS[kind].findIndex(e => e.id === record.effort)
    return 10 + SPORT_TYPES.indexOf(record.sport) * 10 + effort
  }
  return [...best.values()].sort((a, b) => order(a) - order(b))
}

// The GPS outings that beat one of the member's records, in their sport, when they were recorded: the first
// outing of a kind sets a record without beating any. By outing id.
export function recordBreakers(outings: RecordOuting[]): Record<string, RecordKind[]> {
  const best = new Map<string, number>()
  const breakers: Record<string, RecordKind[]> = {}
  for (const outing of chronological(outings)) {
    for (const { key, metric, effort, value } of candidates(outing, true)) {
      const held = best.get(key)
      if (held !== undefined && !better(metric, value, held)) continue
      best.set(key, value)
      if (held === undefined || !outing.outing_id) continue
      breakers[outing.outing_id] = [...(breakers[outing.outing_id] ?? []), { metric, effort }]
    }
  }
  return breakers
}

// Days during which a record wears the yellow "Record !" badge on the profile (#236).
export const RECENT_RECORD_DAYS = 30

// Whether a record was set less than RECENT_RECORD_DAYS ago.
export function isRecentRecord(completedAt: string, now: Date): boolean {
  const age = now.getTime() - new Date(completedAt).getTime()
  return age >= 0 && age < RECENT_RECORD_DAYS * 86_400_000
}
