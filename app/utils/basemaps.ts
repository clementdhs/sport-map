import type { Map } from 'maplibre-gl'

// Basemaps a visitor can pick, remembered on the device. MapTiler Outdoor is the loaded style; the others
// are raster layers drawn over it, below the app's own layers (track, markers…).
export const BASEMAPS = ['maptiler', 'ignPlan'] as const
export type Basemap = typeof BASEMAPS[number]
export const DEFAULT_BASEMAP: Basemap = 'maptiler'

const STORAGE_KEY = 'sport-map:basemap'

// Plan IGN through the Géoplateforme's open WMTS (no key, Licence Ouverte Etalab 2.0, no usage limit). SCAN 25
// is left out: its free use doesn't cover a site open to the public.
const IGN_PLAN_SOURCE = 'ign-plan'
const IGN_PLAN_TILES = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0'
  + '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM_0_19&FORMAT=image/png'
  + '&TILEMATRIX={z}&TILECOL={x}&TILEROW={y}'
const IGN_ATTRIBUTION = '<a href="https://www.ign.fr/" target="_blank" rel="noopener">© IGN</a> – Plan IGN'

export function parseBasemap(value: string | null | undefined): Basemap {
  return BASEMAPS.find(basemap => basemap === value) ?? DEFAULT_BASEMAP
}

export function loadBasemap(): Basemap {
  try {
    return parseBasemap(localStorage.getItem(STORAGE_KEY))
  }
  catch {
    return DEFAULT_BASEMAP
  }
}

export function saveBasemap(basemap: Basemap) {
  try {
    localStorage.setItem(STORAGE_KEY, basemap)
  }
  catch { /* storage blocked: kept until the page closes */ }
}

// Only MapTiler is prepared for offline use (app/utils/offlineRoute.ts): without network, the map falls back to it.
export function shownBasemap(chosen: Basemap, online: boolean): Basemap {
  return online ? chosen : DEFAULT_BASEMAP
}

// To call on the style's `style.load`, before tiles are requested and the app adds its layers. Returns the
// function switching basemaps.
export function addBasemapLayers(map: Map): (basemap: Basemap) => void {
  // Layers of the style drawing MapTiler data, as the style shows them. Hidden under another basemap, so that
  // their tiles aren't loaded (MapLibre skips sources without a visible layer); the background stays visible.
  const styleLayers = (map.getStyle().layers ?? [])
    .filter(layer => 'source' in layer && layer.layout?.visibility !== 'none')
    .map(layer => layer.id)

  map.addSource(IGN_PLAN_SOURCE, {
    type: 'raster',
    tiles: [IGN_PLAN_TILES],
    tileSize: 256,
    maxzoom: 19,
    attribution: IGN_ATTRIBUTION,
  })
  map.addLayer({ id: IGN_PLAN_SOURCE, type: 'raster', source: IGN_PLAN_SOURCE, layout: { visibility: 'none' } })

  return (basemap) => {
    for (const id of styleLayers) map.setLayoutProperty(id, 'visibility', basemap === 'maptiler' ? 'visible' : 'none')
    map.setLayoutProperty(IGN_PLAN_SOURCE, 'visibility', basemap === 'ignPlan' ? 'visible' : 'none')
  }
}
