import { describe, expect, it } from 'vitest'
import { areaTiles, corridorTiles, isOfflinePagePath, OFFLINE_AREA_MAX_ZOOM, OFFLINE_MAX_ZOOM, OFFLINE_MIN_ZOOM, offlineTiles, tileAt, withNeighbours } from '#shared/utils/offlineMaps'
import type { LngLat } from '#shared/utils/routes'
import { mapResourceUrls } from '~/utils/offlineRoute'

const ID = '0b5c0f9e-8a3a-4f7e-9d7c-3f1b2a4c5d6e'

describe('tileAt', () => {
  it('finds the Web Mercator tile of a point, like the OpenStreetMap wiki formula', () => {
    const osm = ([lng, lat]: LngLat, z: number) => ({
      x: Math.floor(((lng + 180) / 360) * 2 ** z),
      y: Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z),
    })
    expect(tileAt([0, 0], 1)).toEqual({ x: 1, y: 1 })
    for (const point of [[6.129, 45.899], [-1.55, 47.21], [9.19, 45.46]] as LngLat[]) {
      for (const z of [10, 14, 15]) expect(tileAt(point, z)).toEqual(osm(point, z))
    }
  })
})

describe('corridorTiles', () => {
  // 10 km going east from Annecy.
  const track: LngLat[] = [[6.1, 45.9], [6.23, 45.9]]

  it('covers the whole track, without holes on long segments', () => {
    const tiles = corridorTiles(track, 14, 0)
    const xs = tiles.map(t => Number(t.split('/')[1]))
    const [start, end] = [tileAt(track[0]!, 14).x, tileAt(track[1]!, 14).x]
    for (let x = start; x <= end; x++) expect(xs).toContain(x)
  })

  it('widens with the corridor, and stays small at low zoom', () => {
    expect(corridorTiles(track, 14, 1000).length).toBeGreaterThan(corridorTiles(track, 14, 0).length)
    expect(corridorTiles(track, 10, 1000).length).toBeLessThanOrEqual(4)
  })
})

describe('offlineTiles', () => {
  // A 10 km square loop: its inside is far from the track.
  const loop: LngLat[] = [[6.1, 45.9], [6.23, 45.9], [6.23, 45.99], [6.1, 45.99], [6.1, 45.9]]
  const center: LngLat = [6.165, 45.945]
  const has = (tiles: string[], point: LngLat, z: number) => tiles.includes(`${z}/${tileAt(point, z).x}/${tileAt(point, z).y}`)

  it('keeps the whole area at low zoom, e.g. the inside of a loop', () => {
    expect(has(offlineTiles(loop, OFFLINE_AREA_MAX_ZOOM), center, OFFLINE_AREA_MAX_ZOOM)).toBe(true)
    expect(areaTiles(loop, 11, 1000).length).toBeGreaterThanOrEqual(corridorTiles(loop, 11, 1000).length)
  })

  it('keeps only the corridor at walking scale', () => {
    expect(has(offlineTiles(loop, 15), center, 15)).toBe(false)
  })

  it('falls back to the corridor when the area would cost much more (long diagonal route)', () => {
    const diagonal: LngLat[] = [[5.5, 45.3], [6.8, 46.3]]
    expect(offlineTiles(diagonal, 12)).toEqual(corridorTiles(diagonal, 12, 1000))
  })
})

describe('withNeighbours', () => {
  it('adds the 8 neighbours of each tile, wrapping around the antimeridian', () => {
    expect(withNeighbours(['10/5/5']).sort()).toEqual([
      '10/4/4', '10/4/5', '10/4/6', '10/5/4', '10/5/5', '10/5/6', '10/6/4', '10/6/5', '10/6/6',
    ])
    expect(withNeighbours(['2/0/0'])).toContain('2/3/1')
    expect(withNeighbours(['2/0/0']).some(t => t.endsWith('/-1'))).toBe(false)
  })
})

