import colors from 'tailwindcss/colors'
import { describe, expect, it } from 'vitest'
import fr from '../../i18n/locales/fr.json'
import en from '../../i18n/locales/en.json'
import { ACCENT_COLORS, ACCENTS, DEFAULT_ACCENT, LEGACY_ACCENTS, toAccent, type Accent } from '#shared/utils/theme'
import { clip, toLinear } from './contrast'

// The ten Tailwind accents offered before #228 and the light shade they were shown in.
const LEGACY_SHADES = { indigo: 600, violet: 600, fuchsia: 700, pink: 700, yellow: 800, lime: 800, green: 800, teal: 800, sky: 700, slate: 600 } as const

function oklab(color: string) {
  const [r, g, b] = clip(toLinear(color))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}
const distance = (a: string, b: string) => Math.hypot(...oklab(a).map((v, i) => v - oklab(b)[i]!))

describe('accents', () => {
  it('offers five terrain accents, without the orange or rust of the tracks nor the red of errors', () => {
    expect(ACCENTS).toEqual(['forest', 'ochre', 'lake', 'heather', 'slate'])
    for (const excluded of ['orange', 'rust', 'red', 'amber', 'rose']) expect(ACCENTS).not.toContain(excluded)
  })

  it('has colors and a label in both languages for every accent', () => {
    for (const map of [ACCENT_COLORS, fr.theme.accents, en.theme.accents]) {
      expect(Object.keys(map).sort()).toEqual([...ACCENTS].sort())
    }
  })
})

describe('toAccent', () => {
  it('keeps a known accent', () => {
    for (const accent of ACCENTS) expect(toAccent(accent)).toBe(accent)
  })

  it('defaults to forest green for anything else (missing or tampered cookie)', () => {
    expect(DEFAULT_ACCENT).toBe('forest')
    for (const value of [undefined, null, '', 'red', 'Forest', 'constructor', '__proto__', 42]) expect(toAccent(value)).toBe(DEFAULT_ACCENT)
  })

  it('maps every accent offered before #228 to a terrain accent', () => {
    for (const legacy of Object.keys(LEGACY_SHADES)) expect(ACCENTS).toContain(toAccent(legacy))
    expect(toAccent('indigo')).toBe('lake')
    expect(toAccent('violet')).toBe('heather')
    expect(toAccent('yellow')).toBe('ochre')
    expect(toAccent('green')).toBe('forest')
    expect(toAccent('sky')).toBe('lake')
    expect(toAccent('slate')).toBe('slate')
  })

  it('maps each former accent to the nearest terrain accent (OKLab, light shades)', () => {
    const palette = colors as unknown as Record<string, Record<number, string>>
    for (const [legacy, shade] of Object.entries(LEGACY_SHADES)) {
      const former = palette[legacy]![shade]!
      const nearest = [...ACCENTS].sort((a, b) => distance(former, ACCENT_COLORS[a].light) - distance(former, ACCENT_COLORS[b].light))[0] as Accent
      expect(toAccent(legacy), legacy).toBe(nearest)
    }
  })

  it('only lists former accents that are no longer offered', () => {
    for (const legacy of Object.keys(LEGACY_ACCENTS)) expect(ACCENTS).not.toContain(legacy)
  })
})
