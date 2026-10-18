import { getQuery } from 'h3'
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Fake server: remembers the scope of each search.
const scopes: unknown[] = []
registerEndpoint('/api/routes', {
  method: 'GET',
  handler: (event) => {
    scopes.push(getQuery(event).scope)
    return []
  },
})

const view = { bounds: [5, 45, 7, 47] as [number, number, number, number], center: [6, 46] as [number, number], zoom: 10 }

describe('routeSearch scope', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    scopes.length = 0
  })

  it('searches the member\'s own routes by default', async () => {
    const search = useRouteSearchStore()
    search.restoreScope()
    search.setView(view)
    await vi.waitFor(() => expect(scopes).toEqual(['mine']))
  })

  it('keeps "Tous" on the device', async () => {
    const search = useRouteSearchStore()
    search.restoreScope()
    search.setScope('all')
    expect(localStorage.getItem('sport-map:search-scope')).toBe('all')
    search.setView(view)
    await vi.waitFor(() => expect(scopes).toEqual(['all']))

    setActivePinia(createPinia())
    const later = useRouteSearchStore()
    expect(later.scope).toBe('mine')
    later.restoreScope()
    expect(later.scope).toBe('all')
  })
})
