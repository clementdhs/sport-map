import { distance } from '@turf/turf'
import type { LngLat } from './routes'
import { MAX_GAP_M } from './osmRoutes'

// Sections of a long line (#72): one of a marked route's lines, measured once so that the section's ends can move
// along it live, while dragged.

// Shorter sections can't be imported.
export const MIN_SECTION_M = 100

export interface MeasuredLine {
  coordinates: LngLat[]
  // Metres from the first point, for each point
  along: number[]
  length: number
  // Its ends meet, as closely as the stitching joins pieces: a section may run past the last point and on from the
  // first one.
  closed: boolean
  // Between the last point and the first one, crossed by such a section (0 when the line isn't closed)
  gap: number
}

// A section of a route: the line it lies on, and metres along it from the departure to the arrival. An arrival before
// the departure runs past the end of a closed line, and backwards along an open one.
export interface LineSection {
  line: number
  from: number
  to: number
}

const toMeters = (a: LngLat, b: LngLat) => distance(a, b, { units: 'meters' })
const round = (value: number) => Math.round(value * 1e6) / 1e6
const KM_PER_DEGREE = 111.32

export function measureLine(coordinates: LngLat[]): MeasuredLine {
  const along = [0]
  for (let i = 1; i < coordinates.length; i++) along.push(along[i - 1]! + toMeters(coordinates[i - 1]!, coordinates[i]!))
  const ends = toMeters(coordinates[0]!, coordinates.at(-1)!)
  const closed = coordinates.length > 2 && ends <= MAX_GAP_M
  return { coordinates, along, length: along.at(-1)!, closed, gap: closed ? ends : 0 }
}

// The segment holding `at` (metres along): between points i and i + 1.
function segmentAt({ along }: MeasuredLine, at: number): number {
  let low = 0
  let high = along.length - 2
  while (low < high) {
    const middle = (low + high + 1) >> 1
    if (along[middle]! <= at) low = middle
    else high = middle - 1
  }
  return low
}

// The point `at` metres along the line, on the straight segment drawn between its points.
export function pointAlong(line: MeasuredLine, at: number): LngLat {
  const i = segmentAt(line, at)
  const [startLng, startLat] = line.coordinates[i]!
  const [endLng, endLat] = line.coordinates[i + 1]!
  const span = line.along[i + 1]! - line.along[i]!
  const ratio = span > 0 ? Math.min(1, Math.max(0, (at - line.along[i]!) / span)) : 0
  return [round(startLng + (endLng - startLng) * ratio), round(startLat + (endLat - startLat) * ratio)]
}

function forward(line: MeasuredLine, from: number, to: number): LngLat[] {
  return [pointAlong(line, from), ...line.coordinates.slice(segmentAt(line, from) + 1, segmentAt(line, to) + 1), pointAlong(line, to)]
}

function withoutRepeats(points: LngLat[]): LngLat[] {
  return points.filter((point, i) => i === 0 || point[0] !== points[i - 1]![0] || point[1] !== points[i - 1]![1])
}

// The section's points, in the order they are walked: the line's own points between its ends, which are placed
// exactly on it.
export function sectionCoordinates(line: MeasuredLine, from: number, to: number): LngLat[] {
  if (to >= from) return withoutRepeats(forward(line, from, to))
  if (!line.closed) return withoutRepeats(forward(line, to, from).reverse())
  return withoutRepeats([...forward(line, from, line.length), ...forward(line, 0, to)])
}

export function sectionLength(line: MeasuredLine, from: number, to: number): number {
  if (to >= from) return to - from
  return line.closed ? line.length - from + line.gap + to : from - to
}

// The arrival `length` metres from the departure, in the section's direction, within the line.
export function arrivalAfter(line: MeasuredLine, from: number, to: number, length: number): number {
  if (!line.closed && to < from) return Math.max(0, from - length)
  const end = from + length
  if (end <= line.length || !line.closed || from < 1) return Math.min(end, line.length)
  // On from the start of the loop, short of the departure.
  return Math.max(0, Math.min(end - line.length - line.gap, from - 1))
}

// Where a point of the map falls on the line (metres along it), and how far from it it lies.
export interface LinePosition {
  along: number
  offset: number
}

// Nearest point of the line, measured on a local flat projection: the segments are short, and the position is
// interpolated as pointAlong draws it.
export function locateOnLine({ coordinates, along }: MeasuredLine, [lng, lat]: LngLat): LinePosition {
  const scale = Math.cos(lat * Math.PI / 180)
  let best = { along: 0, squared: Infinity }
  for (let i = 0; i < coordinates.length - 1; i++) {
    const [startLng, startLat] = coordinates[i]!
    const [endLng, endLat] = coordinates[i + 1]!
    const dx = (endLng - startLng) * scale
    const dy = endLat - startLat
    const px = (lng - startLng) * scale
    const py = lat - startLat
    const span = dx * dx + dy * dy
    const ratio = span > 0 ? Math.min(1, Math.max(0, (px * dx + py * dy) / span)) : 0
    const squared = (px - ratio * dx) ** 2 + (py - ratio * dy) ** 2
    if (squared < best.squared) best = { along: along[i]! + ratio * (along[i + 1]! - along[i]!), squared }
  }
  return { along: best.along, offset: Math.sqrt(best.squared) * KM_PER_DEGREE * 1000 }
}

export interface RoutePosition extends LinePosition {
  line: number
}

// The line nearest to the point, among a route's lines.
export function locateOnLines(lines: MeasuredLine[], point: LngLat): RoutePosition {
  return lines.map((line, i) => ({ ...locateOnLine(line, point), line: i }))
    .reduce((best, position) => position.offset < best.offset ? position : best)
}
