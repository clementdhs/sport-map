import colors from 'tailwindcss/colors'
import { describe, expect, it } from 'vitest'
import { SPORT_TYPES } from '#shared/utils/routes'
import { contrast, type Mode, neutral, read, theme, veilContrast } from './contrast'

// Contrast of the topo theme (#227), WCAG 2 AA: 4.5:1 for text, 3:1 for icons and other graphics. `dimmed` is
// Nuxt UI's tone for placeholders and leading icons: 3:1, 4.5:1 with outdoor readability, which has no pale grey.
const modes: Mode[] = ['light', 'dark', 'outdoor light', 'outdoor dark']
const backgrounds = ['--ui-bg-paper', '--ui-bg', '--ui-bg-muted', '--ui-bg-elevated']
const texts = ['--ui-text-muted', '--ui-text-toned', '--ui-text', '--ui-text-highlighted']

describe('theme contrast', () => {
  it('defines the whole neutral palette', () => {
    expect(Object.keys(neutral).map(Number)).toEqual([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950])
  })

  it.each(modes)('passes AA for text on every background: %s', (mode) => {
    const color = theme(mode)
    const outdoor = mode.startsWith('outdoor')
    for (const background of backgrounds) {
      for (const text of texts) {
        expect(contrast(color(text), color(background)), `${text} on ${background}`).toBeGreaterThanOrEqual(4.5)
      }
      expect(contrast(color('--ui-text-dimmed'), color(background)), `dimmed on ${background}`).toBeGreaterThanOrEqual(outdoor ? 4.5 : 3)
    }
    expect(contrast(color('--ui-text-inverted'), color('--ui-bg-inverted')), 'inverted').toBeGreaterThanOrEqual(4.5)
  })

  it.each(['light', 'dark'] as const)('makes outdoor readability stronger, never weaker: %s', (mode) => {
    const [color, outdoor] = [theme(mode), theme(`outdoor ${mode}`)]
    for (const background of backgrounds) {
      for (const text of ['--ui-text-dimmed', ...texts]) {
        expect(contrast(outdoor(text), outdoor(background)), `${text} on ${background}`)
          .toBeGreaterThanOrEqual(contrast(color(text), color(background)))
      }
    }
    // Field and card outlines become visible graphics (3:1) with the option.
    expect(contrast(outdoor('--ui-border-accented'), outdoor('--ui-bg')), 'accented border').toBeGreaterThanOrEqual(3)
  })
})

// Sport colors (#108): Tailwind palettes set by the `sport-<sport type>` classes. Icons and thumbnails (--sport,
// 700 in light mode, 400 in dark mode) on the page and the surfaces; badge text (--sport-text) on its own
// background (--sport-soft: 100 in light mode, a 15 % veil of 400 in dark mode).
describe('sport colors contrast', () => {
  const css = read('../../app/assets/css/main.css')
  const palette = (sport: string) => {
    const name = css.match(new RegExp(`\\.sport-${sport} \\{ --sport-100: var\\(--color-(\\w+)-100\\)`))![1]!
    return (colors as unknown as Record<string, Record<number, string>>)[name]!
  }

  it.each(SPORT_TYPES)('passes in light and dark mode: %s', (sport) => {
    const shades = palette(sport)
    for (const mode of ['light', 'dark', 'outdoor light', 'outdoor dark'] as const) {
      const color = theme(mode)
      const dark = mode.endsWith('dark')
      for (const background of backgrounds) {
        const surface = color(background)
        expect(contrast(shades[dark ? 400 : 700]!, surface), `${mode} icon on ${background}`).toBeGreaterThanOrEqual(3)
        const badge = dark ? veilContrast(shades[300]!, shades[400]!, 0.15, surface) : contrast(shades[800]!, shades[100]!)
        expect(badge, `${mode} badge on ${background}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})
