import type { Map, PaddingOptions } from 'maplibre-gl'
import type { MapFocus } from '~/stores/routeSearch'

// Map heights hidden by MapSheetLayout: under its floating top bar, and under its open bottom sheet (0 when
// collapsed or beside the map).
export interface MapInsets {
  top: number
  bottom: number
}

export const MAP_INSET_KEY: InjectionKey<() => MapInsets> = Symbol('map-inset')

// Padding for views framed on a route or a place, so that they stay between the top bar and an open bottom sheet.
export function useMapPadding() {
  const insets = inject(MAP_INSET_KEY, () => ({ top: 0, bottom: 0 }))
  const padding = (base: number): PaddingOptions => {
    const { top, bottom } = insets()
    // The top bar only covers the left of the map: half the margin under it is enough.
    return { top: Math.max(base, top + base / 2), right: base, left: base, bottom: base + bottom }
  }
  // Vertical offset keeping a single point (flyTo) in the middle of the visible part.
  const offset = (): [number, number] => {
    const { top, bottom } = insets()
    return [0, (top - bottom) / 2]
  }
  return {
    padding,
    offset,
    // Moves to a place picked in a search box: its extent when known, else its centre.
    focusOn: (map: Map, focus: MapFocus) => {
      if (focus.bbox) map.fitBounds(focus.bbox, { padding: padding(40), maxZoom: 13 })
      else map.flyTo({ center: focus.center, zoom: 12, offset: offset() })
    },
  }
}
