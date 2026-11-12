import { createApp, defineEventHandler, toWebHandler } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireUser } from '../../server/utils/requireUser'

const serverSupabaseUser = vi.hoisted(() => vi.fn())
vi.mock('#supabase/server', () => ({ serverSupabaseUser }))

const app = createApp()
app.use('/me', defineEventHandler(async event => (await requireUser(event)).sub))
const handle = toWebHandler(app)
const request = (headers: Record<string, string> = {}) => handle(new Request('http://test/me', { headers }))

describe('requireUser', () => {
  beforeEach(() => serverSupabaseUser.mockReset())

  it('returns the claims of the signed-in user', async () => {
    serverSupabaseUser.mockResolvedValue({ sub: 'user-1', aal: 'aal1' })
    const res = await request()
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('user-1')
  })

  it('answers 401 with the sign-in message in the request language when nobody is signed in', async () => {
    serverSupabaseUser.mockResolvedValue(null)
    const fr = await request({ cookie: 'sport-map-locale=fr' })
    expect(fr.status).toBe(401)
    expect(await fr.json()).toMatchObject({ statusMessage: 'Connexion requise' })
    const en = await request({ cookie: 'sport-map-locale=en' })
    expect(en.status).toBe(401)
    expect(await en.json()).toMatchObject({ statusMessage: 'Sign-in required' })
  })
})
