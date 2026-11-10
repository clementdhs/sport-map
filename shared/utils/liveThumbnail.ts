import type { LngLat } from './routes'

// Mini-map of an outing in the /live list (#237): the route followed and the track covered, drawn in one
// LIVE_THUMBNAIL_WIDTH × LIVE_THUMBNAIL_HEIGHT box with a shared projection (so the track lies on the route),
// north up, centered and keeping proportions, and the latest position as a point. Built on the server, so the
// list gets short strings instead of the whole track.

export const LIVE_THUMBNAIL_WIDTH = 350
export const LIVE_THUMBNAIL_HEIGHT = 120
// Room left around the lines for the strokes and the position's halo
const PADDING = 16

export interface LiveThumbnail {
  route: string | null
  track: string | null
  position: [x: number, y: number] | null
}

export function liveThumbnail(route: LngLat[] | null, track: LngLat[]): LiveThumbnail | null {
  const all = [...(route ?? []), ...track]
  if (!all.length) return null

  // Equirectangular projection around the mean latitude: right for the size of an outing.
  const meanLat = all.reduce((sum, [, lat]) => sum + lat, 0) / all.length
  const xScale = Math.cos((meanLat * Math.PI) / 180)
  const xs = all.map(([lng]) => lng * xScale)
  const ys = all.map(([, lat]) => lat)
  const minX = Math.min(...xs)
  const maxY = Math.max(...ys)
  const width = Math.max(...xs) - minX
  const height = maxY - Math.min(...ys)

  const innerW = LIVE_THUMBNAIL_WIDTH - 2 * PADDING
  const innerH = LIVE_THUMBNAIL_HEIGHT - 2 * PADDING
  // A single point (or points in one place) has no extent: it sits in the middle.
  const extent = Math.max(width / innerW, height / innerH)
  const scale = extent > 0 ? 1 / extent : 0
  const offsetX = PADDING + (innerW - width * scale) / 2
  const offsetY = PADDING + (innerH - height * scale) / 2
  const project = ([lng, lat]: LngLat): [number, number] =>
    [Math.round(offsetX + (lng * xScale - minX) * scale), Math.round(offsetY + (maxY - lat) * scale)]

  function path(line: LngLat[] | null): string | null {
    if (!line || line.length < 2) return null
    // Whole units are finer than a pixel at the size the list draws it; repeated points are dropped.
    const commands: string[] = []
    let last = ''
    for (const coordinate of line) {
      const point = project(coordinate).join(' ')
      if (point === last) continue
      commands.push(`${commands.length ? 'L' : 'M'}${point}`)
      last = point
    }
    return commands.length > 1 ? commands.join('') : null
  }

  const latest = track.at(-1)
  return { route: path(route), track: path(track), position: latest ? project(latest) : null }
}
