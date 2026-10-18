import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import colors from 'tailwindcss/colors'
import { describe, expect, it } from 'vitest'
import { ACCENT_COLORS, ACCENT_LIGHT_SHADES, ACCENTS, type Accent } from '#shared/utils/theme'

// Contrast checker for the accent colors (WCAG 2 AA: 4.5:1 for normal text), on Tailwind 4's palette (OKLCH) as
// Nuxt UI uses it: primary is the light shade in light mode (main.css), 400 in dark mode, and Nuxt UI's
// backgrounds and inverted text come from the neutral palette set in app config.
const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
const neutralName = read('../../app/app.config.ts').match(/neutral: '(\w+)'/)![1]!
const palette = (name: string) => (colors as unknown as Record<string, Record<number, string>>)[name]!
const neutral = palette(neutralName)

type Rgb = [number, number, number]

// OKLCH to linear sRGB (Björn Ottosson's OKLab matrices). Channels can fall outside [0, 1] for wide-gamut colors.
function toLinear(color: string): Rgb {
  if (color === '#fff') return [1, 1, 1]
  const [, l, c, h] = color.match(/^oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\)$/)!.map(Number) as [number, number, number, number]
  const L = l / 100
  const a = c * Math.cos(h * Math.PI / 180)
  const b = c * Math.sin(h * Math.PI / 180)
  const lms = [
    (L + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    (L - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    (L - 0.0894841775 * a - 1.291485548 * b) ** 3,
  ] as const
  return [
    4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2],
    -1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2],
    -0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2],
  ]
}

const clip = (rgb: Rgb) => rgb.map(v => Math.min(1, Math.max(0, v))) as Rgb
const encode = (v: number) => v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
const decode = (v: number) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
const luminance = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b

function ratio(a: Rgb, b: Rgb) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

// The worse of the color as specified (wide-gamut screens) and as clipped to sRGB (other screens).
const contrast = (text: string, background: string) =>
  Math.min(ratio(toLinear(text), toLinear(background)), ratio(clip(toLinear(text)), clip(toLinear(background))))

// Soft and subtle variants (`bg-primary/10 text-primary`): the color at 10 % over the background, blended the way
// browsers composite, on gamma-encoded sRGB.
function softContrast(color: string, background: string) {
  const [fg, bg] = [clip(toLinear(color)), clip(toLinear(background))]
  const soft = fg.map((v, i) => decode(0.1 * encode(v) + 0.9 * encode(bg[i]!))) as Rgb
  return ratio(fg, soft)
}

const toHex = (color: string) =>
  `#${clip(toLinear(color)).map(v => Math.round(encode(v) * 255).toString(16).padStart(2, '0')).join('')}`

// Every pair where the accent carries text: buttons and active pill tabs (inverted text on primary), links and
// active link tabs (primary on the page and on elevated surfaces), soft badges and the active settings section.
function lightRatios(accent: Accent, shade: number) {
  const primary = palette(accent)[shade]!
  return {
    'white on primary': contrast('#fff', primary),
    'primary on background': contrast(primary, '#fff'),
    'primary on elevated': contrast(primary, neutral[100]!),
    'primary on soft primary': softContrast(primary, '#fff'),
  }
}

function darkRatios(accent: Accent) {
  const primary = palette(accent)[400]!
  return {
    'inverted on primary': contrast(neutral[900]!, primary),
    'primary on background': contrast(primary, neutral[900]!),
    'primary on elevated': contrast(primary, neutral[800]!),
    'primary on soft primary': softContrast(primary, neutral[900]!),
  }
}

const passesAA = (ratios: Record<string, number>) => Object.values(ratios).every(value => value >= 4.5)

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
    const css = read('../../app/assets/css/main.css').replaceAll('\r\n', '\n')
    for (const shade of new Set(Object.values(ACCENT_LIGHT_SHADES))) {
      const selector = shade === 600 ? ':root:not(.dark) {' : `:root:not(.dark)[data-accent-shade="${shade}"] {`
      expect(css, `shade ${shade}`).toContain(`${selector}\n  --ui-primary: var(--ui-color-primary-${shade});`)
    }
  })
})
