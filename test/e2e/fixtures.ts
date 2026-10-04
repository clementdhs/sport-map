import { type APIRequestContext, test as base, expect, type Page, type PlaywrightWorkerArgs } from '@playwright/test'

// Session of the test account, saved by auth.setup.ts and reused by the signed-in tests.
export const AUTH_FILE = 'test/e2e/.auth/user.json'
// Session of another family member, who browses the test account's routes (family specs).
export const FAMILY_AUTH_FILE = 'test/e2e/.auth/family.json'

// Test-only account, created in the local Supabase by the global setup.
export const E2E_USER = {
  email: 'e2e@sport-map.test',
  password: 'e2e-local-password',
  username: 'e2e_user',
  // Set by the global setup, so route cards show it instead of the username
  displayName: 'Coureur e2e',
}

export const SEEDED_ROUTE_NAME = 'Traversée e2e du lac'
export const SEEDED_LOOP_NAME = 'Tour e2e des crêtes'

// Test account whose password the reset test changes, so as not to disturb the others.
export const RESET_USER = {
  email: 'e2e-reset@sport-map.test',
  password: 'e2e-reset-initial',
  username: 'e2e_reset',
}

// Family member who doesn't own the seeded routes: the app is for signed-in members only.
export const FAMILY_USER = {
  email: 'e2e-famille@sport-map.test',
  password: 'e2e-famille-password',
  username: 'e2e_famille',
}

// Other test users, created by the global setup to review and report.
export const E2E_NEIGHBORS = [1, 2, 3].map(i => ({ email: `e2e-voisin${i}@sport-map.test`, username: `e2e_voisin${i}` }))

// Review of the seeded point-to-point route by the first neighbor.
export const SEEDED_REVIEW = { rating: 4, comment: 'Très jolie balade au bord du lac.' }

// A style without any source: the map loads instantly and offline.
export const EMPTY_MAP_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e8efe6' } }],
}

// A transparent 1×1 PNG, for raster tiles (Plan IGN basemap).
const EMPTY_TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

async function mockExternalServices(page: Page) {
  await page.route('https://api.maptiler.com/maps/**', route => route.fulfill({ json: EMPTY_MAP_STYLE }))
  // No place found, unless a test mocks its own results.
  await page.route('https://api.maptiler.com/geocoding/**', route => route.fulfill({ json: { features: [] } }))
  await page.route('https://data.geopf.fr/**', route => route.fulfill({ contentType: 'image/png', body: EMPTY_TILE }))
  // Fake routing: a straight line through the midpoint, climbing from 100 to 200 m.
  await page.route('**/api/routing/segment', async (route) => {
    const { from, to } = route.request().postDataJSON() as { from: [number, number], to: [number, number] }
    const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]
    await route.fulfill({ json: { coordinates: [from, mid, to], elevations: [100, 150, 200], snapped: true } })
  })
}

export const test = base.extend<{ mockServices: void }>({
  mockServices: [async ({ page }, use) => {
    await mockExternalServices(page)
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

// Requests as another family member, from a test signed in as the test account.
export function familyRequest(playwright: PlaywrightWorkerArgs['playwright'], baseURL: string): Promise<APIRequestContext> {
  return playwright.request.newContext({ baseURL, storageState: FAMILY_AUTH_FILE })
}

// Requests without any session, e.g. from a test signed in as the test account.
export function signedOutRequest(playwright: PlaywrightWorkerArgs['playwright'], baseURL: string): Promise<APIRequestContext> {
  return playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
}

// Secondary actions of a route page are in its "…" menu, which only opens once the page is hydrated.
export async function routeAction(page: Page, name: string) {
  await waitForHydration(page)
  await page.getByRole('button', { name: "Plus d'actions" }).click()
  await page.getByRole('menuitem', { name }).click()
}
