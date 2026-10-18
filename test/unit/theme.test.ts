import { describe, expect, it } from 'vitest'
import fr from '../../i18n/locales/fr.json'
import { ACCENT_COLORS, ACCENT_LIGHT_SHADES, ACCENTS, DEFAULT_ACCENT, toAccent } from '#shared/utils/theme'

describe('accents', () => {
  it('offers 10 accents, without the orange of the tracks nor the red of errors', () => {
    expect(ACCENTS).toHaveLength(10)
    expect(new Set(ACCENTS).size).toBe(10)
    for (const excluded of ['orange', 'red', 'amber', 'rose']) expect(ACCENTS).not.toContain(excluded)
  })

  it('keeps the four accents offered before (#144), so a saved choice still applies', () => {
    for (const accent of ['indigo', 'violet', 'sky', 'green']) expect(toAccent(accent)).toBe(accent)
  })

  it('has a shade, a color and a label for every accent', () => {
    for (const map of [ACCENT_COLORS, ACCENT_LIGHT_SHADES, fr.theme.accents]) {
      expect(Object.keys(map).sort()).toEqual([...ACCENTS].sort())
    }
  })
})

describe('toAccent', () => {
  it('keeps a known accent', () => {
    for (const accent of ACCENTS) expect(toAccent(accent)).toBe(accent)
  })

  it('falls back to the default for anything else (missing or tampered cookie)', () => {
    expect(DEFAULT_ACCENT).toBe('indigo')
    for (const value of [undefined, null, '', 'red', 'Indigo', 42]) expect(toAccent(value)).toBe(DEFAULT_ACCENT)
  })
})
