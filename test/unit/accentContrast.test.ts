import { describe, expect, it } from 'vitest'
import { ACCENT_COLORS, ACCENTS } from '#shared/utils/theme'
import { contrast, read, theme, veilContrast } from './contrast'

// Contrast checker for the terrain accents (#228, WCAG 2 AA: 4.5:1 for normal text), on the palettes of main.css as
// Nuxt UI uses them: primary is 600 in light mode (main.css), 400 in dark mode, on the topo theme's backgrounds and
// inverted text (white in light mode, the ink in dark mode).
const css = read('../../app/assets/css/main.css')
const palette = (name: string): Record<number, string> => Object.fromEntries(
  [...css.matchAll(new RegExp(`--color-${name}-(\\d+): (#[\\da-f]{6});`, 'g'))].map(([, shade, hex]) => [Number(shade), hex!]),
)
const [light, dark] = [theme('light'), theme('dark')]

// Every pair where the accent carries text: buttons and active pill tabs (inverted text on primary), links and
// active link tabs (primary on the page, the surfaces and elevated surfaces), soft badges and the active settings
// section (primary on 10 % of itself over a surface), soft buttons' hover (15 %).
function ratios(primary: string, color: typeof light) {
  return {
    'inverted on primary': contrast(color('--ui-text-inverted'), primary),
    'primary on paper': contrast(primary, color('--ui-bg-paper')),
    'primary on background': contrast(primary, color('--ui-bg')),
    'primary on elevated': contrast(primary, color('--ui-bg-elevated')),
    'primary on soft primary': veilContrast(primary, primary, 0.1, color('--ui-bg')),
    'primary on hovered soft primary': veilContrast(primary, primary, 0.15, color('--ui-bg')),
  }
}

describe('accent contrast', () => {
  it.each(ACCENTS)('has a full palette in main.css: %s', (accent) => {
    expect(Object.keys(palette(accent)).map(Number)).toEqual([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950])
  })

  it.each(ACCENTS)('passes AA in light mode with 600: %s', (accent) => {
    for (const [pair, value] of Object.entries(ratios(palette(accent)[600]!, light))) {
      expect(value, `${accent} 600, ${pair}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(ACCENTS)('passes AA in dark mode with 400: %s', (accent) => {
    for (const [pair, value] of Object.entries(ratios(palette(accent)[400]!, dark))) {
      expect(value, `${accent} 400, ${pair}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('gives the swatches and theme-color the light and dark shades of main.css', () => {
    for (const accent of ACCENTS) {
      expect(ACCENT_COLORS[accent], accent).toEqual({ light: palette(accent)[600], dark: palette(accent)[400] })
    }
  })

  it('uses 600 as the light-mode primary', () => {
    expect(css).toContain(':root:not(.dark) {\n  --ui-primary: var(--ui-color-primary-600);\n}')
  })
})
