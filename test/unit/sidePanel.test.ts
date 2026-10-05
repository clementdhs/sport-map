import { describe, expect, it } from 'vitest'
import { DEFAULT_SIDE_PANEL, maxSidePanelWidth, parseSidePanel, sidePanelWidth } from '~/utils/sidePanel'

describe('parseSidePanel', () => {
  it('reads a saved state', () => {
    expect(parseSidePanel('{"collapsed":true,"width":500}')).toEqual({ collapsed: true, width: 500 })
    expect(parseSidePanel('{"collapsed":false,"width":412.6}')).toEqual({ collapsed: false, width: 413 })
  })

  it('keeps the default width when none was saved', () => {
    expect(parseSidePanel('{"collapsed":true}')).toEqual({ collapsed: true, width: 384 })
    expect(parseSidePanel('{"collapsed":false,"width":"wide"}')).toEqual({ collapsed: false, width: 384 })
  })

  it('falls back to the default on missing or broken values', () => {
    expect(parseSidePanel(null)).toEqual(DEFAULT_SIDE_PANEL)
    expect(parseSidePanel('not json')).toEqual(DEFAULT_SIDE_PANEL)
    expect(parseSidePanel('null')).toEqual(DEFAULT_SIDE_PANEL)
    expect(parseSidePanel('{"collapsed":"yes"}')).toEqual(DEFAULT_SIDE_PANEL)
  })
})

describe('sidePanelWidth', () => {
  it('keeps a width between the narrowest and the widest panel', () => {
    expect(sidePanelWidth(500, 1440)).toBe(500)
    expect(sidePanelWidth(100, 1440)).toBe(320)
    expect(sidePanelWidth(2000, 1440)).toBe(720)
  })

  it('leaves the map usable in narrow windows', () => {
    expect(maxSidePanelWidth(768)).toBe(408)
    expect(sidePanelWidth(600, 768)).toBe(408)
    // Never narrower than the narrowest panel, even when the map gets less.
    expect(maxSidePanelWidth(600)).toBe(320)
  })
})
