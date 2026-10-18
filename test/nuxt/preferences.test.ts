import { readBody } from 'h3'
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Fake account (#145): the saved preferences, merged key by key like update_my_preferences, and every change
// received. `offline` makes both routes fail, as without network.
let account: Record<string, unknown> = {}
const received: Record<string, unknown>[] = []
let offline = false
registerEndpoint('/api/profile/me/preferences', {
  method: 'GET',
  handler: () => {
    if (offline) throw createError({ statusCode: 503 })
    return account
  },
})
registerEndpoint('/api/profile/me/preferences', {
  method: 'PATCH',
  handler: async (event) => {
    if (offline) throw createError({ statusCode: 503 })
    const changes = await readBody<Record<string, unknown>>(event)
    received.push(changes)
    account = { ...account, ...changes }
    return null
  },
})

const ME = 'member-1'
const sync = () => JSON.parse(localStorage.getItem('sport-map:preferences-sync') ?? 'null')

describe('preferences store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    account = {}
    received.length = 0
    offline = false
  })

  it('applies the device\'s values at once, then the account\'s', async () => {
    localStorage.setItem('sport-map:basemap', 'ignPlan')
    localStorage.setItem('sport-map:map-3d', '1')
    localStorage.setItem('sport-map:preferences-sync', JSON.stringify({ owner: ME, pending: [] }))
    account = { basemap: 'maptiler', voice: { enabled: true, announcements: ['track'] } }

    const preferences = usePreferencesStore()
    expect(preferences.values.basemap).toBe('ignPlan')
    expect(preferences.values.searchScope).toBe('mine')

    preferences.setMember(ME)
    await preferences.save()
    expect(preferences.values).toMatchObject({ basemap: 'maptiler', map3d: true, voice: { enabled: true, announcements: ['track'] } })
    // The device keeps the account's values for next time, and its own for keys the account doesn't have.
    expect(localStorage.getItem('sport-map:basemap')).toBe('maptiler')
    expect(JSON.parse(localStorage.getItem('sport-map:voice')!)).toEqual({ enabled: true, announcements: ['track'] })
    expect(received).toEqual([{ map3d: true }])
  })

  it('fills an empty account with the values kept on the device before #145', async () => {
    localStorage.setItem('sport-map:search-scope', 'all')
    localStorage.setItem('sport-map:live-data', JSON.stringify({ pace: true }))

    const preferences = usePreferencesStore()
    preferences.setMember(ME)
    await preferences.save()
    expect(received).toEqual([{ searchScope: 'all', liveData: { pace: true } }])
    expect(sync()).toEqual({ owner: ME, pending: [] })
  })

  it('saves a change in the account, alone', async () => {
    account = { basemap: 'ignPlan', voice: { enabled: true, announcements: [] } }
    const preferences = usePreferencesStore()
    preferences.setMember(ME)
    await preferences.save()

    preferences.set('mapOrientation', 'heading')
    expect(preferences.values.mapOrientation).toBe('heading')
    expect(localStorage.getItem('sport-map:map-orientation')).toBe('heading')
    await vi.waitFor(() => expect(received).toEqual([{ mapOrientation: 'heading' }]), { timeout: 2000 })
    await vi.waitFor(() => expect(sync()).toEqual({ owner: ME, pending: [] }))
    expect(account).toMatchObject({ basemap: 'ignPlan', mapOrientation: 'heading' })
  })

  it('keeps a change made offline and sends it back online', async () => {
    const preferences = usePreferencesStore()
    preferences.setMember(ME)
    await preferences.save()

    offline = true
    preferences.set('map3d', true)
    await preferences.save()
    expect(received).toEqual([])
    expect(sync()).toEqual({ owner: ME, pending: ['map3d'] })

    // A new visit, still offline: the device's value applies.
    setActivePinia(createPinia())
    const later = usePreferencesStore()
    expect(later.values.map3d).toBe(true)
    later.setMember(ME)
    await later.save()

    // Back online: the change wins over the account, which another device changed meanwhile.
    account = { map3d: false, basemap: 'ignPlan' }
    offline = false
    await later.save()
    expect(received).toEqual([{ map3d: true }])
    expect(later.values).toMatchObject({ map3d: true, basemap: 'ignPlan' })
    expect(sync()).toEqual({ owner: ME, pending: [] })
  })

  it('drops the values of another member who used the device', async () => {
    localStorage.setItem('sport-map:basemap', 'ignPlan')
    localStorage.setItem('sport-map:preferences-sync', JSON.stringify({ owner: 'member-2', pending: ['basemap'] }))
    account = { searchScope: 'all' }

    const preferences = usePreferencesStore()
    preferences.setMember(ME)
    await preferences.save()
    expect(preferences.values).toMatchObject({ basemap: 'maptiler', searchScope: 'all' })
    expect(localStorage.getItem('sport-map:basemap')).toBeNull()
    expect(received).toEqual([])
    expect(sync()).toEqual({ owner: ME, pending: [] })
  })

  it('keeps a change the new member made before their account arrived', async () => {
    localStorage.setItem('sport-map:basemap', 'ignPlan')
    localStorage.setItem('sport-map:preferences-sync', JSON.stringify({ owner: 'member-2', pending: [] }))

    const preferences = usePreferencesStore()
    preferences.setMember(ME)
    preferences.set('map3d', true)
    await preferences.save()
    expect(preferences.values).toMatchObject({ basemap: 'maptiler', map3d: true })
    expect(received).toEqual([{ map3d: true }])
  })

  it('stops sending a change the server refuses, and keeps it on the device', async () => {
    registerEndpoint('/api/profile/me/preferences', {
      method: 'PATCH',
      once: true,
      handler: () => {
        throw createError({ statusCode: 400 })
      },
    })
    const preferences = usePreferencesStore()
    preferences.setMember(ME)
    await preferences.save()
    preferences.set('basemap', 'ignPlan')
    await preferences.save()
    expect(received).toEqual([])
    expect(sync()).toEqual({ owner: ME, pending: [] })
    expect(localStorage.getItem('sport-map:basemap')).toBe('ignPlan')
  })
})
