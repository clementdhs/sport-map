import { type SportType, SPORT_KINDS, type WayInfo, type WayRange } from './routes'
import { lineGradient } from './slopes'

// The ways along a route (#43), from OpenRouteService's extra info (stored as WayInfo): classes to sum up the
// route and colour its track. Values: https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/extra-info/

// Where nothing is known: ORS has no tag, or the part was not snapped (straight line, GPX, older route).
const UNKNOWN_COLOR = '#898781'

// Categorical slots 1 to 3 of the dataviz palette (validated all-pairs on the light and dark surfaces), in order.
export const SURFACE_CLASSES = [
  { key: 'paved', color: '#2a78d6' },
  { key: 'unpaved', color: '#d95926' },
  { key: 'trail', color: '#199e70' },
  { key: 'unknown', color: UNKNOWN_COLOR },
] as const

// One hue from light to easy to dark to hard (dataviz ordinal ramp, validated on both surfaces).
const DIFFICULTY_COLORS = ['#6da7ec', '#3987e5', '#256abf', '#184f95'] as const

// SAC hiking scale (values 1–6 = T1–T6) for walking sports, MTB scale (values 1–7 = S0–S6) for cycling ones; the
// hardest grades, rare and alike for a family outing, share the last class.
export const DIFFICULTY_CLASSES = {
  sac: [
    ...(['t1', 't2', 't3', 't4plus'] as const).map((key, i) => ({ key, color: DIFFICULTY_COLORS[i]! })),
    { key: 'unknown', color: UNKNOWN_COLOR },
  ],
  mtb: [
    ...(['s0', 's1', 's2', 's3plus'] as const).map((key, i) => ({ key, color: DIFFICULTY_COLORS[i]! })),
    { key: 'unknown', color: UNKNOWN_COLOR },
  ],
} as const

export type DifficultyScale = keyof typeof DIFFICULTY_CLASSES

export function difficultyScale(sport: SportType): DifficultyScale {
  return SPORT_KINDS[sport] === 'ride' ? 'mtb' : 'sac'
}

// surface: 1 paved, 3 asphalt, 4 concrete, 5 cobblestone, 6 metal, 7 wood, 14 paving stones; the other non-zero
// values are loose surfaces (gravel, dirt, ground, grass, sand…).
const PAVED_SURFACES = new Set([1, 3, 4, 5, 6, 7, 14])
// waytype: 1 state road, 2 road, 3 street (residential, service), 4 path, 5 track, 6 cycleway, 7 footway, 8 steps.
const ROAD_WAYTYPES = new Set([1, 2, 3])
const PATH_WAYTYPE = 4
const TRACK_WAYTYPE = 5
const NARROW_WAYTYPES = new Set([4, 7, 8])

const [PAVED, UNPAVED, TRAIL, UNKNOWN_SURFACE] = [0, 1, 2, 3]

// Index in SURFACE_CLASSES. A loose surface is a trail on narrow ways, otherwise a dirt road. Without a surface
// tag, roads count as paved (in France they nearly always are), paths as trails and tracks as dirt roads; other
// ways stay unknown (footways and cycleways are paved in towns, not in the countryside).
export function surfaceClass(surface: number | undefined, waytype: number | undefined): number {
  if (surface && PAVED_SURFACES.has(surface)) return PAVED
  if (surface) return waytype !== undefined && NARROW_WAYTYPES.has(waytype) ? TRAIL : UNPAVED
  if (waytype === undefined) return UNKNOWN_SURFACE
  if (ROAD_WAYTYPES.has(waytype)) return PAVED
  if (waytype === PATH_WAYTYPE) return TRAIL
  if (waytype === TRACK_WAYTYPE) return UNPAVED
  return UNKNOWN_SURFACE
}

// Index in DIFFICULTY_CLASSES[scale]: 0 to 3 from the easiest grade, 4 when the way has no grade.
export function difficultyClass(value: number | undefined): number {
  return value ? Math.min(value, 4) - 1 : 4
}

// The value on each edge (from point i to point i + 1) of a track of pointCount points, undefined where no range
// covers it.
function edgeValues(ranges: WayRange[], pointCount: number): (number | undefined)[] {
  const values = Array.from<number | undefined>({ length: Math.max(0, pointCount - 1) })
  for (const [start, end, value] of ranges) {
    for (let i = start; i < Math.min(end, pointCount - 1); i++) values[i] = value
  }
  return values
}

