import type { Page } from '@playwright/test'
import { expect, test, waitForHydration, waitForMap } from '../fixtures'

// Useful places from OpenStreetMap along a route (#52), on a private route of the test account created for the
// test: it has never been searched, whatever other tests did on the seeded routes.
test.use({ role: 'account' })

// ~1.55 km heading east.
const COORDINATES = [[6.1, 45.9], [6.12, 45.9]]
const ROUTE = { name: 'Points utiles e2e', sport_type: 'hiking', is_public: false, coordinates: COORDINATES }
const WATER = { type: 'node', id: 1, lat: 45.9002, lon: 6.105, tags: { amenity: 'drinking_water' } }
const ELEMENTS = [
  WATER,
  { type: 'way', id: 2, center: { lat: 45.9001, lon: 6.115 }, tags: { amenity: 'parking', name: 'Parking du col' } },
  { type: 'node', id: 3, lat: 45.9015, lon: 6.118, tags: { natural: 'peak', name: 'Mont e2e', ele: '1500' } },
  // A bus shelter is no useful place.
  { type: 'node', id: 4, lat: 45.9, lon: 6.11, tags: { amenity: 'shelter', shelter_type: 'public_transport' } },
]

// Serves `served.elements` from Overpass, and keeps the queries.
async function mockOverpass(page: Page) {
  const served = { elements: ELEMENTS as unknown[], queries: [] as string[] }
  await page.route('**/api/interpreter', async (route) => {
    served.queries.push(new URLSearchParams(route.request().postData() ?? '').get('data') ?? '')
    await route.fulfill({ json: { elements: served.elements } })
  })
  return served
}

async function toggleLayer(page: Page) {
  await waitForHydration(page)
  await page.getByRole('button', { name: 'Calques' }).click()
  await page.getByRole('switch', { name: 'Points utiles (OpenStreetMap)' }).click()
  await page.keyboard.press('Escape')
}

test('finds the useful places once, lists them along the route and shows them on the maps', async ({ page, requestAs }) => {
  const { id } = await (await page.request.post('/api/routes', { data: ROUTE })).json() as { id: string }
  const overpass = await mockOverpass(page)
  const { queries } = overpass
  try {
    await page.goto(`/routes/${id}`)
    const section = page.getByTestId('osm-places')
    const items = section.getByRole('listitem')
    await expect(items).toHaveCount(3)
    await expect(items.nth(0)).toContainText('Eau potable · km 0,4')
    await expect(items.nth(0)).toContainText('à 20 m du tracé')
    await expect(items.nth(1)).toContainText('Parking · km 1,2')
    await expect(items.nth(1)).toContainText('Parking du col · sur le tracé')
    await expect(items.nth(2)).toContainText('Sommet · km 1,4')
    await expect(items.nth(2)).toContainText('Mont e2e · 1500 m · à 170 m du tracé')
    await expect(section.getByRole('link', { name: "© les contributeurs d'OpenStreetMap" })).toBeVisible()
    expect(queries).toHaveLength(1)
    expect(queries[0]).toContain('(around:200,45.90000,6.10000,45.90000,6.12000)')

    await waitForMap(page)
    const markers = page.locator('[data-osm-place-marker]')
    await expect(markers).toHaveCount(3)
    await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap')

    // Saved with the route: no new query.
    await page.reload()
    await expect(items).toHaveCount(3)
    expect(queries).toHaveLength(1)

    // The layer is turned off in the "Calques" panel, for every map of the member.
    await waitForMap(page)
    await toggleLayer(page)
    await expect(markers).toHaveCount(0)
    await page.goto(`/routes/${id}/follow`)
    await waitForMap(page)
    await expect(markers).toHaveCount(0)
    await toggleLayer(page)
    await expect(markers).toHaveCount(3)
    expect(queries).toHaveLength(1)

    // Updated on request.
    overpass.elements = [WATER]
    await page.goto(`/routes/${id}`)
    await waitForHydration(page)
    await section.getByRole('button', { name: 'Mettre à jour' }).click()
    await expect(items).toHaveCount(1)
    expect(queries).toHaveLength(2)

    // Another member can't save places on a route they can't see.
    const family = await requestAs('family')
    expect((await family.put(`/api/routes/${id}/osm-places`, { data: { places: [] } })).status()).toBe(404)

    // A new track makes them stale: the route has none until its page searches again.
    expect((await page.request.put(`/api/routes/${id}`, { data: { ...ROUTE, coordinates: [[6.1, 45.9], [6.1, 45.92]] } })).ok()).toBe(true)
    expect((await (await page.request.get(`/api/routes/${id}`)).json()).osm_places).toBeNull()
  }
  finally {
    await page.request.delete(`/api/routes/${id}`)
  }
})
