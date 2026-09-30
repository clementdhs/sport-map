import { createApp, defineEventHandler, toWebHandler } from 'h3'
import { describe, expect, it } from 'vitest'
import * as z from 'zod'
import { apiError, getLocalizedQuery, getRequestLocale, readLocalizedBody } from '../../server/utils/messages'

const app = createApp()
app.use('/locale', defineEventHandler(event => getRequestLocale(event)))
app.use('/missing', defineEventHandler((event) => {
  throw apiError(event, 404, 'api.routeNotFound')
}))
app.use('/quota', defineEventHandler((event) => {
  throw apiError(event, 429, 'api.routingQuota', { limit: 300 }, { reason: 'quota' })
}))
app.use('/body', defineEventHandler(event => readLocalizedBody(event, z.object({ name: z.string().max(3, 'validation.maxChars') }))))
app.use('/query', defineEventHandler(event => getLocalizedQuery(event, z.object({ page: z.coerce.number().int() }))))
const handle = toWebHandler(app)

const request = (path: string, headers: Record<string, string> = {}, body?: unknown) => handle(new Request(`http://test${path}`, {
  method: body ? 'POST' : 'GET',
  headers: body ? { ...headers, 'content-type': 'application/json' } : headers,
  body: body ? JSON.stringify(body) : undefined,
}))

describe('getRequestLocale', () => {
  it('takes the language picked in the app first', async () => {
    const res = await request('/locale', { 'cookie': 'sport-map-locale=en', 'accept-language': 'fr-FR' })
    expect(await res.text()).toBe('en')
  })

  it('else the first language of the browser the app has', async () => {
    expect(await (await request('/locale', { 'accept-language': 'de-DE,en-GB;q=0.8,fr;q=0.5' })).text()).toBe('en')
    expect(await (await request('/locale', { 'cookie': 'sport-map-locale=xx', 'accept-language': 'fr-CA' })).text()).toBe('fr')
  })

  it('else French', async () => {
    expect(await (await request('/locale', { 'accept-language': 'de' })).text()).toBe('fr')
    expect(await (await request('/locale')).text()).toBe('fr')
  })
})

describe('apiError', () => {
  it('writes the message in the request language', async () => {
    const res = await request('/missing', { 'accept-language': 'en' })
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ statusMessage: 'Route not found' })
    expect(await (await request('/missing')).json()).toMatchObject({ statusMessage: 'Parcours introuvable' })
  })

  it('fills placeholders and keeps data', async () => {
    const res = await request('/quota', { cookie: 'sport-map-locale=en' })
    expect(await res.json()).toMatchObject({ statusMessage: 'Limit of 300 route calculations per day reached', data: { reason: 'quota' } })
  })
})

describe('readLocalizedBody / getLocalizedQuery', () => {
  it('return the parsed data', async () => {
    expect(await (await request('/body', {}, { name: 'abc' })).json()).toEqual({ name: 'abc' })
    expect(await (await request('/query?page=2')).json()).toEqual({ page: 2 })
  })

  it('report a shared schema message translated, with its limit', async () => {
    const res = await request('/body', { cookie: 'sport-map-locale=en' }, { name: 'abcd' })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ statusMessage: '3 characters maximum' })
    expect(await (await request('/body', {}, { name: 'abcd' })).json()).toMatchObject({ statusMessage: '3 caractères maximum' })
  })

  it('replace zod\'s own messages with a generic one', async () => {
    const res = await request('/query?page=abc', { cookie: 'sport-map-locale=en' })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ statusMessage: 'Invalid request' })
  })
})
