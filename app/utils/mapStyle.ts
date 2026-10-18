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

// Every style a map may show, which the offline preparation stores: light and dark (one without a key).
export function mapStyleUrls(maptilerKey: string): string[] {
  return [...new Set([mapStyleUrl(maptilerKey), mapStyleUrl(maptilerKey, true)])]
}

// The style to show for the theme. Offline, the dark one only when it was prepared with the route (routes prepared
// before #109 only have the light one): otherwise the map would stay empty.
export async function themedStyleUrl(maptilerKey: string, dark: boolean): Promise<string> {
  const url = mapStyleUrl(maptilerKey, dark)
  if (!dark || navigator.onLine || !('caches' in window)) return url
  try {
    return (await caches.match(url)) ? url : mapStyleUrl(maptilerKey)
  }
  catch {
    return mapStyleUrl(maptilerKey)
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
