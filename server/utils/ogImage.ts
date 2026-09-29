import { formatDistance, formatDuration } from '#shared/utils/format'
import { estimateDurationMin, SPORT_LABELS, type LngLat, type SportType } from '#shared/utils/routes'

// Open Graph image of a route: the track drawn on a plain background (tile servers would need a paid
// plan for static maps), next to its name and key figures. Rendered to PNG by the og.png route.

export const OG_IMAGE_WIDTH = 1200
export const OG_IMAGE_HEIGHT = 630

export type OgRoute = {
  name: string
  sport: SportType
  distanceM: number
  elevationGainM: number | null
  coordinates: LngLat[]
  elevations: number[] | null
}

const COLORS = {
  background: '#f5f7f2',
  map: '#e8efe6',
  grid: '#d9e4d5',
  // The default accent (BRAND_COLOR): a shared image can't follow each visitor's choice.
  brand: '#4f46e5',
  brandSoft: '#e0e7ff',
  brandText: '#3730a3',
  route: '#ea580c',
  // Same as the start marker on the map.
  start: '#16a34a',
  text: '#111827',
  muted: '#6b7280',
  end: '#1f2937',
}

const MAP_BOX = { x: 40, y: 40, width: 550, height: 550, padding: 56 }
const PANEL_X = 640
const PANEL_WIDTH = OG_IMAGE_WIDTH - PANEL_X - 48

