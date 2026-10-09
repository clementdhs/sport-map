import { insertRows, supabaseAdmin } from './admin'
import { startFakeWeather } from './fake-weather'
import { E2E_NEIGHBORS, E2E_USER, FAMILY_USER, RESET_USER, SEEDED_LOOP_NAME, SEEDED_REVIEW, SEEDED_ROUTE_NAME } from './fixtures'

async function createUser(email: string, username: string, password: string) {
  return supabaseAdmin<{ id: string }>('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { username } }),
  })
}

// Recreates the test users (deleting them cascades to their profile, routes, activity and reviews), the main
// one with a display name, two public routes of the main test user, and a review of the first one by a neighbor.
export default async function globalSetup() {
  // Photo files are not deleted by the cascade: start from an empty bucket. Same for the local mailbox.
  await supabaseAdmin('/storage/v1/bucket/route-photos/empty', { method: 'POST' })
  await fetch(`${process.env.E2E_MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' })
  // Gains of marked routes are shared, not tied to a user: computed again from the fake elevations.
  await supabaseAdmin('/rest/v1/osm_route_elevations?relation_id=gt.0', { method: 'DELETE' })

  const { users } = await supabaseAdmin<{ users: { id: string, email: string }[] }>('/auth/v1/admin/users?per_page=1000')
  const emails = [E2E_USER.email, FAMILY_USER.email, RESET_USER.email, ...E2E_NEIGHBORS.map(n => n.email)]
  // Throwaway accounts are deleted by their test, unless it failed halfway.
  for (const user of users.filter(u => emails.includes(u.email) || u.email.startsWith('jetable-'))) {
    await supabaseAdmin(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE' })
  }

  const user = await createUser(E2E_USER.email, E2E_USER.username, E2E_USER.password)
  await supabaseAdmin(`/rest/v1/profiles?id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify({ display_name: E2E_USER.displayName }) })
  await createUser(FAMILY_USER.email, FAMILY_USER.username, FAMILY_USER.password)
  await createUser(RESET_USER.email, RESET_USER.username, RESET_USER.password)
  // Other users, to review and report. They never sign in.
  const neighbors = await Promise.all(E2E_NEIGHBORS.map(n => createUser(n.email, n.username, crypto.randomUUID())))

  // A ~6.5 km point-to-point route, and a longer loop with more climbing (both running, both near Annecy). The
  // first was snapped to paths: a street, then a T2 dirt path; the loop has no way info, like a GPX import.
  const [route, loop] = await insertRows<{ id: string }>('routes', [
    {
      owner_id: user.id,
      name: SEEDED_ROUTE_NAME,
      description: 'Parcours créé par les tests de bout en bout.',
      sport_type: 'running',
      is_public: true,
      geom: 'SRID=4326;LINESTRING(6.129 45.899,6.14 45.87,6.16 45.85)',
      elevation_profile: [450, 470, 520],
      elevation_gain_m: 70,
      elevation_loss_m: 0,
      way_info: { surface: [[0, 1, 3], [1, 2, 11]], waytype: [[0, 1, 3], [1, 2, 4]], sac_scale: [[0, 1, 0], [1, 2, 2]], mtb_scale: [] },
    },
    {
      owner_id: user.id,
      name: SEEDED_LOOP_NAME,
      description: 'Boucle créée par les tests de bout en bout.',
      sport_type: 'running',
      is_public: true,
      geom: 'SRID=4326;LINESTRING(6.2 45.9,6.28 45.95,6.35 45.9,6.28 45.85,6.2 45.9)',
      elevation_profile: [500, 900, 1100, 800, 500],
      elevation_gain_m: 650,
      elevation_loss_m: 650,
      // A bulk insert needs the same keys in every row.
      way_info: null,
    },
  ])
  await insertRows('route_reviews', [{ route_id: route!.id, user_id: neighbors[0]!.id, ...SEEDED_REVIEW }])

  process.env.E2E_ROUTE_ID = route!.id
  process.env.E2E_LOOP_ID = loop!.id
  process.env.E2E_NEIGHBOR_IDS = neighbors.map(n => n.id).join(',')

  // Returned: Playwright calls it once the tests are done.
  return startFakeWeather()
}
