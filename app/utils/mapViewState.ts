import type { Map } from 'maplibre-gl'
import type { Bounds, MapViewState } from '~/stores/routeSearch'

// What a map shows, its bounds kept within the world (a zoomed-out map can show it more than once). A tilted
// map (3D view) sees far beyond its centre, about 15 times the distance at 60°: searches then cover what it
// would show seen from above, at the same centre and zoom.
export function mapViewState(map: Map): MapViewState {
  const { lng, lat } = map.getCenter()
  const canvas = map.getCanvas()
  const [west, south, east, north] = map.getPitch()
    ? flatViewBounds([lng, lat], map.getZoom(), map.getBearing(), canvas.clientWidth, canvas.clientHeight)
    : map.getBounds().toArray().flat() as Bounds
  const clampLng = (value: number) => Math.min(180, Math.max(-180, value))
  const clampLat = (value: number) => Math.min(90, Math.max(-90, value))
  return {
    bounds: [clampLng(west), clampLat(south), clampLng(east), clampLat(north)],
    center: [lng, lat],
    zoom: map.getZoom(),
  }
}

// Bounds of a map of this size seen from above (no pitch), as MapLibre's getBounds() gives them: a box around
// the possibly rotated view. Web Mercator with MapLibre's 512 px world at zoom 0.
export function flatViewBounds(center: [number, number], zoom: number, bearing: number, width: number, height: number): Bounds {
  const worldSize = 512 * 2 ** zoom
  const sinLat = Math.sin(center[1] * Math.PI / 180)
  const x = (center[0] + 180) / 360 * worldSize
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * worldSize
  const angle = bearing * Math.PI / 180
  // Half extents of the rotated view, in world pixels.
  const dx = (Math.abs(width * Math.cos(angle)) + Math.abs(height * Math.sin(angle))) / 2
  const dy = (Math.abs(width * Math.sin(angle)) + Math.abs(height * Math.cos(angle))) / 2
  const lng = (px: number) => px / worldSize * 360 - 180
  const lat = (py: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * py / worldSize))) * 180 / Math.PI
  return [lng(x - dx), lat(y + dy), lng(x + dx), lat(y - dy)]
}