export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`)
}

// resvg can't wrap text: widths are estimated from Inter's average glyph widths (in em).
export function estimateTextWidth(text: string, fontSize: number): number {
  let em = 0
  for (const char of text) {
    if (/[iljtfrI.,:;'’!|() -]/.test(char)) em += 0.32
    else if (/[mwMW@]/.test(char)) em += 0.86
    else if (/[A-Z0-9]/.test(char)) em += 0.68
    else em += 0.56
  }
  return em * fontSize
}

// Greedy word wrap. Lines that don't fit, and the last one when text is left over, end with an ellipsis.
export function wrapText(text: string, fontSize: number, maxWidth: number, maxLines: number): string[] {
  const fits = (line: string) => estimateTextWidth(line, fontSize) <= maxWidth
  const truncate = (line: string) => {
    while (line.length > 1 && !fits(`${line}…`)) line = line.slice(0, -1).trimEnd()
    return `${line}…`
  }

  const lines: string[] = []
  for (const word of text.trim().split(/\s+/)) {
    const last = lines.at(-1)
    if (last !== undefined && fits(`${last} ${word}`)) lines[lines.length - 1] = `${last} ${word}`
    else lines.push(word)
  }

  const kept = lines.slice(0, maxLines).map(line => (fits(line) ? line : truncate(line)))
  if (lines.length > maxLines && !kept.at(-1)!.endsWith('…')) kept[kept.length - 1] = truncate(kept.at(-1)!)
  return kept
}

// Web Mercator, so the drawn shape matches the one on the map.
function mercator([lng, lat]: LngLat): [number, number] {
  const phi = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180
  return [(lng * Math.PI) / 180, -Math.log(Math.tan(Math.PI / 4 + phi / 2))]
}

// Fits the track in the box (keeping its proportions) and drops points closer than 1 px to the previous one.
export function projectTrack(
  coordinates: LngLat[],
  box: { x: number, y: number, width: number, height: number },
): [number, number][] {
  const projected = coordinates.map(mercator)
  const xs = projected.map(p => p[0])
  const ys = projected.map(p => p[1])
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const spanX = maxX - minX
  const spanY = maxY - minY
  // A single point (or a perfectly straight N-S / E-W line) has no extent on one axis.
  const scale = Math.min(spanX ? box.width / spanX : Infinity, spanY ? box.height / spanY : Infinity)
  const safeScale = Number.isFinite(scale) ? scale : 0
  const offsetX = box.x + (box.width - spanX * safeScale) / 2
  const offsetY = box.y + (box.height - spanY * safeScale) / 2
  const toBox = ([x, y]: [number, number]): [number, number] => [
    Math.round((offsetX + (x - minX) * safeScale) * 10) / 10,
    Math.round((offsetY + (y - minY) * safeScale) * 10) / 10,
  ]

  const points: [number, number][] = []
  projected.forEach((p, i) => {
    const point = toBox(p)
    const previous = points.at(-1)
    const isLast = i === projected.length - 1
    if (!previous || Math.hypot(point[0] - previous[0], point[1] - previous[1]) >= 1) points.push(point)
    // Keep the real end of the track even when it is within 1 px of the last kept point.
    else if (isLast && points.length > 1) points[points.length - 1] = point
  })
  return points
}

function haversineM([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const rad = Math.PI / 180
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2
  return 2 * 6371008.8 * Math.asin(Math.sqrt(a))
}

const toPath = (points: [number, number][]) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join('')

function elevationArea(
  coordinates: LngLat[],
  elevations: number[],
  box: { x: number, y: number, width: number, height: number },
): { line: string, area: string } {
  const distances = [0]
  for (let i = 1; i < coordinates.length; i++) distances.push(distances[i - 1]! + haversineM(coordinates[i - 1]!, coordinates[i]!))
  const total = distances.at(-1) || 1
  const min = Math.min(...elevations)
  // At least 50 m of range, so a flat route doesn't look like a mountain.
  const range = Math.max(Math.max(...elevations) - min, 50)
  const points: [number, number][] = elevations.map((elevation, i) => [
    Math.round((box.x + (distances[i]! / total) * box.width) * 10) / 10,
    Math.round((box.y + box.height - ((elevation - min) / range) * box.height) * 10) / 10,
  ])
  const line = toPath(points)
  const bottom = box.y + box.height
  return { line, area: `${line}L${box.x + box.width} ${bottom}L${box.x} ${bottom}Z` }
}

function mapGrid(): string {
  const { x, y, width, height } = MAP_BOX
  const lines: string[] = []
  for (let offset = 50; offset < width; offset += 50) lines.push(`M${x + offset} ${y}V${y + height}`)
  for (let offset = 50; offset < height; offset += 50) lines.push(`M${x} ${y + offset}H${x + width}`)
  return `<path d="${lines.join('')}" stroke="${COLORS.grid}" stroke-width="1"/>`
}

function track(coordinates: LngLat[]): string {
  if (coordinates.length < 2) return ''
  const { x, y, width, height, padding } = MAP_BOX
  const points = projectTrack(coordinates, {
    x: x + padding,
    y: y + padding,
    width: width - 2 * padding,
    height: height - 2 * padding,
  })
  const d = toPath(points)
  const [start, end] = [points[0]!, points.at(-1)!]
  const isLoop = Math.hypot(start[0] - end[0], start[1] - end[1]) < 12
  return [
    `<path d="${d}" fill="none" stroke="#ffffff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<path d="${d}" fill="none" stroke="${COLORS.route}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`,
    isLoop ? '' : `<circle cx="${end[0]}" cy="${end[1]}" r="12" fill="${COLORS.end}" stroke="#ffffff" stroke-width="5"/>`,
    `<circle cx="${start[0]}" cy="${start[1]}" r="12" fill="${COLORS.start}" stroke="#ffffff" stroke-width="5"/>`,
  ].join('')
}

// Same drawing as public/icon.svg, scaled to `size`.
function logo(x: number, y: number, size: number): string {
  return `<g transform="translate(${x} ${y}) scale(${size / 512})">`
    + `<rect width="512" height="512" rx="112" fill="${COLORS.brand}"/>`
    + '<path d="M112 384c48-8 72-56 112-88s96-8 128-56 16-96 48-120" fill="none" stroke="#fff" stroke-width="32" stroke-linecap="round" stroke-dasharray="1 56"/>'
    + '<circle cx="112" cy="384" r="36" fill="#fff"/>'
    + '<path d="M400 72c-35 0-64 28-64 63 0 47 64 113 64 113s64-66 64-113c0-35-29-63-64-63z" fill="#fff"/>'
    + `<circle cx="400" cy="135" r="22" fill="${COLORS.brand}"/>`
    + '</g>'
}

export function buildRouteOgSvg(route: OgRoute): string {
  const hasProfile = !!route.elevations
    && route.elevations.length === route.coordinates.length
    && route.coordinates.length > 1

  const parts: string[] = [
    `<rect width="${OG_IMAGE_WIDTH}" height="${OG_IMAGE_HEIGHT}" fill="${COLORS.background}"/>`,
    `<clipPath id="map"><rect x="${MAP_BOX.x}" y="${MAP_BOX.y}" width="${MAP_BOX.width}" height="${MAP_BOX.height}" rx="28"/></clipPath>`,
    `<g clip-path="url(#map)"><rect x="${MAP_BOX.x}" y="${MAP_BOX.y}" width="${MAP_BOX.width}" height="${MAP_BOX.height}" fill="${COLORS.map}"/>${mapGrid()}</g>`,
    track(route.coordinates),
    logo(PANEL_X, 48, 48),
    `<text x="${PANEL_X + 64}" y="83" font-size="30" font-weight="700" fill="${COLORS.brand}">sport-map</text>`,
  ]

  const sportLabel = SPORT_LABELS[route.sport]
  const pillWidth = Math.round(estimateTextWidth(sportLabel, 24) + 40)
  parts.push(
    `<rect x="${PANEL_X}" y="128" width="${pillWidth}" height="44" rx="22" fill="${COLORS.brandSoft}"/>`,
    `<text x="${PANEL_X + 20}" y="158" font-size="24" font-weight="700" fill="${COLORS.brandText}">${escapeXml(sportLabel)}</text>`,
  )

  // Fewer title lines when the elevation profile takes the bottom of the panel.
  const titleLines = wrapText(route.name, 52, PANEL_WIDTH, hasProfile ? 2 : 3)
  titleLines.forEach((line, i) => {
    parts.push(`<text x="${PANEL_X}" y="${250 + i * 62}" font-size="52" font-weight="700" fill="${COLORS.text}">${escapeXml(line)}</text>`)
  })

  const stats = [
    ['Distance', formatDistance(route.distanceM)],
    ['Dénivelé +', route.elevationGainM != null ? `${Math.round(route.elevationGainM)} m` : '—'],
    ['Durée estimée', `~${formatDuration(estimateDurationMin(route.sport, route.distanceM, route.elevationGainM))}`],
  ]
  // Columns as wide as their content, spread over the panel, so long values ("123,45 km") don't run
  // into the next one.
  const statsY = 250 + titleLines.length * 62 + 34
  const widths = stats.map(([label, value]) => Math.max(estimateTextWidth(label!, 22), estimateTextWidth(value!, 34)))
  const gap = Math.max(24, (PANEL_WIDTH - widths.reduce((sum, width) => sum + width, 0)) / (stats.length - 1))
  let x = PANEL_X
  stats.forEach(([label, value], i) => {
    const left = Math.round(x)
    parts.push(
      `<text x="${left}" y="${statsY}" font-size="22" fill="${COLORS.muted}">${escapeXml(label!)}</text>`,
      `<text x="${left}" y="${statsY + 42}" font-size="34" font-weight="700" fill="${COLORS.text}">${escapeXml(value!)}</text>`,
    )
    x += widths[i]! + gap
  })

  if (hasProfile) {
    const { line, area } = elevationArea(route.coordinates, route.elevations!, {
      x: PANEL_X,
      y: 490,
      width: PANEL_WIDTH,
      height: 100,
    })
    parts.push(
      `<path d="${area}" fill="${COLORS.brand}" fill-opacity="0.15"/>`,
      `<path d="${line}" fill="none" stroke="${COLORS.brand}" stroke-width="3" stroke-linejoin="round"/>`,
    )
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_IMAGE_WIDTH}" height="${OG_IMAGE_HEIGHT}" `
    + `viewBox="0 0 ${OG_IMAGE_WIDTH} ${OG_IMAGE_HEIGHT}" font-family="Inter">${parts.join('')}</svg>`
}
