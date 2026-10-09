import type { Map } from 'maplibre-gl'
import type { MapViewState } from '~/stores/routeSearch'

// What a map shows, its bounds kept within the world (a zoomed-out map can show it more than once).
export function mapViewState(map: Map): MapViewState {
  const bounds = map.getBounds()
  const clampLng = (value: number) => Math.min(180, Math.max(-180, value))
  const clampLat = (value: number) => Math.min(90, Math.max(-90, value))
  const { lng, lat } = map.getCenter()
  return {
    bounds: [clampLng(bounds.getWest()), clampLat(bounds.getSouth()), clampLng(bounds.getEast()), clampLat(bounds.getNorth())],
    center: [lng, lat],
    zoom: map.getZoom(),
  }
}
