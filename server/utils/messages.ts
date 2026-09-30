import { createError, getCookie, getQuery, getRequestHeader, readBody, type H3Event } from 'h3'
import type * as z from 'zod'
import en from '../../i18n/locales/en.json'
import fr from '../../i18n/locales/fr.json'

// The app's language files, for what the server writes itself: error messages, link preview images, GPX files,
// the account archive.
const MESSAGES = { fr, en }
export type MessageLocale = keyof typeof MESSAGES
export const DEFAULT_MESSAGE_LOCALE: MessageLocale = 'fr'
// The number and date formats of each language, as in nuxt.config.ts.
export const FORMAT_LOCALES: Record<MessageLocale, string> = { fr: 'fr-FR', en: 'en-GB' }
// Where @nuxtjs/i18n keeps the visitor's language (nuxt.config.ts).
const LOCALE_COOKIE = 'sport-map-locale'

type Messages = { [key: string]: string | Messages }

export const isMessageLocale = (value: unknown): value is MessageLocale =>
  typeof value === 'string' && value in MESSAGES

function lookup(locale: MessageLocale, key: string): string | undefined {
  const found = key.split('.').reduce<string | Messages | undefined>(
    (node, part) => (typeof node === 'object' ? node[part] : undefined),
    MESSAGES[locale] as Messages,
  )
  return typeof found === 'string' ? found : undefined
}

// Looks a key up ("sports.hiking") and fills its {placeholders}. Enough for the simple messages the server
// uses: no plural forms, no vue-i18n special characters.
export function translate(locale: MessageLocale, key: string, params: Record<string, string | number> = {}): string {
  const found = lookup(locale, key)
  if (found === undefined) return key
  return found.replace(/\{(\w+)\}/g, (placeholder, name: string) => String(params[name] ?? placeholder))
}

// The language of a request: the one the visitor picked (cookie), else the first one their browser accepts
// that the app has, as the i18n module does for pages. Requests made by the app's pages carry the cookie.
export function getRequestLocale(event: H3Event): MessageLocale {
  const picked = getCookie(event, LOCALE_COOKIE)
  if (isMessageLocale(picked)) return picked
  const accepted = (getRequestHeader(event, 'accept-language') ?? '')
    .split(',')
    .map(tag => tag.trim().slice(0, 2).toLowerCase())
  return accepted.find(isMessageLocale) ?? DEFAULT_MESSAGE_LOCALE
}

// An API error whose statusMessage is in the request's language: pages show it as is.
export function apiError(event: H3Event, statusCode: number, key: string, params?: Record<string, string | number>, data?: unknown) {
  return createError({ statusCode, statusMessage: translate(getRequestLocale(event), key, params), data })
}

// Like h3's readValidatedBody / getValidatedQuery, which answer "Validation Error": the first issue is reported
// in the request's language instead. The shared schemas give translation keys as messages (limits in {min} /
// {max}); zod's own messages, from inline schemas, become a generic one.
function parseOrThrow<T extends z.ZodType>(event: H3Event, schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data)
  if (result.success) return result.data
  const issue = result.error.issues[0] as z.core.$ZodIssue & { minimum?: number | bigint, maximum?: number | bigint }
  const key = lookup(DEFAULT_MESSAGE_LOCALE, issue.message) === undefined ? 'api.invalidRequest' : issue.message
  throw apiError(event, 400, key, { min: Number(issue.minimum), max: Number(issue.maximum) }, { issues: result.error.issues })
}

export async function readLocalizedBody<T extends z.ZodType>(event: H3Event, schema: T): Promise<z.output<T>> {
  return parseOrThrow(event, schema, await readBody(event))
}

export function getLocalizedQuery<T extends z.ZodType>(event: H3Event, schema: T): z.output<T> {
  return parseOrThrow(event, schema, getQuery(event))
}
