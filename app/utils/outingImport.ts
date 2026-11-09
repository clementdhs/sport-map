import { distance } from '@turf/turf'
import type { RecordingPayload, SportType } from '#shared/utils/routes'
import { LocalizedError } from '~/utils/localizedError'
import {
  MAX_SPEED_MS,
  MIN_MOVING_SPEED_MS,
  MIN_STEP_M,
  outingTrack,
  recordingTrack,
  type RecordedPoint,
  type Recording,
} from '~/utils/recorder'

// Importing outings recorded by a watch or another app (#268): GPX, FIT and TCX files read in the browser, each
// becoming an outing like one recorded in /record. Pure functions, apart from reading the File itself.

export const OUTING_FILE_TYPES = ['gpx', 'fit', 'tcx'] as const
export type OutingFileType = typeof OUTING_FILE_TYPES[number]
export const OUTING_FILE_ACCEPT = OUTING_FILE_TYPES.map(type => `.${type}`).join(',')
// A 10 h outing with a point every second is about 5 MB of GPX.
export const MAX_OUTING_FILE_BYTES = 20 * 1024 * 1024

// One point of the file: position, altitude (m) when known, time (ms since epoch).
export interface OutingSample {
  lng: number
  lat: number
  alt: number | null
  t: number
}

// What the file says of the whole outing, when it says it (a FIT session, TCX laps); the points give the rest.
export interface OutingSummary {
  name: string | null
  sport: SportType | null
  startedAt?: number
  durationS?: number
  // Time the watch's timer ran (auto-pause and pauses left out)
  movingS?: number
  distanceM?: number
}

export interface ParsedOuting extends OutingSummary {
  samples: OutingSample[]
}

export interface ImportedOuting {
  name: string | null
  sport: SportType | null
  recording: Recording
  startedAt: number
  durationS: number
  movingS: number
  distanceM: number
}

export function outingFileType(name: string): OutingFileType | null {
  const dot = name.lastIndexOf('.')
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : null
  return OUTING_FILE_TYPES.find(type => type === extension) ?? null
}

// The sport named by a file, when it is one of ours: GPX <type> (Garmin and Strava words), TCX Sport, FIT sport
// and sub-sport. Anything else (swimming, "Other", old Strava numbers) gets the member's default sport.
export function importedSport(sport: string | null | undefined, subSport?: string | null): SportType | null {
  const value = (sport ?? '').toLowerCase().replace(/[\s-]+/g, '_')
  const sub = (subSport ?? '').toLowerCase()
  if (!value) return null
  if (value.includes('trail')) return 'trail'
  if (value.includes('run')) return sub === 'trail' ? 'trail' : 'running'
  if (value.includes('mountain_bik') || value.includes('mtb')) return 'mountain_biking'
  if (value.includes('road_bik') || value.includes('road_cycl')) return 'road_cycling'
  if (['cycl', 'bik', 'ride'].some(word => value.includes(word))) {
    if (sub === 'mountain') return 'mountain_biking'
    if (sub === 'road') return 'road_cycling'
    return 'cycling'
  }
  if (['hik', 'walk', 'mountaineering', 'snowshoe'].some(word => value.includes(word))) return 'hiking'
  return null
}

function altitude(value: number | null | undefined): number | null {
  // Outside the range a route accepts: a missing value written as a number (FIT's invalid 0xFFFF…).
  return typeof value === 'number' && Number.isFinite(value) && value >= -500 && value <= 9000 ? value : null
}

