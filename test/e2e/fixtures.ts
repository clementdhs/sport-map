import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { type APIRequestContext, test as base, type Browser, type BrowserContext, expect, type Page } from '@playwright/test'
import { supabaseAdmin } from './admin'

// Every test user has an address on this domain: the global setup deletes them all before recreating them.
export const TEST_EMAIL_DOMAIN = '@sport-map.test'

export interface TestUser {
  email: string
  password: string
  username: string
  // Set by the global setup, so route cards show it instead of the username.
  displayName?: string
}

// Owner of the seeded routes, shared by every worker. Its pages are never signed in, but visitors.spec.ts tries the
// sign-in page with it.
export const SEED_OWNER = {
  email: `e2e${TEST_EMAIL_DOMAIN}`,
  password: 'e2e-local-password',
  username: 'e2e_user',
  displayName: 'Coureur e2e',
}

export const SEEDED_ROUTE_NAME = 'Traversée e2e du lac'
export const SEEDED_LOOP_NAME = 'Tour e2e des crêtes'

// Test account whose password the reset test changes, so as not to disturb the others.
export const RESET_USER = {
  email: `e2e-reset${TEST_EMAIL_DOMAIN}`,
  password: 'e2e-reset-initial',
  username: 'e2e_reset',
}

// Other test users, created by the global setup to review and report.
export const E2E_NEIGHBORS = [1, 2, 3].map(i => ({ email: `e2e-voisin${i}${TEST_EMAIL_DOMAIN}`, username: `e2e_voisin${i}` }))

// Review by the first neighbor of the seeded point-to-point route and of each worker's own route.
export const SEEDED_REVIEW = { rating: 4, comment: 'Très jolie balade au bord du lac.' }

// Who a test's pages are signed in as: the test account or a family member who doesn't own its routes.
export type Role = 'account' | 'family'

export interface WorkerUsers {
  account: TestUser & { displayName: string }
  family: TestUser
}

// Each parallel worker (`parallelIndex`) has its own test account and family member, created by the global setup:
// tests running at the same time never share a quota, a profile, outings or a position share.
export function workerUsers(index: number): WorkerUsers {
  const n = index + 1
  return {
    account: { email: `e2e-compte-${n}${TEST_EMAIL_DOMAIN}`, password: `e2e-compte-${n}-password`, username: `e2e_compte_${n}`, displayName: `Compte e2e ${n}` },
    family: { email: `e2e-famille-${n}${TEST_EMAIL_DOMAIN}`, password: `e2e-famille-${n}-password`, username: `e2e_famille_${n}` },
  }
}

// The test account of each worker also owns a route visible to the family, reviewed by the first neighbor. Like
// every route visible to the family that tests create, it lies far from France (see FAR_AWAY).
export const ACCOUNT_ROUTE_NAME = 'Belvédère e2e du compte'

// Sessions saved by the workers, one file per role and worker: the global setup deletes them with the users.
export const AUTH_DIR = 'test/e2e/.auth'

// The search tests count every route visible to the family in France, and the routes whose name or description
// match their words, while other workers run. Routes visible to the family that other tests create lie here, in
// New Zealand, with other words in their names.
export const FAR_AWAY = { place_name: 'Queenstown, Nouvelle-Zélande', center: [168.66, -45.03], bbox: [168.6, -45.08, 168.72, -44.98] }

// A style without any source: the map loads instantly and offline. Served for both MapTiler styles; its background
// has outdoor-v2's layer id, so the topo colours (app/utils/topoStyle.ts, #230) paint it cream or "nuit topo", and a
// theme change has a colour to apply.
export const EMPTY_MAP_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'Background', type: 'background', paint: { 'background-color': '#e8efe6' } }],
}

// A transparent 1×1 PNG, for raster tiles (Plan IGN basemap).
const EMPTY_TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

