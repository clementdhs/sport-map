import { E2E_USER, SEEDED_LOOP_NAME, SEEDED_ROUTE_NAME } from './fixtures'

// Plain REST calls to the local Supabase admin APIs: loading @supabase/supabase-js from Playwright's
// CommonJS runner hits a Node 22 require(esm) bug.
async function supabaseAdmin<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = process.env.E2E_SUPABASE_SECRET_KEY!
  const response = await fetch(`${process.env.E2E_SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
  })
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${response.status} ${await response.text()}`)
  return (response.status === 204 ? null : await response.json()) as T
}

// Recreates the test user (deleting it cascades to its profile, routes and activity) and one public route.
export default async function globalSetup() {
  const { users } = await supabaseAdmin<{ users: { id: string, email: string }[] }>('/auth/v1/admin/users?per_page=1000')
  for (const user of users.filter(u => u.email === E2E_USER.email)) {
    await supabaseAdmin(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE' })
  }

  const user = await supabaseAdmin<{ id: string }>('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: E2E_USER.email,
      password: E2E_USER.password,
      email_confirm: true,
      user_metadata: { username: E2E_USER.username },
    }),
  })

  // A ~6.5 km point-to-point route, and a longer loop with more climbing (both running, both near Annecy).
  const [route] = await supabaseAdmin<{ id: string }[]>('/rest/v1/routes?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([
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
      },
    ]),
  })

  process.env.E2E_ROUTE_ID = route!.id
}
