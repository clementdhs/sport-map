// Accent colors the user can pick, on top of the light / dark mode (#228): five "terrain" tones, each a palette
// defined in main.css (`--color-<accent>-*`) that Nuxt UI uses as its "primary" color. No orange nor rust (the map
// tracks), no red (errors, end marker). Every palette has its light-mode accent at 600 and its dark-mode accent at
// 400, both checked against the topo backgrounds by test/unit/accentContrast.test.ts.
export const ACCENTS = ['forest', 'ochre', 'lake', 'heather', 'slate'] as const
export type Accent = typeof ACCENTS[number]

// Forest green, the color of the "Topo + balisage" mockups (#226).
export const DEFAULT_ACCENT: Accent = 'forest'

export interface AccentShades {
  light: string
  dark: string
}

// The 600 (light mode) and 400 (dark mode) shades of each palette in main.css, for what CSS variables can't reach
// (theme-color meta, swatches). Text on them is white in light mode and the ink in dark mode (--ui-text-inverted).
export const ACCENT_COLORS: Record<Accent, AccentShades> = {
  forest: { light: '#2d6a4f', dark: '#6bbf95' },
  ochre: { light: '#8a5a14', dark: '#d6a452' },
  lake: { light: '#2a6888', dark: '#7fb6d6' },
  heather: { light: '#8b3f7a', dark: '#d39ac4' },
  slate: { light: '#4b5866', dark: '#a2aebb' },
}

// The ten Tailwind accents offered before #228, still found in visitors' cookies, mapped to the nearest terrain
// accent (OKLab distance between their light shades, test/unit/theme.test.ts).
export const LEGACY_ACCENTS: Record<string, Accent> = {
  indigo: 'lake',
  violet: 'heather',
  fuchsia: 'heather',
  pink: 'heather',
  yellow: 'ochre',
  lime: 'forest',
  green: 'forest',
  teal: 'forest',
  sky: 'lake',
}

// Icons, link previews and the manifest can't follow the user's choice: they use the color drawn in
// public/icon.svg (Tailwind 3's indigo 600, the default accent before #228).
export const BRAND_COLOR = '#4f46e5'

export function toAccent(value: unknown): Accent {
  if (ACCENTS.includes(value as Accent)) return value as Accent
  if (typeof value === 'string' && Object.hasOwn(LEGACY_ACCENTS, value)) return LEGACY_ACCENTS[value]!
  return DEFAULT_ACCENT
}
