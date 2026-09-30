// @vitest-environment happy-dom
// Reading GPX needs DOMParser, which Node does not provide.
import { describe, expect, it } from 'vitest'
import { MAX_ROUTE_POINTS, type LngLat } from '#shared/utils/routes'
import { readGpxFile } from '~/utils/gpx'
import { buildGpx, gpxFileName } from '../../server/utils/gpxBuilder'

const track: LngLat[] = [[6.102081, 45.906999], [6.110512, 45.912001], [6.123456, 45.920001]]

function gpxFile(xml: string) {
  return new File([xml], 'trace.gpx', { type: 'application/gpx+xml' })
}

function trackpoints(count: number, withElevation = true) {
  return Array.from({ length: count }, (_, i) => {
    const lat = (45.9 + i * 0.00002).toFixed(6)
    return withElevation
      ? `<trkpt lat="${lat}" lon="6.12"><ele>${500 + (i % 7)}</ele></trkpt>`
      : `<trkpt lat="${lat}" lon="6.12"/>`
  }).join('')
}

describe('buildGpx', () => {
  it('writes the track with elevations', () => {
    const xml = buildGpx({ name: 'Boucle', description: null, type: 'hiking', coordinates: track, elevations: [445, 470, 512] })
    expect(xml).toContain('<trkpt lat="45.906999" lon="6.102081"><ele>445</ele></trkpt>')
    expect(xml).toContain('<type>hiking</type>')
    expect(xml).not.toContain('<desc>')
  })

  it('omits elevations when unknown', () => {
    const xml = buildGpx({ name: 'Boucle', description: null, type: 'running', coordinates: track, elevations: null })
    expect(xml).toContain('<trkpt lat="45.906999" lon="6.102081"/>')
    expect(xml).not.toContain('<ele>')
  })

  it('escapes user text', () => {
    const xml = buildGpx({ name: 'Lac & <crêtes>', description: '"Top" l\'été', type: 'hiking', coordinates: track, elevations: null })
    expect(xml).toContain('<name>Lac &amp; &lt;crêtes&gt;</name>')
    expect(xml).toContain('<desc>&quot;Top&quot; l&apos;été</desc>')
  })
})

describe('gpxFileName', () => {
  it('builds an ASCII slug', () => {
    expect(gpxFileName('Tour du lac d\'Annecy — été 2026')).toBe('tour-du-lac-d-annecy-ete-2026.gpx')
  })

  it('falls back when nothing is left', () => {
    expect(gpxFileName('🏃‍♀️')).toBe('parcours.gpx')
  })
})

describe('readGpxFile', () => {
  it('reads back an exported route', async () => {
    const xml = buildGpx({ name: 'Boucle', description: null, type: 'hiking', coordinates: track, elevations: [445, 470, 512] })
    const imported = await readGpxFile(gpxFile(xml))
    expect(imported).toEqual({ name: 'Boucle', coordinates: track, elevations: [445, 470, 512] })
  })

  it('joins the segments of a track', async () => {
    const xml = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Deux tronçons</name>
      <trkseg><trkpt lat="45.9" lon="6.1"/><trkpt lat="45.91" lon="6.1"/></trkseg>
      <trkseg><trkpt lat="45.92" lon="6.1"/><trkpt lat="45.93" lon="6.1"/></trkseg></trk></gpx>`
    const imported = await readGpxFile(gpxFile(xml))
    expect(imported.coordinates).toHaveLength(4)
    expect(imported.elevations).toBeNull()
  })

  it('resamples a GPS watch recording under the point limit', async () => {
    // 20,000 points about 2 m apart.
    const xml = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>${trackpoints(20_000)}</trkseg></trk></gpx>`
    const imported = await readGpxFile(gpxFile(xml))
    expect(imported.coordinates.length).toBeLessThanOrEqual(MAX_ROUTE_POINTS)
    expect(imported.elevations).toHaveLength(imported.coordinates.length)
    expect(imported.coordinates[0]).toEqual([6.12, 45.9])
    expect(imported.coordinates.at(-1)).toEqual([6.12, Number((45.9 + 19_999 * 0.00002).toFixed(6))])
  })

  it('rejects a file without track', async () => {
    const xml = '<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><wpt lat="45.9" lon="6.1"/></gpx>'
    await expect(readGpxFile(gpxFile(xml))).rejects.toThrow('errors.gpxNoTrack')
  })

  it('rejects something that is not XML', async () => {
    await expect(readGpxFile(gpxFile('ceci n\'est pas du xml <<<'))).rejects.toThrow()
  })
})

describe('buildGpx with points of interest', () => {
  it('writes them as waypoints before the track', () => {
    const xml = buildGpx({
      name: 'Boucle',
      description: null,
      type: 'hiking',
      coordinates: track,
      elevations: null,
      pois: [{ type: 'water', coordinates: [6.11, 45.91], note: 'Fontaine <potable>' }, { type: 'parking', coordinates: [6.1, 45.9] }],
    })
    expect(xml).toContain('<wpt lat="45.91" lon="6.11"><name>Point d&apos;eau</name><desc>Fontaine &lt;potable&gt;</desc><type>water</type></wpt>')
    expect(xml).toContain('<wpt lat="45.9" lon="6.1"><name>Parking</name><type>parking</type></wpt>')
    expect(xml.indexOf('<wpt')).toBeLessThan(xml.indexOf('<trk>'))
  })
})
