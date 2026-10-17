// Outline of a route drawn by its card: an SVG path in a square box of THUMBNAIL_SIZE units, the track
// centered in it and keeping its proportions, north up. The server builds it from the simplified track that
// the lists return (track_thumbnail in SQL), so the client receives a short string instead of coordinates.

export const THUMBNAIL_SIZE = 100
// Room left around the track for the stroke and the start dot
const THUMBNAIL_PADDING = 10

export function thumbnailPath(coordinates: unknown): string | null {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null
  const points = coordinates as [number, number][]

  // Equirectangular projection around the track's mean latitude: right for the size of a route.
  const meanLat = points.reduce((sum, [, lat]) => sum + lat, 0) / points.length
  const xScale = Math.cos((meanLat * Math.PI) / 180)
  const projected = points.map(([lng, lat]) => [lng * xScale, lat] as const)

  const xs = projected.map(([x]) => x)
  const ys = projected.map(([, y]) => y)
  const minX = Math.min(...xs)
  const maxY = Math.max(...ys)
  const width = Math.max(...xs) - minX
  const height = maxY - Math.min(...ys)
  const extent = Math.max(width, height)
  if (!(extent > 0)) return null

  const inner = THUMBNAIL_SIZE - 2 * THUMBNAIL_PADDING
  const scale = inner / extent
  const offsetX = THUMBNAIL_PADDING + (inner - width * scale) / 2
  const offsetY = THUMBNAIL_PADDING + (inner - height * scale) / 2

  // Whole units are finer than a pixel at the size cards draw it; points that round to the same one are dropped.
  const commands: string[] = []
  let last = ''
  for (const [x, y] of projected) {
    const point = `${Math.round(offsetX + (x - minX) * scale)} ${Math.round(offsetY + (maxY - y) * scale)}`
    if (point === last) continue
    commands.push(`${commands.length ? 'L' : 'M'}${point}`)
    last = point
  }
  return commands.length > 1 ? commands.join('') : null
}

// Where the outline starts, to mark it with a dot.
export function thumbnailStart(path: string): [x: number, y: number] | null {
  const match = /^M(\d+) (\d+)/.exec(path)
  return match ? [Number(match[1]), Number(match[2])] : null
}
