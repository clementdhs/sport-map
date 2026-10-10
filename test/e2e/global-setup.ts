import { rmSync } from 'node:fs'
import type { FullConfig } from '@playwright/test'
import { insertRows, supabaseAdmin } from './admin'
import { startFakeWeather } from './fake-weather'
import { ACCOUNT_ROUTE_NAME, AUTH_DIR, E2E_NEIGHBORS, RESET_USER, SEED_OWNER, SEEDED_LOOP_NAME, SEEDED_REVIEW, SEEDED_ROUTE_NAME, TEST_EMAIL_DOMAIN, type TestUser, workerUsers } from './fixtures'

async function createUser({ email, username, password, displayName }: TestUser) {
  const user = await supabaseAdmin<{ id: string }>('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { username } }),
  })
  if (displayName) {
    await supabaseAdmin(`/rest/v1/profiles?id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify({ display_name: displayName }) })
  }
  return user
}

// Recreates the test users (deleting them cascades to their profile, routes, activity and reviews): the owner of
// the seeded routes, a test account and a family member for each worker, and the neighbors who review and report.
// Then two public routes of the seed owner, a route of each test account, and a review of each by a neighbor.
export default async function globalSetup(config: FullConfig) {
  // Sessions of the deleted users.
  rmSync(AUTH_DIR, { recursive: true, force: true })
  // Photo files are not deleted by the cascade: start from an empty bucket. Same for the local mailbox.
  await supabaseAdmin('/storage/v1/bucket/route-photos/empty', { method: 'POST' })
  await fetch(`${process.env.E2E_MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' })
  // Gains of marked routes are shared, not tied to a user: computed again from the fake elevations.
  await supabaseAdmin('/rest/v1/osm_route_elevations?relation_id=gt.0', { method: 'DELETE' })
  // Every test signs in from the same IP: a run started again right away must not hit the sign-in limit.
  await supabaseAdmin('/rest/v1/login_attempts?count=gt.0', { method: 'DELETE' })

  // Every test user, including the workers of a run with more of them and the throwaway accounts of a test that
  // failed halfway.
  const { users } = await supabaseAdmin<{ users: { id: string, email: string }[] }>('/auth/v1/admin/users?per_page=1000')
  for (const user of users.filter(u => u.email.endsWith(TEST_EMAIL_DOMAIN))) {
    await supabaseAdmin(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE' })
  }

  const owner = await createUser(SEED_OWNER)
  await createUser(RESET_USER)
  // Other users, to review and report. They never sign in.
  const neighbors = await Promise.all(E2E_NEIGHBORS.map(n => createUser({ ...n, password: crypto.randomUUID() })))
  const accounts = await Promise.all(Array.from({ length: config.workers }, async (_, index) => {
    const { account, family } = workerUsers(index)
    const [created] = await Promise.all([createUser(account), createUser(family)])
    return created
  }))

  // A ~6.5 km point-to-point route, and a longer loop with more climbing (both running, both near Annecy). The
  // first was snapped to paths: a street, then a T2 dirt path; the loop has no way info, like a GPX import.
  const [route, loop] = await insertRows<{ id: string }>('routes', [
    {
      owner_id: owner.id,
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
      owner_id: owner.id,
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
  // Far from France, like every route visible to the family that isn't the seed owner's (FAR_AWAY).
  const accountRoutes = await insertRows<{ id: string }>('routes', accounts.map(account => ({
    owner_id: account.id,
    name: ACCOUNT_ROUTE_NAME,
    sport_type: 'hiking',
    is_public: true,
    geom: 'SRID=4326;LINESTRING(168.66 -45.03,168.7 -45.01)',
  })))
  await insertRows('route_reviews', [route!, ...accountRoutes].map(reviewed => ({ route_id: reviewed.id, user_id: neighbors[0]!.id, ...SEEDED_REVIEW })))

  process.env.E2E_ROUTE_ID = route!.id
  process.env.E2E_LOOP_ID = loop!.id
  process.env.E2E_ACCOUNT_ROUTE_IDS = accountRoutes.map(r => r.id).join(',')
  process.env.E2E_NEIGHBOR_IDS = neighbors.map(n => n.id).join(',')

  // Returned: Playwright calls it once the tests are done.
  return startFakeWeather()
}
