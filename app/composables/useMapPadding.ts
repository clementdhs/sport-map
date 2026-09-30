import type { PaddingOptions } from 'maplibre-gl'

// Height of the map hidden by MapSheetLayout's open bottom sheet (0 when collapsed or beside the map).
export const MAP_INSET_KEY: InjectionKey<() => number> = Symbol('map-inset')

// Padding for views framed on a route or a place, so that they stay above an open bottom sheet.
export function useMapPadding() {
  const inset = inject(MAP_INSET_KEY, () => 0)
  return {
    padding: (base: number): PaddingOptions => ({ top: base, right: base, left: base, bottom: base + inset() }),
    // Vertical offset keeping a single point (flyTo) in the middle of the visible part.
    offset: (): [number, number] => [0, -inset() / 2],
  }
}
