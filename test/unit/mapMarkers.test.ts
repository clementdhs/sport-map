import { describe, expect, it } from 'vitest'
import { SPORT_TYPES } from '#shared/utils/routes'
import { endMarker, markerDrawing, SPORT_MARK_COLORS, sportMarker, startMarker, viaMarker } from '~/utils/mapMarkers'

describe('markerDrawing', () => {
  it('reads the mode, the kind and its argument from the image name', () => {
    expect(markerDrawing('sm-light-start')).toEqual(startMarker('light'))
    expect(markerDrawing('sm-dark-end')).toEqual(endMarker('dark'))
    expect(markerDrawing('sm-dark-via-12')).toEqual(viaMarker('dark', 12))
    expect(markerDrawing('sm-light-sport-trail')).toEqual(sportMarker('light', 'trail'))
  })

  it('ignores other images and unknown arguments', () => {
    for (const id of ['triangle', 'gps-arrow', 'sm-sepia-start', 'sm-light-via-', 'sm-light-via-x', 'sm-light-sport-golf', 'sm-light-sport']) {
      expect(markerDrawing(id)).toBeUndefined()
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
