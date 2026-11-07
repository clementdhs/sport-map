import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// WCAG 2 contrast helpers for the theme tests, and a reader of main.css's theme variables.

export type Rgb = [number, number, number]

export const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8').replaceAll('\r\n', '\n')

const encode = (v: number) => v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
const decode = (v: number) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4

// A hex or OKLCH color to linear sRGB (Björn Ottosson's OKLab matrices). Channels can fall outside [0, 1] for
// wide-gamut colors.
export function toLinear(color: string): Rgb {
  const hex = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1]
  if (hex) {
    const full = hex.length === 3 ? [...hex].map(c => c + c).join('') : hex
    return [0, 2, 4].map(i => decode(Number.parseInt(full.slice(i, i + 2), 16) / 255)) as Rgb
  }
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

export const clip = (rgb: Rgb) => rgb.map(v => Math.min(1, Math.max(0, v))) as Rgb
const luminance = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b

export function ratio(a: Rgb, b: Rgb) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

// The worse of the color as specified (wide-gamut screens) and as clipped to sRGB (other screens).
export const contrast = (text: string, background: string) =>
  Math.min(ratio(toLinear(text), toLinear(background)), ratio(clip(toLinear(text)), clip(toLinear(background))))

// A color at `alpha` over a background, blended the way browsers composite, on gamma-encoded sRGB.
export function blend(color: string, background: string, alpha: number): Rgb {
  const [fg, bg] = [clip(toLinear(color)), clip(toLinear(background))]
  return fg.map((v, i) => decode(alpha * encode(v) + (1 - alpha) * encode(bg[i]!))) as Rgb
}

// `text` on a veil of `veil` at `alpha` over `background` (soft variants, sport badges in dark mode).
export const veilContrast = (text: string, veil: string, alpha: number, background: string) =>
  ratio(clip(toLinear(text)), blend(veil, background, alpha))

export const toHex = (color: string) =>
  `#${clip(toLinear(color)).map(v => Math.round(encode(v) * 255).toString(16).padStart(2, '0')).join('')}`

// The theme variables of main.css, resolved to colors for each mode: light (`:root`), dark (`.dark`) and the
// outdoor readability mirrors of both (#149). Nuxt UI's neutral palette is the `topo` one defined there.
export type Mode = 'light' | 'dark' | 'outdoor light' | 'outdoor dark'

const css = read('../../app/assets/css/main.css')

function declarations(selector: string) {
  const vars: Record<string, string> = {}
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (const [, body] of css.matchAll(new RegExp(`^${escaped} \\{([^}]*)\\}`, 'gm'))) {
    for (const [, name, value] of body!.matchAll(/(--[\w-]+):\s*([^;]+);/g)) vars[name!] = value!.trim()
  }
  return vars
}

export const neutralName = read('../../app/app.config.ts').match(/neutral: '(\w+)'/)![1]!
export const neutral: Record<number, string> = Object.fromEntries(
  [...css.matchAll(new RegExp(`--color-${neutralName}-(\\d+): (#[\\da-f]{6});`, 'g'))].map(([, shade, hex]) => [Number(shade), hex!]),
)

const blocks = {
  'light': [':root'],
  'dark': [':root', '.dark'],
  'outdoor light': [':root', ':root[data-readability="outdoor"]'],
  'outdoor dark': [':root', '.dark', ':root[data-readability="outdoor"]', ':root.dark[data-readability="outdoor"]'],
} satisfies Record<Mode, string[]>

export function theme(mode: Mode) {
  const vars = Object.assign({}, ...blocks[mode].map(declarations)) as Record<string, string>
  const resolve = (value: string): string => {
    const shade = value.match(/^var\(--ui-color-neutral-(\d+)\)$/)?.[1]
    if (shade) return neutral[Number(shade)]!
    const name = value.match(/^var\((--[\w-]+)\)$/)?.[1]
    if (name) return resolve(vars[name]!)
    if (/^#[\da-f]{3,6}$/i.test(value)) return value
    throw new Error(`${mode}: can't resolve ${value}`)
  }
  return (name: string) => {
    if (!vars[name]) throw new Error(`${mode}: ${name} is not set`)
    return resolve(vars[name])
  }
}
