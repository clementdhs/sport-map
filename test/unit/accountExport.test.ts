import { describe, expect, it } from 'vitest'
import { accountArchive, type AccountData } from '../../server/utils/accountExport'

const route = (id: string, name: string): AccountData['routes'][number] => ({
  id,
  name,
  description: null,
  sport_type: 'hiking',
  is_public: false,
  source: 'drawn',
  distance_m: 1200,
  elevation_gain_m: 30,
  elevation_loss_m: 10,
  elevation_profile: [500, 530],
  pois: [],
  geometry: { type: 'LineString', coordinates: [[6.1, 45.9], [6.11, 45.91]] },
  created_at: '2026-09-01T08:00:00Z',
  updated_at: '2026-09-01T08:00:00Z',
})

const data: AccountData = {
  exportedAt: '2026-09-29T10:00:00Z',
  profile: { username: 'clem', display_name: 'Clem', bio: null, email: 'clem@example.test', created_at: '2026-01-01T00:00:00Z' },
  routes: [route('aaaaaaaa-1111-4000-8000-000000000001', 'Tour du lac'), route('bbbbbbbb-2222-4000-8000-000000000002', 'Tour du lac')],
  photos: [{ route_id: 'bbbbbbbb-2222-4000-8000-000000000002', storage_path: 'bbbbbbbb-2222-4000-8000-000000000002/p1.webp', created_at: '2026-09-02T08:00:00Z' }],
  reviews: [{ route_id: 'x', rating: 4, comment: 'Belle vue' }],
  activity: [],
  collections: [],
  reports: [],
  routingUsage: [{ day: '2026-09-29', count: 12 }],
}

describe('accountArchive', () => {
  const archive = accountArchive(data)
  const file = (path: string) => archive.files.find(entry => entry.path === path)?.content

  it('holds a readme and one JSON file per kind of data', () => {
    expect(archive.files.slice(0, 8).map(entry => entry.path)).toEqual([
      'LISEZMOI.txt', 'profil.json', 'parcours.json', 'avis.json', 'activite.json', 'collections.json', 'signalements.json', 'calculs.json',
    ])
    expect(JSON.parse(file('calculs.json')!)).toEqual(data.routingUsage)
    expect(file('LISEZMOI.txt')).toContain('Données de clem')
    expect(JSON.parse(file('profil.json')!)).toMatchObject({ email: 'clem@example.test' })
    expect(JSON.parse(file('avis.json')!)).toEqual(data.reviews)
  })

  it('names its files and writes its readme in the given language', () => {
    const english = accountArchive(data, 'en')
    expect(english.files.map(entry => entry.path)).toEqual([
      'README.txt', 'profile.json', 'routes.json', 'reviews.json', 'activity.json', 'collections.json', 'reports.json', 'routing.json',
      'routes/tour-du-lac-aaaaaaaa.gpx', 'routes/tour-du-lac-bbbbbbbb.gpx',
    ])
    const readme = english.files[0]!.content
    expect(readme).toContain('Data of clem on sport-map')
    expect(readme).toMatch(/^routes\/\*\.gpx +the track of each route/m)
    expect(english.photos[0]!.path).toBe('photos/tour-du-lac-bbbbbbbb/p1.webp')
  })

  it('gives each route its own GPX file, even with the same name', () => {
    const gpx = archive.files.filter(entry => entry.path.endsWith('.gpx'))
    expect(gpx.map(entry => entry.path)).toEqual(['parcours/tour-du-lac-aaaaaaaa.gpx', 'parcours/tour-du-lac-bbbbbbbb.gpx'])
    expect(gpx[0]!.content).toContain('<ele>530</ele>')
  })

  it('lists routes without their raw geometry, pointing to their files', () => {
    const routes = JSON.parse(file('parcours.json')!)
    expect(routes[1]).toMatchObject({ name: 'Tour du lac', gpx: 'parcours/tour-du-lac-bbbbbbbb.gpx', photos: ['photos/tour-du-lac-bbbbbbbb/p1.webp'] })
    expect(routes[1]).not.toHaveProperty('geometry')
    expect(routes[1]).not.toHaveProperty('elevation_profile')
  })

  it('puts each photo in the folder of its route', () => {
    expect(archive.photos).toEqual([
      { path: 'photos/tour-du-lac-bbbbbbbb/p1.webp', storage_path: 'bbbbbbbb-2222-4000-8000-000000000002/p1.webp' },
    ])
  })
})
