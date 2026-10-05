import { describe, expect, it } from 'vitest'
import { DEFAULT_SIDE_PANEL, parseSidePanel } from '~/utils/sidePanel'

describe('parseSidePanel', () => {
  it('reads a saved state', () => {
    expect(parseSidePanel('{"collapsed":true}')).toEqual({ collapsed: true })
    expect(parseSidePanel('{"collapsed":false}')).toEqual({ collapsed: false })
  })

  it('falls back to the default on missing or broken values', () => {
    expect(parseSidePanel(null)).toEqual(DEFAULT_SIDE_PANEL)
    expect(parseSidePanel('not json')).toEqual(DEFAULT_SIDE_PANEL)
    expect(parseSidePanel('null')).toEqual(DEFAULT_SIDE_PANEL)
    expect(parseSidePanel('{"collapsed":"yes"}')).toEqual(DEFAULT_SIDE_PANEL)
  })
})
