import { describe, expect, it } from 'vitest'
import {
  buildRouteOgSvg,
  escapeXml,
  estimateTextWidth,
  type OgRoute,
  projectTrack,
  wrapText,
} from '../../server/utils/ogImage'

const BOX = { x: 100, y: 50, width: 400, height: 200 }

describe('projectTrack', () => {
  it('fits the track in the box, centred, keeping its proportions', () => {
    // A square around the equator: limited by the box height, centred horizontally.
    const points = projectTrack([[0, 0], [1, 0], [1, 1], [0, 1]], BOX)
    const xs = points.map(p => p[0])
    const ys = points.map(p => p[1])
    expect(Math.min(...ys)).toBe(50)
    expect(Math.max(...ys)).toBe(250)
    expect(Math.min(...xs)).toBeCloseTo(200, 0)
    expect(Math.max(...xs)).toBeCloseTo(400, 0)
  })

  it('draws north at the top', () => {
    const [south, north] = projectTrack([[6, 45], [6, 46]], BOX)
    expect(north![1]).toBeLessThan(south![1])
  })

  it('drops points closer than 1 px but keeps the real end', () => {
    const points = projectTrack([[0, 0], [0.0001, 0], [1, 0], [1.0001, 0]], BOX)
    expect(points).toEqual([[100, 150], [500, 150]])
  })

  it('handles a single point', () => {
    expect(projectTrack([[6, 45], [6, 45]], BOX)).toEqual([[300, 150]])
  })
})

describe('wrapText', () => {
  it('keeps a short text on one line', () => {
    expect(wrapText('Tour du lac', 52, 520, 2)).toEqual(['Tour du lac'])
  })

  it('wraps on words', () => {
    const lines = wrapText('Grande traversée des crêtes du Semnoz', 52, 520, 3)
    expect(lines.length).toBe(2)
    expect(lines.join(' ')).toBe('Grande traversée des crêtes du Semnoz')
    for (const line of lines) expect(estimateTextWidth(line, 52)).toBeLessThanOrEqual(520)
  })

  it('ends with an ellipsis when the text needs more lines', () => {
    const lines = wrapText('Un très long nom de parcours qui ne tient vraiment pas sur deux lignes du tout', 52, 520, 2)
    expect(lines).toHaveLength(2)
    expect(lines[1]).toMatch(/…$/)
    expect(estimateTextWidth(lines[1]!, 52)).toBeLessThanOrEqual(520)
  })

  it('cuts a word longer than a line', () => {
    const [line] = wrapText('Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 52, 520, 2)
    expect(line).toMatch(/…$/)
    expect(estimateTextWidth(line!, 52)).toBeLessThanOrEqual(520)
  })
})

describe('buildRouteOgSvg', () => {
  const route: OgRoute = {
    name: 'Tour <du> & "lac"',
    sport: 'hiking',
    distanceM: 43930,
    elevationGainM: 1528,
    coordinates: [[6.1, 45.9], [6.2, 45.95], [6.3, 45.9]],
    elevations: [450, 1100, 600],
  }

  it('shows the name, sport and key figures', () => {
    const svg = buildRouteOgSvg(route)
    expect(svg).toContain('width="1200" height="630"')
    expect(svg).toContain('Tour &#60;du&#62; &#38; &#34;lac&#34;')
    expect(svg).toContain('>Randonnée<')
    expect(svg).toContain('>43,93 km<')
    expect(svg).toContain('>1528 m<')
    expect(svg).toContain('>~11 h 20<')
  })

  it('draws the elevation profile only when elevations match the track', () => {
    expect(buildRouteOgSvg(route)).toContain('fill-opacity="0.15"')
    expect(buildRouteOgSvg({ ...route, elevations: null })).not.toContain('fill-opacity="0.15"')
    expect(buildRouteOgSvg({ ...route, elevations: [1, 2] })).not.toContain('fill-opacity="0.15"')
  })

  it('shows a dash when the elevation gain is unknown', () => {
    expect(buildRouteOgSvg({ ...route, elevationGainM: null })).toContain('>—<')
  })
})

describe('escapeXml', () => {
  it('escapes markup characters', () => {
    expect(escapeXml(`<a href="x">'&'</a>`)).not.toMatch(/[<>"'&](?!#)/)
  })
})
