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
        // The sport's name written straight on the surface (route cards, #232)
        expect(contrast(shades[dark ? 300 : 800]!, surface), `${mode} label on ${background}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})

// Trail signage (#229). The yellow sign carries text (durations, the highlighted key figure): 4.5:1. Its shape
// stands out from every background by its ink outline (light mode) or its own yellow (dark mode): 3:1. The
// stamp's text on its own background (4.5:1), and the ink edges of the sport mark, the cartouche and the "you are here" plate (3:1).
describe('signage contrast', () => {
  it.each(modes)('passes in %s mode', (mode) => {
    const color = theme(mode)
    expect(contrast(color('--sign-text'), color('--sign')), 'sign text').toBeGreaterThanOrEqual(4.5)
    for (const background of backgrounds) {
      const surface = color(background)
      const sign = Math.max(contrast(color('--sign-edge'), surface), contrast(color('--sign'), surface))
      expect(sign, `sign on ${background}`).toBeGreaterThanOrEqual(3)
      expect(contrast(color('--mark-edge'), surface), `mark edge on ${background}`).toBeGreaterThanOrEqual(3)
    }
    // The stamp paints its own background, the paper or the surface it lies on.
    for (const background of ['--ui-bg-paper', '--ui-bg']) {
      expect(contrast(color('--stamp'), color(background)), `stamp on ${background}`).toBeGreaterThanOrEqual(4.5)
    }
    // The mark's top bar shows by its ring in light mode (white ringed with ink), by itself in dark mode (cream).
    if (mode.endsWith('dark')) {
      for (const background of backgrounds) {
        expect(contrast(color('--mark-top'), color(background)), `mark top on ${background}`).toBeGreaterThanOrEqual(3)
      }
    }
    else {
      expect(contrast(color('--mark-edge'), color('--mark-top')), 'mark ring').toBeGreaterThanOrEqual(3)
    }
  })
})

// The coach's form gauge (#263): its three zones stand out from the paper and the surface they lie on (3:1).
describe('form gauge contrast', () => {
  it.each(modes)('passes in %s mode', (mode) => {
    const color = theme(mode)
    for (const zone of ['--form-recovery', '--form-progress', '--form-overload']) {
      for (const background of ['--ui-bg-paper', '--ui-bg']) {
        expect(contrast(color(zone), color(background)), `${zone} on ${background}`).toBeGreaterThanOrEqual(3)
      }
    }
  })
})
