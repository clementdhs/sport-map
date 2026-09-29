// Accent colors the user can pick (the Nuxt UI "primary" color), on top of the light / dark mode.
export const ACCENTS = ['indigo', 'violet', 'sky', 'green'] as const
export type Accent = typeof ACCENTS[number]

// Indigo stands out from the map (forests, water) and from the orange tracks.
export const DEFAULT_ACCENT: Accent = 'indigo'

export const ACCENT_LABELS: Record<Accent, string> = {
  indigo: 'Indigo',
  violet: 'Violet',
  sky: 'Bleu ciel',
  green: 'Vert',
}

// The shade primary buttons use in light mode: the darkest needed for white text to pass WCAG AA
// (sky and green 600 don't). Dark mode keeps Nuxt UI's 400 with dark text.
export const ACCENT_LIGHT_SHADES: Record<Accent, 600 | 700> = { indigo: 600, violet: 600, sky: 700, green: 700 }

// That shade as a hex value, for what CSS can't reach (theme-color meta, swatches).
export const ACCENT_COLORS: Record<Accent, string> = {
  indigo: '#4f46e5',
  violet: '#7c3aed',
  sky: '#0369a1',
  green: '#15803d',
}

// Icons, link previews and the manifest can't follow the user's choice: they use the default.
export const BRAND_COLOR = ACCENT_COLORS[DEFAULT_ACCENT]

export function toAccent(value: unknown): Accent {
  return ACCENTS.includes(value as Accent) ? value as Accent : DEFAULT_ACCENT
}
