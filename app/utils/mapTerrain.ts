import type { Map, StyleSpecification } from 'maplibre-gl'

// 3D view of a map: relief drawn from the style's own elevation source (MapTiler Outdoor's `terrain-rgb`, which
// its hillshade already loads: no other provider) and a tilted camera. Kept in the member's account
// (app/utils/preferences.ts), 2D by default.
// Slightly exaggerated, so that hills and moderate climbs show.
export const TERRAIN_EXAGGERATION = 1.5
// MapLibre's default maximum pitch: the horizon stays off screen, so far tiles aren't loaded (MapTiler quota).
export const PITCH_3D = 60

// The style's elevation source, if it has one (MapLibre's demo style and the e2e tests' empty style don't).
export function demSource(style: Pick<StyleSpecification, 'sources'>): string | undefined {
  return Object.entries(style.sources ?? {}).find(([, source]) => source.type === 'raster-dem')?.[0]
}

// Relief and tilt together. The relief shares its source with the style's hillshade, which then gets coarser
// tiles in 3D: a second source would load every elevation tile twice.
export function setMap3d(map: Map, source: string, on: boolean, animate = true) {
  setRelief(map, source, on)
  map.easeTo({ pitch: on ? PITCH_3D : 0, ...(animate ? {} : { duration: 0 }) })
}

// Relief alone: a flyover (#74) tilts the camera itself.
export function setRelief(map: Map, source: string, on: boolean) {
  map.setTerrain(on ? { source, exaggeration: TERRAIN_EXAGGERATION } : null)
}