// The empty style plus an elevation source, which the 3D view needs, with every tile at sea level (terrain-RGB
// pixel 1, 134, 160 = 0 m).
const RELIEF_MAP_STYLE = {
  ...EMPTY_MAP_STYLE,
  sources: { 'terrain-rgb': { type: 'raster-dem', tiles: ['https://api.maptiler.com/tiles/terrain-rgb-v2/{z}/{x}/{y}.png'], tileSize: 256 } },
}
const SEA_LEVEL_DEM_TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgbFsAAAGzASgo2PpvAAAAAElFTkSuQmCC', 'base64')

// Instead of the empty style, for the next page loads.
export async function mockReliefStyle(page: Page) {
  await page.route('https://api.maptiler.com/maps/**', route => route.fulfill({ json: RELIEF_MAP_STYLE }))
  await page.route('https://api.maptiler.com/tiles/**', route => route.fulfill({ contentType: 'image/png', body: SEA_LEVEL_DEM_TILE }))
}

async function mockExternalServices(page: Page) {
  await page.route('https://api.maptiler.com/maps/**', route => route.fulfill({ json: EMPTY_MAP_STYLE }))
  // No place found, unless a test mocks its own results.
  await page.route('https://api.maptiler.com/geocoding/**', route => route.fulfill({ json: { features: [] } }))
  await page.route('https://data.geopf.fr/**', route => route.fulfill({ contentType: 'image/png', body: EMPTY_TILE }))
  // No marked route from any Overpass instance (queried from the browser), unless a test mocks its own.
  await page.route('**/api/interpreter', route => route.fulfill({ json: { elements: [] } }))
  // Nor from Nominatim, the named places' fallback (#310): never the real one, whose usage policy forbids bulk tests.
  await page.route('https://nominatim.openstreetmap.org/**', route => route.fulfill({ json: [] }))
  // Fake routing: a straight line through the midpoint, climbing from 100 to 200 m, on a street then a gravel
  // track graded T3 (walking) or S2 (cycling).
  await page.route('**/api/routing/segment', async (route) => {
    const { from, to } = route.request().postDataJSON() as { from: [number, number], to: [number, number] }
    const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]
    const graded = [[0, 1, 0], [1, 2, 3]]
    const wayInfo = { surface: [[0, 1, 3], [1, 2, 10]], waytype: [[0, 1, 3], [1, 2, 5]], sac_scale: graded, mtb_scale: graded }
    await route.fulfill({ json: { coordinates: [from, mid, to], elevations: [100, 150, 200], snapped: true, way_info: wayInfo } })
  })
  // Fake loops: a square from the start, as long as asked (21 points), climbing 50 m on its first side; each seed
  // turns it a quarter, so proposals differ.
  await page.route('**/api/routing/loop', async (route) => {
    const { start: [lng, lat], length_m, seed, prefer_paths } = route.request().postDataJSON() as { start: [number, number], length_m: number, seed: number, prefer_paths?: boolean }
    // 111 195 m per degree of latitude, as on turf's sphere: the editor measures 8,00 km for 8000 m.
    const sideDeg = length_m / 4 / 111_195
    const turn = ([x, y]: [number, number]): [number, number] => [y, -x]
    const corners = ([[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]] as [number, number][]).map((corner) => {
      for (let i = 0; i < seed % 4; i++) corner = turn(corner)
      return corner
    })
    const coordinates: [number, number][] = []
    for (let side = 0; side < 4; side++) {
      const [x0, y0] = corners[side]!
      const [x1, y1] = corners[side + 1]!
      for (let step = 0; step < 5; step++) {
        const [x, y] = [x0 + (x1 - x0) * step / 5, y0 + (y1 - y0) * step / 5]
        coordinates.push([lng + x * sideDeg / Math.cos(lat * Math.PI / 180), lat + y * sideDeg])
      }
    }
    coordinates.push([lng, lat])
    const elevations = coordinates.map((_, i) => 100 + Math.min(i, 5) * 10)
    // Paths asked for (#295): the first 5, 10 or 15 of the 20 edges are paths (25, 50 or 75 %), by seed.
    const pathEdges = 5 * (seed % 3 + 1)
    const way_info = prefer_paths ? { surface: [], waytype: [[0, pathEdges, 4], [pathEdges, 20, 2]], sac_scale: [], mtb_scale: [] } : undefined
    await route.fulfill({ json: { coordinates, elevations, ...(way_info ? { way_info } : {}), quota_remaining: 299 } })
  })
}

