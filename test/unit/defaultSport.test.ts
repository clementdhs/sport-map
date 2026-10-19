import { describe, expect, it } from 'vitest'
import { parseDefaultSport } from '~/utils/defaultSport'

describe('parseDefaultSport', () => {
  it('keeps a known sport', () => {
    expect(parseDefaultSport('trail')).toBe('trail')
    expect(parseDefaultSport('mountain_biking')).toBe('mountain_biking')
  })

  it('falls back to none for nothing or an unknown sport', () => {
    expect(parseDefaultSport(undefined)).toBeNull()
    expect(parseDefaultSport(null)).toBeNull()
    expect(parseDefaultSport('swimming')).toBeNull()
    expect(parseDefaultSport(['running'])).toBeNull()
  })
})
