// @vitest-environment happy-dom
// Reading GPX and TCX needs DOMParser, which Node does not provide.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { recordingSchema } from '#shared/utils/routes'
import {
  fitOuting,
  importPayload,
  importedOuting,
  importedSport,
  outingFileType,
  parseFitOuting,
  parseGpxOuting,
  parseTcxOuting,
  readOutingFile,
  type ParsedOuting,
} from '~/utils/outingImport'
import { fitActivity, TRAIL_FIT } from '../fixtures/outings/fit'

const fixture = (name: string) => readFileSync(resolve('test/fixtures/outings', name), 'utf8')
const fitBuffer = () => {
  const bytes = fitActivity(TRAIL_FIT)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
const defaults = { name: 'Sortie du 5 oct.', sport: 'hiking' as const }

describe('outingFileType', () => {
  it('knows the three formats whatever the case', () => {
    expect(outingFileType('Morning_Run.GPX')).toBe('gpx')
    expect(outingFileType('2026-10-09-17-00-00.fit')).toBe('fit')
    expect(outingFileType('activity.tcx')).toBe('tcx')
    expect(outingFileType('export.zip')).toBeNull()
    expect(outingFileType('fit')).toBeNull()
  })
})

describe('importedSport', () => {
  it('maps the words of watches and apps to our sports', () => {
    expect(importedSport('running')).toBe('running')
    expect(importedSport('running', 'trail')).toBe('trail')
    expect(importedSport('trail_running')).toBe('trail')
    expect(importedSport('Biking')).toBe('cycling')
    expect(importedSport('cycling', 'mountain')).toBe('mountain_biking')
    expect(importedSport('cycling', 'road')).toBe('road_cycling')
    expect(importedSport('mountain_biking')).toBe('mountain_biking')
    expect(importedSport('Road Biking')).toBe('road_cycling')
    expect(importedSport('walking')).toBe('hiking')
    expect(importedSport('hiking')).toBe('hiking')
  })

  it('leaves other sports to the member default', () => {
    expect(importedSport('swimming')).toBeNull()
    expect(importedSport('Other')).toBeNull()
    expect(importedSport('9')).toBeNull()
    expect(importedSport(null)).toBeNull()
  })
})

describe('parseGpxOuting', () => {
  it('reads the name, sport, positions, altitudes and times', () => {
    const outing = parseGpxOuting(fixture('run.gpx'))
    expect(outing.name).toBe('Footing du lac')
    expect(outing.sport).toBe('running')
    expect(outing.samples).toHaveLength(5)
    expect(outing.samples[0]).toEqual({ lng: 6.12, lat: 45.9, alt: 450, t: Date.parse('2026-10-05T06:30:00Z') })
    expect(outing.startedAt).toBeUndefined()
  })

  it('joins every track of the file', () => {
    const point = (lat: number, time: string) => `<trkpt lat="${lat}" lon="6.12"><time>2026-10-05T06:${time}Z</time></trkpt>`
    const gpx = `<gpx><trk><name>Avant</name><trkseg>${point(45.9, '30:00')}${point(45.901, '31:00')}</trkseg></trk>`
      + `<trk><name>Après</name><trkseg>${point(45.902, '40:00')}${point(45.903, '41:00')}</trkseg></trk></gpx>`
    const outing = parseGpxOuting(gpx)
    expect(outing.name).toBe('Avant')
    expect(outing.samples).toHaveLength(4)
  })

  it('refuses a track without times, which is a route, not an outing', () => {
    const gpx = '<gpx><trk><trkseg><trkpt lat="45.9" lon="6.12"/><trkpt lat="45.91" lon="6.12"/></trkseg></trk></gpx>'
    expect(() => parseGpxOuting(gpx)).toThrow('errors.importNoTimes')
  })

  it('refuses a file without track or that is not XML', () => {
    expect(() => parseGpxOuting('<gpx><wpt lat="45.9" lon="6.12"/></gpx>')).toThrow('errors.importNoTrack')
    expect(() => parseGpxOuting('not xml <')).toThrow('errors.importInvalid')
  })
})

describe('parseTcxOuting', () => {
  it('sums the laps and skips points without a position', () => {
    const outing = parseTcxOuting(fixture('ride.tcx'))
    expect(outing.sport).toBe('cycling')
    expect(outing.startedAt).toBe(Date.parse('2026-10-07T15:00:00Z'))
    expect(outing.movingS).toBe(160)
    expect(outing.distanceM).toBe(2400)
    expect(outing.samples.map(sample => sample.alt)).toEqual([500, 510, 520])
  })
})

describe('parseFitOuting', () => {
  it('reads the records and the session of a watch file', async () => {
    const outing = await parseFitOuting(fitBuffer())
    expect(outing.sport).toBe('trail')
    expect(outing.startedAt).toBe(TRAIL_FIT.start.getTime())
    expect(outing.durationS).toBe(180)
    expect(outing.movingS).toBe(150)
    expect(outing.distanceM).toBe(335)
    expect(outing.samples).toHaveLength(4)
    expect(outing.samples[1]!.lat).toBeCloseTo(45.951, 6)
    expect(outing.samples[1]!.lng).toBeCloseTo(6.13, 6)
    expect(outing.samples[1]!.alt).toBe(705)
  })

  it('refuses bytes that are not a FIT file', async () => {
    await expect(parseFitOuting(new TextEncoder().encode('<gpx/>').buffer as ArrayBuffer)).rejects.toThrow('errors.importInvalid')
  })

  it('spans every session of a multisport file and ignores invalid altitudes', () => {
    const outing = fitOuting({
      records: [{ timestamp: '2026-10-01T07:00:00Z', position_lat: 45.9, position_long: 6.1, enhanced_altitude: 13_000, altitude: 420 }],
      sessions: [
        { start_time: '2026-10-01T07:00:00Z', sport: 'running', total_elapsed_time: 100, total_timer_time: 90, total_distance: 300 },
        { start_time: '2026-10-01T07:01:40Z', sport: 'cycling', total_elapsed_time: 200, total_timer_time: 200, total_distance: 1000 },
      ],
    })
    expect(outing.samples[0]!.alt).toBe(420)
    expect(outing).toMatchObject({ sport: 'running', durationS: 300, movingS: 290, distanceM: 1300 })
  })
})

describe('importedOuting', () => {
  it('measures what the file does not say with the rules of the GPS recording', () => {
    const outing = importedOuting(parseGpxOuting(fixture('run.gpx')))
    expect(outing.startedAt).toBe(Date.parse('2026-10-05T06:30:00Z'))
    // Up to the last point, standing still at the finish
    expect(outing.durationS).toBe(210)
    // The final stop is not moving
    expect(outing.movingS).toBe(90)
    expect(outing.distanceM).toBeGreaterThan(330)
    expect(outing.distanceM).toBeLessThan(336)
    // The point 1 m from the previous one is GPS jitter
    expect(outing.recording.points).toHaveLength(4)
  })

  it('keeps the totals of the file when it gives them', async () => {
    const outing = importedOuting(await parseFitOuting(fitBuffer()))
    expect(outing).toMatchObject({ durationS: 180, movingS: 150, distanceM: 335, sport: 'trail' })
  })

  it('moves the start back to a point recorded before the session, with the elapsed time', () => {
    const parsed: ParsedOuting = {
      name: null,
      sport: null,
      startedAt: 20_000,
      durationS: 100,
      samples: [{ lng: 6.12, lat: 45.9, alt: null, t: 0 }, { lng: 6.12, lat: 45.901, alt: null, t: 120_000 }],
    }
    expect(importedOuting(parsed)).toMatchObject({ startedAt: 0, durationS: 120 })
  })

  it('never has more moving time than elapsed time', () => {
    const parsed: ParsedOuting = {
      name: null,
      sport: null,
      movingS: 500,
      samples: [{ lng: 6.12, lat: 45.9, alt: null, t: 0 }, { lng: 6.12, lat: 45.901, alt: null, t: 60_000 }],
    }
    expect(importedOuting(parsed)).toMatchObject({ durationS: 60, movingS: 60 })
  })

  it('refuses a track of fewer than 2 points apart', () => {
    const parsed: ParsedOuting = { name: null, sport: null, samples: [{ lng: 6.12, lat: 45.9, alt: null, t: 0 }, { lng: 6.12, lat: 45.90001, alt: null, t: 1000 }] }
    expect(() => importedOuting(parsed)).toThrow('errors.importTooShort')
  })
})

describe('importPayload', () => {
  it('is a valid recording with the file altitudes', async () => {
    const payload = importPayload(importedOuting(await parseFitOuting(fitBuffer())), defaults)
    expect(recordingSchema.safeParse(payload).success).toBe(true)
    expect(payload.route).toMatchObject({ name: defaults.name, sport_type: 'trail', is_public: false, source: 'recorded' })
    expect(payload.route.elevations).toEqual([700, 705, 710, 715])
    expect(payload.started_at).toBe('2026-10-09T17:00:00.000Z')
    // Each point with its altitude, its elapsed time and its moving time so far, the watch's timer time spread
    // over the points
    expect(payload.track!.at(-1)).toEqual([6.13, 45.953, 715, 180, 150])
  })

  it('names the route after the track, else the default, and takes the member sport for an unknown one', () => {
    const gpx = importPayload(importedOuting(parseGpxOuting(fixture('run.gpx'))), defaults)
    expect(gpx.route).toMatchObject({ name: 'Footing du lac', sport_type: 'running' })
    const unknown = importPayload(importedOuting({ ...parseGpxOuting(fixture('run.gpx')), name: null, sport: null }), defaults)
    expect(unknown.route).toMatchObject({ name: defaults.name, sport_type: 'hiking' })
  })

  it('sends no elevations when a point has none', () => {
    const parsed: ParsedOuting = {
      name: null,
      sport: null,
      samples: [{ lng: 6.12, lat: 45.9, alt: 400, t: 0 }, { lng: 6.12, lat: 45.901, alt: null, t: 60_000 }],
    }
    expect(importPayload(importedOuting(parsed), defaults).route.elevations).toBeUndefined()
  })
})

describe('readOutingFile', () => {
  it('reads a file by its extension', async () => {
    const outing = await readOutingFile(new File([fixture('ride.tcx')], 'ride.TCX'))
    expect(outing.sport).toBe('cycling')
  })

  it('refuses another kind of file', async () => {
    await expect(readOutingFile(new File(['x'], 'export.zip'))).rejects.toThrow('errors.importType')
  })
})