// Signs in through the sign-in page, in French, and saves the session without the language cookie: the language
// of each test then comes from its browser (en-GB in the English project).
async function signIn(browser: Browser, baseURL: string, user: TestUser, file: string) {
  const context = await browser.newContext({ baseURL, locale: 'fr-FR', serviceWorkers: 'block' })
  const page = await context.newPage()
  await mockExternalServices(page)
  await page.goto('/login')
  await waitForHydration(page)
  // By name: the password label also matches the "Afficher le mot de passe" toggle.
  await page.locator('input[name="identifier"]').fill(user.email)
  await page.locator('input[name="password"]').fill(user.password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  // Signed in, on the home page: its floating map bar has the account menu.
  await expect(page.getByRole('button', { name: 'Mon compte' })).toBeVisible()
  const state = await context.storageState()
  await context.close()
  mkdirSync(AUTH_DIR, { recursive: true })
  writeFileSync(file, JSON.stringify({ ...state, cookies: state.cookies.filter(cookie => cookie.name !== 'sport-map-locale') }))
}

interface TestFixtures {
  mockServices: void
  // Who the page is signed in as, set per spec or describe with test.use({ role }); nobody by default.
  role: Role | null
  // Routes the home search starts with, as if picked earlier on this device (null: the app's default, "Mes
  // parcours"). Tests looking for the seeded routes as the family member need "all": they aren't theirs.
  searchScope: 'mine' | 'all' | null
  // A new API context signed in as one of the worker's users, or signed out (null). Disposed after the test.
  requestAs: (role: Role | null) => Promise<APIRequestContext>
  // A page on another device of one of the worker's users (its own browser context, signed in, external services
  // mocked), closed after the test. `localStorage` replaces what the device keeps, e.g. preferences from before #145.
  newDevice: (role: Role, localStorage?: Record<string, string>) => Promise<Page>
  // Each test starts with accounts without preferences (#145): a basemap, 3D view or home filter picked by a
  // test would otherwise follow the account into the worker's next tests.
  freshPreferences: void
}

interface WorkerFixtures {
  users: WorkerUsers
  // Profile ids of the worker's users.
  userIds: string[]
  // The id of the route owned by the worker's test account (ACCOUNT_ROUTE_NAME).
  accountRouteId: string
  // The saved sessions of the worker's users.
  authFiles: Record<Role, string>
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  role: [null, { option: true }],
  searchScope: [null, { option: true }],
  users: [async ({}, use, workerInfo) => {
    await use(workerUsers(workerInfo.parallelIndex))
  }, { scope: 'worker' }],
  userIds: [async ({ users }, use) => {
    const rows = await supabaseAdmin<{ id: string }[]>(`/rest/v1/profiles?select=id&username=in.(${users.account.username},${users.family.username})`)
    await use(rows.map(row => row.id))
  }, { scope: 'worker' }],
  accountRouteId: [async ({}, use, workerInfo) => {
    await use(process.env.E2E_ACCOUNT_ROUTE_IDS!.split(',')[workerInfo.parallelIndex]!)
  }, { scope: 'worker' }],
  // Both users signed in before the worker's first test, outside its timeout: a test may need the other one late.
  authFiles: [async ({ browser, users }, use, workerInfo) => {
    const files = {} as Record<Role, string>
    for (const role of ['account', 'family'] as const) {
      // Kept on disk: a worker started again after a failure, or for the other project, has the same
      // parallelIndex, hence the same users.
      files[role] = `${AUTH_DIR}/${role}-${workerInfo.parallelIndex}.json`
      if (!existsSync(files[role])) await signIn(browser, workerInfo.project.use.baseURL!, users[role], files[role])
    }
    await use(files)
  }, { scope: 'worker', timeout: 60_000 }],
  storageState: async ({ storageState, role, authFiles }, use) => {
    await use(role ? authFiles[role] : storageState)
  },
  requestAs: async ({ playwright, baseURL, authFiles }, use) => {
    const contexts: APIRequestContext[] = []
    await use(async (role) => {
      const context = await playwright.request.newContext({ baseURL, storageState: role ? authFiles[role] : { cookies: [], origins: [] } })
      contexts.push(context)
      return context
    })
    for (const context of contexts) await context.dispose()
  },
  newDevice: async ({ browser, authFiles, baseURL, locale, timezoneId, serviceWorkers }, use) => {
    const contexts: BrowserContext[] = []
    await use(async (role, localStorage) => {
      const saved = JSON.parse(readFileSync(authFiles[role], 'utf8'))
      const storageState = localStorage
        ? { ...saved, origins: [{ origin: baseURL!, localStorage: Object.entries(localStorage).map(([name, value]) => ({ name, value })) }] }
        : saved
      const context = await browser.newContext({ baseURL, locale, timezoneId, serviceWorkers, storageState })
      contexts.push(context)
      const page = await context.newPage()
      await mockExternalServices(page)
      return page
    })
    for (const context of contexts) await context.close()
  },
  freshPreferences: [async ({ role, userIds }, use) => {
    if (role) await supabaseAdmin(`/rest/v1/user_preferences?user_id=in.(${userIds.join(',')})`, { method: 'DELETE' })
    await use()
  }, { auto: true }],
  mockServices: [async ({ page, searchScope }, use) => {
    await mockExternalServices(page)
    // Only until a pick of the test itself, which a reload keeps.
    if (searchScope) {
      await page.addInitScript((scope) => {
        if (localStorage.getItem('sport-map:search-scope') === null) localStorage.setItem('sport-map:search-scope', scope)
      }, searchScope)
    }
    await use()
  }, { auto: true }],
})

