import type { PaddingOptions } from 'maplibre-gl'

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
  return {
    padding: (base: number): PaddingOptions => {
      const { top, bottom } = insets()
      // The top bar only covers the left of the map: half the margin under it is enough.
      return { top: Math.max(base, top + base / 2), right: base, left: base, bottom: base + bottom }
    },
    // Vertical offset keeping a single point (flyTo) in the middle of the visible part.
    offset: (): [number, number] => {
      const { top, bottom } = insets()
      return [0, (top - bottom) / 2]
    },
  }
}
