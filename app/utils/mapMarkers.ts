import type { ExpressionSpecification, Map } from 'maplibre-gl'
import { SPORT_TYPES, type SportType } from '#shared/utils/routes'
import { isMapDark } from '~/utils/topoStyle'

// The app's markers in the "balisage" look (#230): the start as a yellow square, waypoints as numbered ink squares,
// the end as a red square, a route's start on the home map as its sport's two-bar waymark. Drawn as images (no
// glyphs needed, as the e2e style has none) named "sm-start", "sm-via-3", "sm-sport-trail": MapView draws each one
// the first time a layer asks for it (`styleimagemissing`), in the colours of the map's style, and redraws them in
// place when that style turns light or dark (`redrawMarkerImages`, same size in both modes). Swapping image names
// instead made MapLibre drop the symbols whose new image arrived during the style diff.

export type MarkerMode = 'light' | 'dark'

export const END_MARKER_COLOR = '#dc2626'

// The sports' map colours: Tailwind's 700 shade in light mode, 400 in dark mode, the hues of the sport classes
// (main.css, `sport-<type>`).
export const SPORT_MARK_COLORS: Record<SportType, Record<MarkerMode, string>> = {
  running: { light: '#c2410c', dark: '#fb923c' },
  trail: { light: '#be123c', dark: '#fb7185' },
  hiking: { light: '#047857', dark: '#34d399' },
  cycling: { light: '#0e7490', dark: '#22d3ee' },
  road_cycling: { light: '#1d4ed8', dark: '#60a5fa' },
  mountain_biking: { light: '#6d28d9', dark: '#a78bfa' },
}

const INKS: Record<MarkerMode, { ink: string, paper: string, sign: string, signInk: string, surface: string, bar: string }> = {
  light: { ink: '#1d2520', paper: '#fbf8f1', sign: '#f4c430', signInk: '#1d2520', surface: '#fbf8f1', bar: '#ffffff' },
  dark: { ink: '#ece6d6', paper: '#141815', sign: '#e3b53c', signInk: '#141815', surface: '#1d221e', bar: '#ece6d6' },
}

// A rounded rectangle, in CSS pixels; the stroke is drawn inside it.
export interface MarkerShape {
  x: number
  y: number
  width: number
  height: number
  radius: number
  fill: string
  stroke?: string
  strokeWidth?: number
}

export interface MarkerLabel {
  text: string
  color: string
  // CSS pixels, bold Barlow
  size: number
}

export interface MarkerDrawing {
  width: number
  height: number
  shapes: MarkerShape[]
  label?: MarkerLabel
}

export function startMarker(mode: MarkerMode): MarkerDrawing {
  const { sign, signInk } = INKS[mode]
  return { width: 20, height: 20, shapes: [{ x: 0, y: 0, width: 20, height: 20, radius: 3, fill: sign, stroke: signInk, strokeWidth: 2 }] }
}

export function endMarker(mode: MarkerMode): MarkerDrawing {
  return { width: 16, height: 16, shapes: [{ x: 0, y: 0, width: 16, height: 16, radius: 3, fill: END_MARKER_COLOR, stroke: INKS[mode].paper, strokeWidth: 2 }] }
}

export function viaMarker(mode: MarkerMode, number: number): MarkerDrawing {
  const { ink, paper } = INKS[mode]
  const text = String(number)
  const width = Math.max(18, 8 + text.length * 7)
  return { width, height: 18, shapes: [{ x: 0, y: 0, width, height: 18, radius: 2, fill: ink }], label: { text, color: paper, size: 11 } }
}

// The sport's waymark on a small post: white band over the sport's colour, as in the app's lists.
export function sportMarker(mode: MarkerMode, sport: SportType): MarkerDrawing {
  const { ink, surface, bar } = INKS[mode]
  return {
    width: 20,
    height: 26,
    shapes: [
      { x: 0, y: 0, width: 20, height: 26, radius: 3, fill: surface, stroke: ink, strokeWidth: 1.5 },
      { x: 4, y: 5, width: 12, height: 6, radius: 0, fill: bar, stroke: ink, strokeWidth: 0.8 },
      { x: 4, y: 14, width: 12, height: 6, radius: 0, fill: SPORT_MARK_COLORS[sport][mode] },
    ],
  }
}

