import type { StyleSpecification } from 'maplibre-gl'

// Map style loaded by every map, and prefetched by the offline preparation: both must use the same URL.
// Without a MapTiler key the app still runs, on MapLibre's low-detail demo tiles (no dark variant).
// Outdoor Dark has the same sources and layer ids as Outdoor: only colours, layer order and the sprite differ,
// so switching between them reuses the tiles already loaded (#109).
export function mapStyleUrl(maptilerKey: string, dark = false): string {
  return maptilerKey
    ? `https://api.maptiler.com/maps/outdoor-v2${dark ? '-dark' : ''}/style.json?key=${maptilerKey}`
    : 'https://demotiles.maplibre.org/style.json'
}

// Which MapTiler style the maps show (#151): the theme's (the default, #109), or always the light or the dark one.
// Kept in the member's account (app/utils/preferences.ts).
export type MapStyleChoice = 'theme' | 'light' | 'dark'

export const MAP_STYLE_CHOICES: MapStyleChoice[] = ['theme', 'light', 'dark']

export function parseMapStyleChoice(value: unknown): MapStyleChoice {
  return value === 'light' || value === 'dark' ? value : 'theme'
}

// Whether the maps show the dark style, for this choice and the app's mode.
export function mapStyleDark(choice: MapStyleChoice, themeDark: boolean): boolean {
  return choice === 'theme' ? themeDark : choice === 'dark'
}

// Every style a map may show with this choice, which the offline preparation stores: light and dark when it follows
// the theme (one without a key), only the chosen one otherwise (MapTiler quota). They share their sources.
export function mapStyleUrls(maptilerKey: string, choice: MapStyleChoice = 'theme'): string[] {
  const shown = choice === 'theme' ? [false, true] : [choice === 'dark']
  return [...new Set(shown.map(dark => mapStyleUrl(maptilerKey, dark)))]
}

// The style to show. Offline, the other one when only it was prepared with the route (routes prepared before #109
// only have the light one, routes prepared with a fixed choice only that one): otherwise the map would stay empty.
export async function availableStyleUrl(maptilerKey: string, dark: boolean): Promise<string> {
  const url = mapStyleUrl(maptilerKey, dark)
  const other = mapStyleUrl(maptilerKey, !dark)
  if (url === other || navigator.onLine || !('caches' in window)) return url
  try {
    return (await caches.match(url)) || !(await caches.match(other)) ? url : other
  }
  catch {
    return url
  }
}

// `transformStyle` for `map.setStyle(url, { diff: true })` when the theme changes: the next style keeps what the
// app added to the previous one (sources, layers above the style, Plan IGN, 3D terrain) and the visibility of the
// style's layers (hidden under Plan IGN, app/utils/basemaps.ts), so MapLibre only applies the colour changes.
export function keepAppLayers(previous: StyleSpecification | undefined, next: StyleSpecification): StyleSpecification {
  if (!previous) return next
  const styleIds = new Set(next.layers.map(layer => layer.id))
  const visibility = new Map(previous.layers.map(layer => [layer.id, layer.layout?.visibility]))
  return {
    ...next,
    sources: { ...previous.sources, ...next.sources },
    layers: [
      ...next.layers.map((layer) => {
        const shown = visibility.get(layer.id)
        return shown && layer.layout?.visibility !== 'none'
          ? { ...layer, layout: { ...layer.layout, visibility: shown } } as typeof layer
          : layer
      }),
      ...previous.layers.filter(layer => !styleIds.has(layer.id)),
    ],
    ...(previous.terrain ? { terrain: previous.terrain } : {}),
  }
}
