import { describe, expect, it } from 'vitest'
import { ACCENT_COLORS, ACCENTS, DEFAULT_ACCENT, toAccent } from '#shared/utils/theme'

describe('toAccent', () => {
  it('keeps a known accent', () => {
    for (const accent of ACCENTS) expect(toAccent(accent)).toBe(accent)
  })

  it('falls back to the default for anything else (missing or tampered cookie)', () => {
    expect(DEFAULT_ACCENT).toBe('indigo')
    for (const value of [undefined, null, '', 'red', 'Indigo', 42]) expect(toAccent(value)).toBe(DEFAULT_ACCENT)
  })

  it('has a color for every accent', () => {
    expect(Object.keys(ACCENT_COLORS).sort()).toEqual([...ACCENTS].sort())
  })
})
