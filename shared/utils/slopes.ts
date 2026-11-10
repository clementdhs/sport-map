import { type LngLat, smoothByDistance, trackDistances } from './routes'

// Slopes along a route: grades computed on smoothed elevations (the elevation model is noisy), classes to
// colour the track and the elevation profile, the steepest grade and the main climb.

// Grades are measured over this distance, centred on each point. 100 m still let elevation model artefacts through
// (45 % where a hollow and a jump of the model follow each other on a real route); 200 m reads real steep paths.
const GRADE_WINDOW_M = 200
// A climb goes on through dips smaller than this.
const CLIMB_TOLERANCE_M = 20
// Below this gain, a route has no climb worth a summary.
const MIN_CLIMB_GAIN_M = 30

// One hue from light to dark (dataviz ordinal ramp, validated on white and on the dark surface).
// Each class covers grades from the previous class's max up to its own (labels: slopes.<key>).
export const SLOPE_CLASSES = [
  { max: 5, key: 'under5', color: '#fe9a00' },
  { max: 10, key: 'from5to10', color: '#f54900' },
  { max: 15, key: 'from10to15', color: '#c10007' },
  { max: Infinity, key: 'over15', color: '#9f0712' },
] as const

export interface SlopeProfile {
  // Distance from the start (m) at each point
  along: number[]
  // Signed grade (%) at each point: positive uphill
  grades: number[]
}

export interface SlopeRun {
  startM: number
  endM: number
  // Index in SLOPE_CLASSES
  slopeClass: number
}

export interface Climb {
  startM: number
  endM: number
  gainM: number
  averageGrade: number
}

export function slopeClass(grade: number): number {
  return SLOPE_CLASSES.findIndex(c => Math.abs(grade) < c.max)
}

// Smoothed elevation at any distance along the track, interpolated between the points around it.
function elevationAt(along: number[], smoothed: number[], meters: number): number {
  let low = 0
  let high = along.length - 1
  while (high - low > 1) {
    const mid = (low + high) >> 1
    if (along[mid]! <= meters) low = mid
    else high = mid
  }
  const span = along[high]! - along[low]!
  const t = span > 0 ? Math.min(1, Math.max(0, (meters - along[low]!) / span)) : 0
  return smoothed[low]! + (smoothed[high]! - smoothed[low]!) * t
}

// Grades over a fixed GRADE_WINDOW_M, interpolated: with points far apart, measuring between the nearest
// points only would divide a steep step by a few meters and report absurd grades (95 % on a real route).
export function slopeProfile(coordinates: LngLat[], elevations: number[]): SlopeProfile {
  const along = trackDistances(coordinates)
  const smoothed = smoothByDistance(coordinates, elevations)
  const totalM = along.at(-1)!
  const half = GRADE_WINDOW_M / 2
  const grades = along.map((position) => {
    const from = Math.max(0, position - half)
    const to = Math.min(totalM, position + half)
    return to > from ? ((elevationAt(along, smoothed, to) - elevationAt(along, smoothed, from)) / (to - from)) * 100 : 0
  })
  return { along, grades }
}

// Consecutive stretches of the same slope class, to colour the track.
export function slopeRuns({ along, grades }: SlopeProfile): SlopeRun[] {
  const runs: SlopeRun[] = []
  grades.forEach((grade, i) => {
    const cls = slopeClass(grade)
    const last = runs.at(-1)
    if (last && last.slopeClass === cls) last.endM = along[i]!
    else runs.push({ startM: last ? last.endM : 0, endM: along[i]!, slopeClass: cls })
  })
  return runs
}

// The steepest uphill grade (%), rounded.
export function steepestGrade({ grades }: SlopeProfile): number {
  return Math.round(Math.max(0, ...grades))
}

// Climbs along the track, in order: each starts at a low point and goes on until the elevation falls more than
// CLIMB_TOLERANCE_M (or toleranceM: the coach's short hill repeats gain less than that) below its highest point.
// Only those gaining at least minGainM.
export function climbs(coordinates: LngLat[], elevations: number[], along: number[], minGainM = MIN_CLIMB_GAIN_M, toleranceM = CLIMB_TOLERANCE_M): Climb[] {
  const smoothed = smoothByDistance(coordinates, elevations)
  const found: Climb[] = []
  let start = 0
  let top = 0
  const close = () => {
    const gainM = smoothed[top]! - smoothed[start]!
    const lengthM = along[top]! - along[start]!
    if (gainM >= minGainM && lengthM > 0) {
      found.push({ startM: along[start]!, endM: along[top]!, gainM, averageGrade: (gainM / lengthM) * 100 })
    }
  }
  for (let i = 1; i < smoothed.length; i++) {
    if (smoothed[i]! > smoothed[top]!) top = i
    else if (smoothed[top]! - smoothed[i]! > toleranceM) {
      close()
      start = i
      top = i
    }
    // A lower point before any real gain: the climb starts there instead.
    if (smoothed[i]! < smoothed[start]!) {
      start = i
      top = i
    }
  }
  close()
  return found
}

// The climb with the largest gain, null when no climb gains MIN_CLIMB_GAIN_M.
export function mainClimb(coordinates: LngLat[], elevations: number[], along: number[]): Climb | null {
  return climbs(coordinates, elevations, along).reduce<Climb | null>((best, c) => (!best || c.gainM > best.gainM ? c : best), null)
}

// MapLibre line-gradient colouring the track with each stretch's colour, in order along the track (requires
// lineMetrics on the source).
export function lineGradient(stretches: { startM: number, color: string }[], totalM: number, fallback: string): unknown[] {
  if (!stretches.length || totalM <= 0) return ['literal', fallback]
  const expression: unknown[] = ['step', ['line-progress'], stretches[0]!.color]
  let lastStop = 0
  for (const stretch of stretches.slice(1)) {
    const progress = Math.min(1, Math.max(0, stretch.startM / totalM))
    // Stops must strictly increase: a stretch shorter than the rounding is merged into the previous one.
    if (progress > lastStop) {
      expression.push(progress, stretch.color)
      lastStop = progress
    }
  }
  // A step without stops is refused by MapLibre: a track in one colour is that colour.
  return expression.length > 3 ? expression : ['literal', expression[2]]
}

// The track coloured by slope class.
export function slopeGradient(runs: SlopeRun[], totalM: number): unknown[] {
  const stretches = runs.map(run => ({ startM: run.startM, color: SLOPE_CLASSES[run.slopeClass]!.color }))
  return lineGradient(stretches, totalM, SLOPE_CLASSES[0].color)
}