export interface ClassRun {
  startM: number
  endM: number
  // Index in the class list
  cls: number
}

// Consecutive edges of the same class; along is the distance from the start at each point.
function classRuns(along: number[], edgeClasses: number[]): ClassRun[] {
  const runs: ClassRun[] = []
  edgeClasses.forEach((cls, i) => {
    const last = runs.at(-1)
    if (last && last.cls === cls) last.endM = along[i + 1]!
    else runs.push({ startM: along[i]!, endM: along[i + 1]!, cls })
  })
  return runs
}

export function surfaceRuns(info: WayInfo, along: number[]): ClassRun[] {
  const surfaces = edgeValues(info.surface, along.length)
  const waytypes = edgeValues(info.waytype, along.length)
  return classRuns(along, surfaces.map((surface, i) => surfaceClass(surface, waytypes[i])))
}

export function difficultyRuns(ranges: WayRange[], along: number[]): ClassRun[] {
  return classRuns(along, edgeValues(ranges, along.length).map(difficultyClass))
}

// Whether any way along the track has a difficulty grade: without one, there is nothing to show.
export function hasDifficulty(ranges: WayRange[]): boolean {
  return ranges.some(([start, end, value]) => value > 0 && end > start)
}

export interface ClassShare {
  cls: number
  // Between 0 and 1
  share: number
}

// The share of the track's length in each class present, in class order.
export function classShares(runs: ClassRun[]): ClassShare[] {
  const meters = new Map<number, number>()
  for (const run of runs) meters.set(run.cls, (meters.get(run.cls) ?? 0) + run.endM - run.startM)
  const totalM = runs.length ? runs.at(-1)!.endM - runs[0]!.startM : 0
  if (totalM <= 0) return []
  return [...meters].filter(([, m]) => m > 0).sort(([a], [b]) => a - b).map(([cls, m]) => ({ cls, share: m / totalM }))
}

export function classGradient(runs: ClassRun[], colors: readonly { color: string }[], totalM: number): unknown[] {
  const stretches = runs.map(run => ({ startM: run.startM, color: colors[run.cls]!.color }))
  return lineGradient(stretches, totalM, colors.at(-1)!.color)
}

// Editing a track part by part: the editor keeps each segment's info indexed in its own points.

const WAY_INFO_KEYS = ['surface', 'waytype', 'sac_scale', 'mtb_scale'] as const

const mapWayInfo = (info: WayInfo, map: (ranges: WayRange[]) => WayRange[]): WayInfo =>
  Object.fromEntries(WAY_INFO_KEYS.map(key => [key, map(info[key])])) as WayInfo

const isEmpty = (info: WayInfo) => WAY_INFO_KEYS.every(key => !info[key].length)

// The ranges of points start..end of a track, renumbered from 0; null when none covers them.
export function sliceWayInfo(info: WayInfo | null, start: number, end: number): WayInfo | null {
  if (!info) return null
  const sliced = mapWayInfo(info, ranges => ranges
    .filter(([a, b]) => Math.min(b, end) > Math.max(a, start))
    .map(([a, b, value]) => [Math.max(a, start) - start, Math.min(b, end) - start, value]))
  return isEmpty(sliced) ? null : sliced
}

// The same ranges on the track driven the other way.
export function reverseWayInfo(info: WayInfo, pointCount: number): WayInfo {
  return mapWayInfo(info, ranges => ranges.map(([a, b, value]): WayRange => [pointCount - 1 - b, pointCount - 1 - a, value]).reverse())
}

// The info of a whole track from its parts, each starting at `offset` in it; null when no part has any.
export function joinWayInfo(parts: { info: WayInfo | null, offset: number }[]): WayInfo | null {
  const joined: WayInfo = { surface: [], waytype: [], sac_scale: [], mtb_scale: [] }
  for (const { info, offset } of parts) {
    if (!info) continue
    for (const key of WAY_INFO_KEYS) {
      for (const [a, b, value] of info[key]) {
        const last = joined[key].at(-1)
        // The same value going on across a junction: one range.
        if (last && last[1] === a + offset && last[2] === value) last[1] = b + offset
        else joined[key].push([a + offset, b + offset, value])
      }
    }
  }
  return isEmpty(joined) ? null : joined
}
