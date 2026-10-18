import { describe, expect, it } from 'vitest'
import { routeSearchSchema } from '#shared/utils/routes'
import { parseSearchScope } from '~/utils/searchScope'

describe('parseSearchScope', () => {
  it('keeps "all" once picked', () => {
    expect(parseSearchScope('all')).toBe('all')
  })

  it('falls back to the member\'s own routes', () => {
    expect(parseSearchScope('mine')).toBe('mine')
    expect(parseSearchScope(null)).toBe('mine')
    expect(parseSearchScope('public')).toBe('mine')
  })
})

describe('routeSearchSchema scope', () => {
  const bounds = { minLng: 5, minLat: 45, maxLng: 7, maxLat: 47 }

  it('searches every route the member can see unless asked for their own', () => {
    expect(routeSearchSchema.parse(bounds).scope).toBe('all')
    expect(routeSearchSchema.parse({ ...bounds, scope: 'mine' }).scope).toBe('mine')
    expect(routeSearchSchema.safeParse({ ...bounds, scope: 'others' }).success).toBe(false)
  })
})
