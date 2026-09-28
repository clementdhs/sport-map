// Map style loaded by every map, and prefetched by the offline preparation: both must use the same URL.
// Without a MapTiler key the app still runs, on MapLibre's low-detail demo tiles.
export function mapStyleUrl(maptilerKey: string): string {
  return maptilerKey
    ? `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${maptilerKey}`
    : 'https://demotiles.maplibre.org/style.json'
}
