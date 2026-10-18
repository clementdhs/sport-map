// Accent colors the user can pick (the Nuxt UI "primary" color, so Tailwind palette names), on top of the
// light / dark mode, in hue order. No orange (the map tracks) nor red (errors, end marker). `yellow` is shown as
// « Ambre »: Tailwind's amber, once dark enough for white text, is the orange of the tracks.
export const ACCENTS = ['indigo', 'violet', 'fuchsia', 'pink', 'yellow', 'lime', 'green', 'teal', 'sky', 'slate'] as const
export type Accent = typeof ACCENTS[number]

// Indigo stands out from the map (forests, water) and from the orange tracks.
export const DEFAULT_ACCENT: Accent = 'indigo'

// The shade primary uses in light mode: the lightest one where white text on buttons, links on the background and
// text on a soft (10 %) primary background all pass WCAG AA (test/unit/accentContrast.test.ts). Dark mode keeps
// Nuxt UI's 400 with dark text.
export const ACCENT_LIGHT_SHADES: Record<Accent, 600 | 700 | 800> = {
  indigo: 600,
  violet: 600,
  fuchsia: 700,
  pink: 700,
  yellow: 800,
  lime: 800,
  green: 800,
  teal: 700,
  sky: 700,
  slate: 600,
}

// That shade as an sRGB hex value, for what CSS can't reach (theme-color meta, swatches).
export const ACCENT_COLORS: Record<Accent, string> = {
  indigo: '#4f39f6',
  violet: '#7f22fe',
  fuchsia: '#a800b7',
  pink: '#c6005c',
  yellow: '#894b00',
  lime: '#3c6300',
  green: '#016630',
  teal: '#00786f',
  sky: '#0069a8',
  slate: '#45556c',
}

// Icons, link previews and the manifest can't follow the user's choice: they use the default accent, as it was
// drawn in public/icon.svg (Tailwind 3's indigo 600).
export const BRAND_COLOR = '#4f46e5'

export function toAccent(value: unknown): Accent {
  return ACCENTS.includes(value as Accent) ? value as Accent : DEFAULT_ACCENT
}