describe('isOfflinePagePath', () => {
  it('only lets the follow page and the route data be served offline', () => {
    expect(isOfflinePagePath(`/routes/${ID}/follow`)).toBe(true)
    expect(isOfflinePagePath(`/api/routes/${ID}`)).toBe(true)
    expect(isOfflinePagePath(`/routes/${ID}`)).toBe(false)
    expect(isOfflinePagePath(`/api/routes/${ID}/gpx`)).toBe(false)
  })
})

describe('mapResourceUrls', () => {
  const STYLE_URL = 'https://maps.test/style.json?key=k'
  const style = {
    sprite: 'https://maps.test/sprite',
    glyphs: 'https://maps.test/fonts/{fontstack}/{range}.pbf?key=k',
    sources: {
      streets: { type: 'vector', url: 'https://maps.test/streets.json?key=k' },
      relief: { type: 'raster-dem', tiles: ['https://maps.test/dem/{z}/{x}/{y}.webp?key=k'], maxzoom: 12 },
      points: { type: 'geojson', data: {} },
    },
    layers: [
      { type: 'symbol', layout: { 'text-font': ['Roboto Regular', 'Noto Sans Regular'] } },
      { type: 'symbol', layout: { 'text-font': ['step', ['zoom'], ['literal', ['Roboto Bold']], 15, ['literal', ['Roboto Italic']]] } },
      { type: 'symbol', layout: { 'text-field': '{name}' } },
      { type: 'line', layout: {} },
    ],
  }
  const tileJson = { tiles: ['https://maps.test/streets/{z}/{x}/{y}.pbf?key=k'], minzoom: 0, maxzoom: 14 }
  const fetchJson = async (url: string) => (url === STYLE_URL ? style : tileJson) as Record<string, unknown>
  const track: LngLat[] = [[6.1, 45.9], [6.12, 45.91]]

  it('lists what MapLibre loads: style, sprites, fonts, TileJSON and tiles', async () => {
    const urls = await mapResourceUrls(STYLE_URL, track, fetchJson)
    expect(urls).toContain(STYLE_URL)
    expect(urls).toContain('https://maps.test/sprite@2x.png')
    expect(urls).toContain('https://maps.test/sprite.json')
    expect(urls).toContain('https://maps.test/fonts/Roboto Regular,Noto Sans Regular/0-255.pbf?key=k')
    expect(urls).toContain('https://maps.test/fonts/Roboto Bold/256-511.pbf?key=k')
    expect(urls).toContain('https://maps.test/fonts/Roboto Italic/8192-8447.pbf?key=k')
    // Default font of a label layer without one; never the "zoom" of an expression.
    expect(urls).toContain('https://maps.test/fonts/Open Sans Regular,Arial Unicode MS Regular/0-255.pbf?key=k')
    expect(urls.some(url => url.includes('/fonts/zoom/'))).toBe(false)
    expect(urls).toContain('https://maps.test/streets.json?key=k')
    const { x, y } = tileAt(track[0]!, 14)
    expect(urls).toContain(`https://maps.test/streets/14/${x}/${y}.pbf?key=k`)
  })

  it('adds the neighbouring tiles of elevation sources only', async () => {
    const urls = await mapResourceUrls(STYLE_URL, track, fetchJson)
    const count = (prefix: string, z: number) => urls.filter(u => u.startsWith(`${prefix}${z}/`)).length
    expect(count('https://maps.test/dem/', 12)).toBeGreaterThan(count('https://maps.test/streets/', 12))
  })

  it('keeps each source within its zoom levels and the offline ones', async () => {
    const urls = await mapResourceUrls(STYLE_URL, track, fetchJson)
    const zooms = (prefix: string) => new Set(urls.filter(u => u.startsWith(prefix)).map(u => Number(u.slice(prefix.length).split('/')[0])))
    expect(Math.min(...zooms('https://maps.test/streets/'))).toBe(OFFLINE_MIN_ZOOM)
    expect(Math.max(...zooms('https://maps.test/streets/'))).toBe(14)
    expect(Math.max(...zooms('https://maps.test/dem/'))).toBe(12)
    expect(OFFLINE_MAX_ZOOM).toBeGreaterThanOrEqual(14)
  })
})
