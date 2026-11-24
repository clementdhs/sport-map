import { readFileSync } from 'node:fs'
import { insertRows, supabaseAdmin } from '../e2e/admin'
import { TEST_EMAIL_DOMAIN } from '../e2e/fixtures'
import { elevationStats } from '../../shared/utils/routes'

// Fictitious members only: the screenshots are public. On the e2e domain, so the e2e global setup deletes them
// (its search tests count every route in France).
export const DEMO_OWNER = { email: `demo-camille${TEST_EMAIL_DOMAIN}`, password: 'demo-local-password', username: 'camille', displayName: 'Camille' }
const DEMO_FRIENDS = [
  { email: `demo-leo${TEST_EMAIL_DOMAIN}`, username: 'leo', displayName: 'Léo' },
  { email: `demo-ines${TEST_EMAIL_DOMAIN}`, username: 'ines', displayName: 'Inès' },
]

interface DemoRoute {
  name: string
  description: string
  sport_type: string
  coordinates: [number, number][]
  elevations: number[]
  way_info: unknown
  editor_state: unknown
}

export const DEMO_ROUTES: DemoRoute[] = JSON.parse(readFileSync('test/screenshots/demo-routes.json', 'utf8'))

const REVIEWS = [
  { rating: 5, comment: 'Superbe tour, la piste cyclable est vraiment agréable.' },
  { rating: 4, comment: 'Raide au début mais la vue d\'en haut vaut le coup.' },
]

async function createUser({ email, username, displayName }: { email: string, username: string, displayName: string }, password: string) {
  const user = await supabaseAdmin<{ id: string }>('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { username } }),
  })
  await supabaseAdmin(`/rest/v1/profiles?id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify({ display_name: displayName }) })
  return user
}

const DAY = 24 * 3600 * 1000

// Recreates the demo members (deleting them cascades to their routes, outings and reviews), their routes around
// Annecy, reviews by friends and a few months of outings for the profile statistics.
export default async function seed() {
  await supabaseAdmin('/rest/v1/login_attempts?count=gt.0', { method: 'DELETE' })
  const { users } = await supabaseAdmin<{ users: { id: string, email: string }[] }>('/auth/v1/admin/users?per_page=1000')
  for (const user of users.filter(u => u.email.startsWith('demo-') && u.email.endsWith(TEST_EMAIL_DOMAIN))) {
    await supabaseAdmin(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE' })
  }

  const owner = await createUser(DEMO_OWNER, DEMO_OWNER.password)
  const friends = await Promise.all(DEMO_FRIENDS.map(friend => createUser(friend, crypto.randomUUID())))

  const routes = await insertRows<{ id: string, distance_m: number, sport_type: string }>('routes', DEMO_ROUTES.map(route => ({
    owner_id: owner.id,
    name: route.name,
    description: route.description,
    sport_type: route.sport_type,
    is_public: true,
    geom: `SRID=4326;LINESTRING(${route.coordinates.map(([lng, lat]) => `${lng} ${lat}`).join(',')})`,
    elevation_profile: route.elevations,
    // As the editor measures it, rather than OpenRouteService's own figure.
    elevation_gain_m: elevationStats(route.coordinates, route.elevations).gain,
    elevation_loss_m: elevationStats(route.coordinates, route.elevations).loss,
    way_info: route.way_info,
    editor_state: route.editor_state,
  })))
  // Maps open on Annecy, without the OSM places (water, parking…) that crowd a tour of the lake.
  await insertRows('user_preferences', [{ user_id: owner.id, preferences: { startArea: { bounds: [6.04, 45.76, 6.27, 45.93], name: 'Annecy' }, osmPlaces: false } }])
  await insertRows('route_reviews', REVIEWS.map((review, i) => ({ route_id: routes[i]!.id, user_id: friends[i]!.id, ...review })))

  // About two outings a week over the last four months, at irregular intervals and on the routes in no fixed
  // order (a regular rhythm made the weekly chart alternate), at a plausible speed for each sport.
  const speedKmh: Record<string, number> = { cycling: 20, hiking: 3.5, running: 10.5, trail: 7 }
  const GAPS = [2, 3, 5, 2, 4, 1, 3, 6, 2, 3, 4]
  const now = Date.now()
  // The first outing was yesterday, so the current week has one.
  let daysAgo = -1
  const outings = Array.from({ length: 36 }, (_, i) => {
    const route = routes[(i * 7 + Math.floor(i / 3)) % routes.length]!
    const moving_s = Math.round(route.distance_m / 1000 / (speedKmh[route.sport_type]! * (0.92 + (i % 5) * 0.04)) * 3600)
    daysAgo += GAPS[i % GAPS.length]!
    return {
      route_id: route.id,
      user_id: owner.id,
      started_at: new Date(now - daysAgo * DAY).toISOString(),
      distance_m: Math.round(route.distance_m),
      moving_s,
      duration_s: Math.round(moving_s * 1.08),
    }
  })
  await insertRows('route_outings', outings)

  process.env.DEMO_ROUTE_IDS = routes.map(route => route.id).join(',')
}