export { expect }

// Maps load slower on the CI runners than the default 5 s of expect.
export async function waitForMap(page: Page) {
  await expect(page.locator('[data-map-loaded]')).toBeVisible({ timeout: 15_000 })
}

// Before typing in a form or opening a menu right after a navigation: hydration resets inputs filled earlier,
// and buttons do nothing until then (app/plugins/hydrated.client.ts).
export async function waitForHydration(page: Page) {
  await expect(page.locator('html[data-hydrated]')).toBeAttached({ timeout: 15_000 })
}

// The member's own routes on their profile, which opens on its statistics (#236): the Parcours tab, on "Mes parcours".
export async function openProfileRoutes(page: Page) {
  await waitForHydration(page)
  await page.getByRole('tab', { name: 'Parcours', exact: true }).click()
}

// Moves the editor's map to FAR_AWAY, before drawing a route that will be visible to the family.
export async function moveEditorFarAway(page: Page) {
  await page.route('https://api.maptiler.com/geocoding/**', route => route.fulfill({ json: { features: [FAR_AWAY] } }))
  await page.getByRole('combobox', { name: 'Rechercher un lieu' }).fill('Queenstown')
  await page.getByRole('option', { name: FAR_AWAY.place_name }).click()
  // data-map-center changes once the map has stopped moving.
  await expect.poll(async () => {
    const [lng, lat] = (await page.locator('[data-map-center]').getAttribute('data-map-center'))!.split(',').map(Number)
    return Math.abs(lng! - FAR_AWAY.center[0]!) < 0.05 && Math.abs(lat! - FAR_AWAY.center[1]!) < 0.05
  }, { timeout: 10_000 }).toBe(true)
}

// Secondary actions of a route page are in its "…" menu, which only opens once the page is hydrated.
export async function routeAction(page: Page, name: string) {
  await waitForHydration(page)
  await page.getByRole('button', { name: "Plus d'actions" }).click()
  await page.getByRole('menuitem', { name }).click()
}
