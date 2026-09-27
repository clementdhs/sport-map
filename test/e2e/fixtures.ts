import { test as base, expect, type Page } from '@playwright/test'

// Session of the test account, saved by auth.setup.ts and reused by the signed-in tests.
export const AUTH_FILE = 'test/e2e/.auth/user.json'

// Test-only account, created in the local Supabase by the global setup.
export const E2E_USER = {
  email: 'e2e@sport-map.test',
  password: 'e2e-local-password',
  username: 'e2e_user',
}

export const SEEDED_ROUTE_NAME = 'Traversée e2e du lac'
export const SEEDED_LOOP_NAME = 'Tour e2e des crêtes'

// Other test users, created by the global setup to review and report.
export const E2E_NEIGHBORS = [1, 2, 3].map(i => ({ email: `e2e-voisin${i}@sport-map.test`, username: `e2e_voisin${i}` }))

// Review of the seeded point-to-point route by the first neighbor.
export const SEEDED_REVIEW = { rating: 4, comment: 'Très jolie balade au bord du lac.' }

// A style without any source: the map loads instantly and offline.
const EMPTY_MAP_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e8efe6' } }],
}

async function mockExternalServices(page: Page) {
  await page.route('**/demotiles.maplibre.org/**', route => route.fulfill({ json: EMPTY_MAP_STYLE }))
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

export async function waitForMap(page: Page) {
  await expect(page.locator('[data-map-loaded]')).toBeVisible()
}
