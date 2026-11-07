import { describe, expect, it } from 'vitest'
import { SPORT_TYPES } from '#shared/utils/routes'
import { endMarker, markerDrawing, SPORT_MARK_COLORS, sportMarker, startMarker, viaMarker } from '~/utils/mapMarkers'

describe('markerDrawing', () => {
  it('reads the kind and its argument from the image name', () => {
    expect(markerDrawing('sm-start', 'light')).toEqual(startMarker('light'))
    expect(markerDrawing('sm-end', 'dark')).toEqual(endMarker('dark'))
    expect(markerDrawing('sm-via-12', 'dark')).toEqual(viaMarker('dark', 12))
    expect(markerDrawing('sm-sport-trail', 'light')).toEqual(sportMarker('light', 'trail'))
  })

  it('keeps the size of each image in both modes, so it can be redrawn in place', () => {
    for (const id of ['sm-start', 'sm-end', 'sm-via-7', 'sm-via-42', 'sm-sport-hiking']) {
      const { width, height } = markerDrawing(id, 'light')!
      expect(markerDrawing(id, 'dark')).toMatchObject({ width, height })
    }
  })

  it('ignores other images and unknown arguments', () => {
    for (const id of ['triangle', 'gps-arrow', 'sm-flag', 'sm-via-', 'sm-via-x', 'sm-sport-golf', 'sm-sport']) {
      expect(markerDrawing(id, 'light')).toBeUndefined()
    }
  })
})

describe('markers', () => {
  it('draws the start as a yellow square, the waypoints as ink squares with their number', () => {
    expect(startMarker('light').shapes[0]).toMatchObject({ fill: '#f4c430', stroke: '#1d2520' })
    expect(viaMarker('light', 3)).toMatchObject({ shapes: [{ fill: '#1d2520' }], label: { text: '3', color: '#fbf8f1' } })
    // Cream squares on the dark map.
    expect(viaMarker('dark', 3)).toMatchObject({ shapes: [{ fill: '#ece6d6' }], label: { color: '#141815' } })
  })

  it('widens waypoints with long numbers', () => {
    expect(viaMarker('light', 7).width).toBe(18)
    expect(viaMarker('light', 123).width).toBeGreaterThan(viaMarker('light', 12).width)
    expect(viaMarker('light', 12).width).toBeGreaterThan(18)
  })

  it('gives each sport its waymark colour in both modes', () => {
    for (const sport of SPORT_TYPES) {
      for (const mode of ['light', 'dark'] as const) {
        expect(sportMarker(mode, sport).shapes.at(-1)!.fill).toBe(SPORT_MARK_COLORS[sport][mode])
      }
    }
  })
})