function number(text: string | null | undefined): number | null {
  if (text == null || text.trim() === '') return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

function xml(text: string): Document {
  const document = new DOMParser().parseFromString(text, 'application/xml')
  if (document.getElementsByTagName('parsererror').length) throw new LocalizedError('errors.importInvalid')
  return document
}

// Elements by local name, with or without a namespace, whatever its prefix.
function elements(parent: Document | Element, name: string): Element[] {
  return Array.from(parent.getElementsByTagName('*')).filter(element => element.localName === name)
}

function childText(parent: Element, name: string): string | null {
  for (const child of Array.from(parent.children)) {
    if (child.localName === name) return child.textContent?.trim() ?? null
  }
  return null
}

function sample(lng: number | null, lat: number | null, alt: number | null, time: string | null): OutingSample | null {
  const t = time ? Date.parse(time) : Number.NaN
  if (lng === null || lat === null || Number.isNaN(t)) return null
  if (Math.abs(lng) > 180 || Math.abs(lat) > 90) return null
  return { lng, lat, alt: altitude(alt), t }
}

export function parseGpxOuting(text: string): ParsedOuting {
  const document = xml(text)
  const track = elements(document, 'trk')[0]
  if (!track) throw new LocalizedError('errors.importNoTrack')
  // Every track of the file: some apps write one per lap, or a new one after a pause.
  const points = elements(document, 'trkpt')
  const samples = points
    .map(point => sample(number(point.getAttribute('lon')), number(point.getAttribute('lat')), number(childText(point, 'ele')), childText(point, 'time')))
    .filter(point => point !== null)
  // A track without times is a route drawn somewhere, not an outing.
  if (points.length && !samples.length) throw new LocalizedError('errors.importNoTimes')
  return {
    name: childText(track, 'name') || null,
    sport: importedSport(childText(track, 'type')),
    samples,
  }
}

export function parseTcxOuting(text: string): ParsedOuting {
  const document = xml(text)
  const activity = elements(document, 'Activity')[0]
  if (!activity) throw new LocalizedError('errors.importNoTrack')
  const laps = elements(activity, 'Lap')
  const samples = elements(activity, 'Trackpoint')
    .map((point) => {
      const position = elements(point, 'Position')[0]
      return sample(
        position ? number(childText(position, 'LongitudeDegrees')) : null,
        position ? number(childText(position, 'LatitudeDegrees')) : null,
        number(childText(point, 'AltitudeMeters')),
        childText(point, 'Time'),
      )
    })
    .filter(point => point !== null)
  const sum = (name: string) => {
    const values = laps.map(lap => number(childText(lap, name)))
    return values.length && values.every(value => value !== null) ? values.reduce((a, b) => a! + b!, 0)! : undefined
  }
  const startedAt = laps[0] ? Date.parse(laps[0].getAttribute('StartTime') ?? '') : Number.NaN
  return {
    name: null,
    sport: importedSport(activity.getAttribute('Sport')),
    startedAt: Number.isNaN(startedAt) ? undefined : startedAt,
    movingS: sum('TotalTimeSeconds'),
    distanceM: sum('DistanceMeters'),
    samples,
  }
}

// The fields of fit-file-parser's output that an outing needs.
interface FitRecord {
  timestamp?: Date | string
  position_lat?: number
  position_long?: number
  altitude?: number
  enhanced_altitude?: number
}
interface FitSession {
  start_time?: Date | string
  sport?: string | number
  sub_sport?: string | number
  total_elapsed_time?: number
  total_timer_time?: number
  total_distance?: number
}
export interface FitData {
  records?: FitRecord[]
  sessions?: FitSession[]
}

// fit-file-parser's output (positions in degrees, lengths in metres, times in seconds) as an outing.
export function fitOuting(data: FitData): ParsedOuting {
  const samples = (data.records ?? [])
    .map(record => sample(
      record.position_long ?? null,
      record.position_lat ?? null,
      altitude(record.enhanced_altitude) ?? record.altitude ?? null,
      record.timestamp ? new Date(record.timestamp).toISOString() : null,
    ))
    .filter(point => point !== null)
  // A multisport file (triathlon) has several sessions: the outing spans them all.
  const sessions = data.sessions ?? []
  const total = (key: 'total_elapsed_time' | 'total_timer_time' | 'total_distance') =>
    sessions.length && sessions.every(session => typeof session[key] === 'number')
      ? sessions.reduce((sum, session) => sum + session[key]!, 0)
      : undefined
  const first = sessions[0]
  const startedAt = first?.start_time ? new Date(first.start_time).getTime() : Number.NaN
  return {
    name: null,
    sport: first ? importedSport(String(first.sport ?? ''), String(first.sub_sport ?? '')) : null,
    startedAt: Number.isNaN(startedAt) ? undefined : startedAt,
    durationS: total('total_elapsed_time'),
    movingS: total('total_timer_time'),
    distanceM: total('total_distance'),
    samples,
  }
}

export async function parseFitOuting(buffer: ArrayBuffer): Promise<ParsedOuting> {
  // Loaded only when a FIT file is imported: most of its weight is the FIT profile.
  const { default: FitParser } = await import('fit-file-parser')
  let data: FitData
  try {
    data = await new FitParser({ force: true, mode: 'list' }).parseAsync(buffer) as FitData
  }
  catch {
    throw new LocalizedError('errors.importInvalid')
  }
  return fitOuting(data)
}

// The file's points through the rules of the GPS recording (`recorder.ts`): moves under MIN_STEP_M are jitter,
// faster than MAX_SPEED_MS are jumps, and time only counts as moving at MIN_MOVING_SPEED_MS or more. The totals
// the file gives (timer time, distance, elapsed time) win over those measured on the points.
export function importedOuting(parsed: ParsedOuting): ImportedOuting {
  const samples = [...parsed.samples].sort((a, b) => a.t - b.t)
  const points: RecordedPoint[] = []
  let distanceM = 0
  let movingMs = 0
  for (const point of samples) {
    const last = points.at(-1)
    if (!last) {
      points.push({ ...point, movingMs: 0 })
      continue
    }
    const stepM = distance([last.lng, last.lat], [point.lng, point.lat], { units: 'meters' })
    if (stepM < MIN_STEP_M) continue
    const dt = point.t - last.t
    if (dt <= 0 || stepM / (dt / 1000) > MAX_SPEED_MS) continue
    if (stepM / (dt / 1000) >= MIN_MOVING_SPEED_MS) movingMs += dt
    distanceM += stepM
    points.push({ ...point, movingMs })
  }
  if (points.length < 2) throw new LocalizedError('errors.importTooShort')

  // A point recorded before the file's own start moves the start back, and the elapsed time with it; the outing
  // runs at least to the file's last point, even one standing still at the finish.
  const startedAt = Math.min(parsed.startedAt ?? points[0]!.t, points[0]!.t)
  const shiftS = parsed.startedAt === undefined ? 0 : (parsed.startedAt - startedAt) / 1000
  const durationS = Math.round(Math.max((parsed.durationS ?? 0) + shiftS, (samples.at(-1)!.t - startedAt) / 1000))
  const movingS = Math.min(Math.round(parsed.movingS ?? movingMs / 1000), durationS)
  // The watch's timer time spread over the points' moving time, so the outing's splits add up to its moving time.
  const scale = movingMs > 0 ? movingS * 1000 / movingMs : 1
  const scaled = scale === 1 ? points : points.map(point => ({ ...point, movingMs: Math.min(point.movingMs! * scale, point.t - startedAt) }))
  const recording: Recording = { startedAt, points: scaled, distanceM, movingMs: movingS * 1000, gaps: 0, pausedAt: null, afterPause: false }
  return {
    name: parsed.name,
    sport: parsed.sport,
    recording,
    startedAt,
    durationS,
    movingS,
    distanceM: Math.round(parsed.distanceM ?? distanceM),
  }
}

export async function readOutingFile(file: File): Promise<ImportedOuting> {
  const type = outingFileType(file.name)
  if (!type) throw new LocalizedError('errors.importType')
  if (file.size > MAX_OUTING_FILE_BYTES) throw new LocalizedError('errors.importTooLarge')
  const parsed = type === 'fit' ? await parseFitOuting(await file.arrayBuffer()) : type === 'gpx' ? parseGpxOuting(await file.text()) : parseTcxOuting(await file.text())
  return importedOuting(parsed)
}

// The outing as POST /api/outings/import takes it, the payload of /record: a private route of the recorded
// track with the file's altitudes, and the outing's times and points.
export function importPayload(outing: ImportedOuting, defaults: { name: string, sport: SportType }): RecordingPayload {
  return {
    route: {
      name: outing.name?.slice(0, 120) || defaults.name,
      description: '',
      sport_type: outing.sport ?? defaults.sport,
      is_public: false,
      source: 'recorded',
      ...recordingTrack(outing.recording)!,
    },
    started_at: new Date(outing.startedAt).toISOString(),
    duration_s: outing.durationS,
    moving_s: outing.movingS,
    distance_m: outing.distanceM,
    track: outingTrack(outing.recording) ?? undefined,
  }
}
