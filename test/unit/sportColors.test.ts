import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SPORT_TYPES } from '#shared/utils/routes'

// Sport colors are plain CSS classes (`sport-<sport type>`) built from the sport type at runtime: a sport added
// without its class would silently show no color.
const css = readFileSync(fileURLToPath(new URL('../../app/assets/css/main.css', import.meta.url)), 'utf8')

describe('sport colors', () => {
  it('has a class setting every shade for each sport', () => {
    for (const sport of SPORT_TYPES) {
      const rule = css.match(new RegExp(`^\\.sport-${sport} \\{([^}]*)\\}`, 'm'))?.[1]
      expect(rule, sport).toBeDefined()
      for (const shade of [100, 300, 400, 700, 800]) expect(rule, sport).toContain(`--sport-${shade}:`)
    }
  })

  it('maps every sport class to light and dark colors', () => {
    const list = SPORT_TYPES.map(sport => `.sport-${sport}`).join(', ')
    expect(css).toContain(`\n:is(${list}) {`)
    expect(css).toContain(`\n.dark :is(${list}) {`)
  })

  it('gives each sport its own palette', () => {
    const palettes = SPORT_TYPES.map(sport => css.match(new RegExp(`\\.sport-${sport} \\{ --sport-100: var\\(--color-(\\w+)-100\\)`))?.[1])
    expect(new Set(palettes).size).toBe(SPORT_TYPES.length)
  })
})