// The drawing an image name stands for ("sm-start", "sm-via-12", "sm-sport-trail") in this mode, if any.
export function markerDrawing(id: string, mode: MarkerMode): MarkerDrawing | undefined {
  const match = /^sm-(start|end|via|sport)(?:-(.+))?$/.exec(id)
  if (!match) return undefined
  const [, kind, arg] = match as unknown as [string, string, string | undefined]
  if (kind === 'start') return startMarker(mode)
  if (kind === 'end') return endMarker(mode)
  if (kind === 'via') return arg && /^\d+$/.test(arg) ? viaMarker(mode, Number(arg)) : undefined
  const sport = SPORT_TYPES.find(type => type === arg)
  return sport && sportMarker(mode, sport)
}

// `icon-image` of a route's points: start, end, or the waypoint numbered by its `index` property.
export const ROUTE_POINT_IMAGE: ExpressionSpecification = ['match', ['get', 'role'], 'start', 'sm-start', 'end', 'sm-end', ['concat', 'sm-via-', ['to-string', ['get', 'index']]]]

const PIXEL_RATIO = 2

function drawMarker({ width, height, shapes, label }: MarkerDrawing): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(width * PIXEL_RATIO)
  canvas.height = Math.ceil(height * PIXEL_RATIO)
  const context = canvas.getContext('2d')!
  context.scale(PIXEL_RATIO, PIXEL_RATIO)
  for (const shape of shapes) {
    const inset = (shape.strokeWidth ?? 0) / 2
    context.beginPath()
    context.roundRect(shape.x + inset, shape.y + inset, shape.width - 2 * inset, shape.height - 2 * inset, shape.radius)
    context.fillStyle = shape.fill
    context.fill()
    if (shape.stroke && shape.strokeWidth) {
      context.lineWidth = shape.strokeWidth
      context.strokeStyle = shape.stroke
      context.stroke()
    }
  }
  if (label) {
    context.font = `700 ${label.size}px Barlow, sans-serif`
    context.fillStyle = label.color
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(label.text, width / 2, height / 2 + 0.5)
  }
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

const mode = (map: Map): MarkerMode => (isMapDark(map) ? 'dark' : 'light')

// Draws one of the app's marker images, unless the map has it; ignores any other name. MapView also calls it on
// `styleimagemissing`, as a fallback.
export function addMarkerImage(map: Map, id: string) {
  if (map.hasImage(id)) return
  const drawing = markerDrawing(id, mode(map))
  if (drawing) map.addImage(id, drawMarker(drawing), { pixelRatio: PIXEL_RATIO })
}

// The images a layer will use, added before it or its data: MapLibre doesn't draw the symbols of a first layout
// whose images only arrive through `styleimagemissing`.
export function addMarkerImages(map: Map, ids: string[]) {
  for (const id of ids) addMarkerImage(map, id)
}

// Images of a route's points (ROUTE_POINT_IMAGE): start, end and the waypoints numbered 1 to count - 2.
export function routePointImages(count: number): string[] {
  return ['sm-start', 'sm-end', ...Array.from({ length: Math.max(count - 2, 0) }, (_, i) => `sm-via-${i + 1}`)]
}

export const SPORT_MARK_IMAGES = SPORT_TYPES.map(sport => `sm-sport-${sport}`)

// After the style turned light or dark: the marker images already drawn, in its colours.
export function redrawMarkerImages(map: Map) {
  for (const id of map.listImages()) {
    const drawing = markerDrawing(id, mode(map))
    if (drawing) map.updateImage(id, drawMarker(drawing))
  }
}
