import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Every language file must have exactly the keys of the French one (the reference), with non-empty messages.
const dir = fileURLToPath(new URL('../../i18n/locales/', import.meta.url))

type Messages = { [key: string]: string | Messages }

function flatten(messages: Messages, prefix = ''): Record<string, string> {
  return Object.fromEntries(Object.entries(messages).flatMap(([key, value]) => typeof value === 'string'
    ? [[`${prefix}${key}`, value]]
    : Object.entries(flatten(value, `${prefix}${key}.`))))
}

function load(file: string) {
  return flatten(JSON.parse(readFileSync(`${dir}${file}`, 'utf-8')))
}

const reference = load('fr.json')
const others = readdirSync(dir).filter(file => file.endsWith('.json') && file !== 'fr.json')

describe('language files', () => {
  it('include at least English', () => {
    expect(others).toContain('en.json')
  })

  it.each(others)('%s has the same keys as fr.json', (file) => {
    expect(Object.keys(load(file)).sort()).toEqual(Object.keys(reference).sort())
  })

  it.each(['fr.json', ...others])('%s has no empty message', (file) => {
    expect(Object.entries(load(file)).filter(([, value]) => !value.trim()).map(([key]) => key)).toEqual([])
  })
})
