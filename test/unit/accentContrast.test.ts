import colors from 'tailwindcss/colors'
import { describe, expect, it } from 'vitest'
import { ACCENT_COLORS, ACCENT_LIGHT_SHADES, ACCENTS, type Accent } from '#shared/utils/theme'
import { contrast, read, theme, toHex, veilContrast } from './contrast'

// Contrast checker for the accent colors (WCAG 2 AA: 4.5:1 for normal text), on Tailwind 4's palette (OKLCH) as
// Nuxt UI uses it: primary is the light shade in light mode (main.css), 400 in dark mode, on the topo theme's
// backgrounds and inverted text (main.css, #227).
const palette = (name: string) => (colors as unknown as Record<string, Record<number, string>>)[name]!
const [light, dark] = [theme('light'), theme('dark')]

// Every pair where the accent carries text: buttons and active pill tabs (inverted text on primary), links and
// active link tabs (primary on the page, the surfaces and elevated surfaces), soft badges and the active settings
// section (primary on 10 % of itself over a surface).
function ratios(primary: string, color: typeof light) {
  return {
    'inverted on primary': contrast(color('--ui-text-inverted'), primary),
    'primary on paper': contrast(primary, color('--ui-bg-paper')),
    'primary on background': contrast(primary, color('--ui-bg')),
    'primary on elevated': contrast(primary, color('--ui-bg-elevated')),
    'primary on soft primary': veilContrast(primary, primary, 0.1, color('--ui-bg')),
  }
}

const lightRatios = (accent: Accent, shade: number) => ratios(palette(accent)[shade]!, light)
const darkRatios = (accent: Accent) => ratios(palette(accent)[400]!, dark)

const passesAA = (values: Record<string, number>) => Object.values(values).every(value => value >= 4.5)

describe('accent contrast', () => {
  it.each(ACCENTS)('passes AA in light mode with its shade: %s', (accent) => {
    for (const [pair, value] of Object.entries(lightRatios(accent, ACCENT_LIGHT_SHADES[accent]))) {
      expect(value, `${accent} ${ACCENT_LIGHT_SHADES[accent]}, ${pair}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(ACCENTS)('passes AA in dark mode with 400: %s', (accent) => {
    for (const [pair, value] of Object.entries(darkRatios(accent))) {
      expect(value, `${accent} 400, ${pair}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('uses the lightest shade that passes, so the accent keeps its color', () => {
    for (const accent of ACCENTS) {
      const shade = ACCENT_LIGHT_SHADES[accent]
      if (shade > 600) expect(passesAA(lightRatios(accent, shade - 100)), `${accent} ${shade - 100}`).toBe(false)
    }
  })

  it('gives the swatches and theme-color the hex value of the light shade', () => {
    for (const accent of ACCENTS) expect(ACCENT_COLORS[accent], accent).toBe(toHex(palette(accent)[ACCENT_LIGHT_SHADES[accent]]!))
  })

  it('has a main.css rule for every light shade', () => {
    const css = read('../../app/assets/css/main.css')
    for (const shade of new Set(Object.values(ACCENT_LIGHT_SHADES))) {
      const selector = shade === 600 ? ':root:not(.dark) {' : `:root:not(.dark)[data-accent-shade="${shade}"] {`
      expect(css, `shade ${shade}`).toContain(`${selector}\n  --ui-primary: var(--ui-color-primary-${shade});`)
    }
  })
})
