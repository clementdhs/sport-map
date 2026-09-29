import { describe, expect, it } from 'vitest'
import { collectionCreateSchema, collectionSchema } from '#shared/utils/collections'

describe('collectionSchema', () => {
  it('trims the name and the description', () => {
    expect(collectionSchema.parse({ name: '  Week-end à Annecy ', description: ' Deux jours ', is_public: true }))
      .toEqual({ name: 'Week-end à Annecy', description: 'Deux jours', is_public: true })
  })

  it('requires a name of at most 80 characters', () => {
    expect(collectionSchema.safeParse({ name: '   ', is_public: false }).success).toBe(false)
    expect(collectionSchema.safeParse({ name: 'a'.repeat(81), is_public: false }).success).toBe(false)
    expect(collectionSchema.safeParse({ name: 'a'.repeat(80), is_public: false }).success).toBe(true)
  })

  it('limits the description to 500 characters', () => {
    expect(collectionSchema.safeParse({ name: 'Boucles', description: 'a'.repeat(501), is_public: false }).success).toBe(false)
  })
})

describe('collectionCreateSchema', () => {
  it('only accepts a uuid as the route to add', () => {
    const base = { name: 'Boucles du midi', is_public: false }
    expect(collectionCreateSchema.safeParse({ ...base, route_id: '8a3f7c52-1b0e-4d6a-9f1e-2c7b5d9e0a11' }).success).toBe(true)
    expect(collectionCreateSchema.safeParse({ ...base, route_id: 'not-a-route' }).success).toBe(false)
    expect(collectionCreateSchema.safeParse(base).success).toBe(true)
  })
})
