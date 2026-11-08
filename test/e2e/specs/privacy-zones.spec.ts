import type { APIRequestContext } from '@playwright/test'
import { distance } from '@turf/turf'
import { expect, FAR_AWAY, test, waitForHydration, waitForMap } from '../fixtures'

// Privacy zones (#254): the start and end of the test account's routes inside one are hidden from the team member
// and from the link preview, while the owner still sees everything. Routes visible to the team go to New Zealand.
test.use({ role: 'account' })

type LngLat = [number, number]
const START = FAR_AWAY.center as LngLat
// About `metres` east and `north` metres north of the start (1° of longitude is ~78.7 km at 45° S).
// Rounded like the API's GeoJSON (6 decimals).
const round = (value: number) => Math.round(value * 1e6) / 1e6
const at = (metres: number, north = 0): LngLat => [round(START[0] + metres / 78_700), round(START[1] + north / 111_000)]
// A loop from the start: 1 km east, then back 50 m further north.
const OUT = Array.from({ length: 11 }, (_, i) => at(i * 100))
const COORDINATES = [...OUT, ...OUT.slice(0, -1).reverse().map(([lng]): LngLat => [lng, at(0, 50)[1]])]
const ROUTE = { name: 'Boucle e2e de la maison', sport_type: 'running', is_public: true, coordinates: COORDINATES, elevations: COORDINATES.map((_, i) => 400 + i) }
// Entirely inside the zone.
const AROUND_HOME = { name: 'Tour e2e du pâté de maisons', sport_type: 'running', is_public: true, coordinates: [at(0), at(60), at(60, 40)] }

const metresFrom = (point: number[], from: LngLat) => distance(point as LngLat, from, { units: 'meters' })

interface Detail {
  geometry: { coordinates: number[][] }
  elevation_profile: number[] | null
  editor_state: unknown
  distance_m: number
  privacy_masked: boolean
}

async function removeZones(request: APIRequestContext) {
  const zones = await (await request.get('/api/profile/me/privacy-zones')).json() as { id: string }[]
  for (const zone of zones) await request.delete(`/api/profile/me/privacy-zones/${zone.id}`)
}

test('hides the start and end of routes in a zone from the team and the link preview', async ({ page, requestAs }) => {
  const owner = page.request
  const family = await requestAs('family')
  const visitor = await requestAs(null)
  const { id } = await (await owner.post('/api/routes', { data: ROUTE })).json() as { id: string }
  const { id: hiddenId } = await (await owner.post('/api/routes', { data: AROUND_HOME })).json() as { id: string }
  try {
    const previewBefore = await (await visitor.get(`/api/routes/${id}/og.png`)).body()
    const added = await owner.post('/api/profile/me/privacy-zones', { data: { center: START, radius_m: 200, label: 'Maison e2e' } })
    expect(added.status()).toBe(201)
    expect(await added.json()).toMatchObject({ applied: true, zones: [{ label: 'Maison e2e', center: START, radius_m: 200 }] })

    // The team member gets the track from where it leaves the zone (moved by at most 40 % of its radius) to
    // where it enters it again, with the figures of that part.
    const seen = await (await family.get(`/api/routes/${id}`)).json() as Detail
    const coordinates = seen.geometry.coordinates
    expect(seen.privacy_masked).toBe(true)
    expect(seen.editor_state).toBeNull()
    expect(coordinates.length).toBeLessThan(COORDINATES.length)
    expect(metresFrom(coordinates[0]!, START)).toBeGreaterThan(110)
    expect(metresFrom(coordinates.at(-1)!, START)).toBeGreaterThan(110)
    expect(coordinates.every(point => metresFrom(point, START) > 110)).toBe(true)
    expect(seen.elevation_profile).toHaveLength(coordinates.length)
    expect(seen.distance_m).toBeLessThan(1850)
    // Nor in the GPX it downloads.
    const gpx = await (await family.get(`/api/routes/${id}/gpx`)).text()
    expect(gpx).toContain('<trkpt')
    expect(gpx).not.toContain(`lat="${START[1]}" lon="${START[0]}"`)

    // The owner still sees everything.
    const own = await (await owner.get(`/api/routes/${id}`)).json() as Detail
    expect(own.privacy_masked).toBe(true)
    expect(own.geometry.coordinates).toEqual(COORDINATES)
    expect(own.distance_m).toBeGreaterThan(1950)

    // A route entirely inside the zone is the owner's only, preview included.
    expect((await family.get(`/api/routes/${hiddenId}`)).status()).toBe(404)
    expect((await visitor.get(`/api/routes/${hiddenId}/og.png`)).status()).toBe(404)
    expect((await owner.get(`/api/routes/${hiddenId}`)).ok()).toBe(true)

    // The link preview draws the visible part only.
    const previewAfter = await (await visitor.get(`/api/routes/${id}/og.png`)).body()
    expect(previewAfter.equals(previewBefore)).toBe(false)

    // Each one is told on the route page.
    await page.goto(`/routes/${id}`)
    await expect(page.locator('[data-privacy-notice]')).toContainText('Le reste de l\'équipe ne voit pas le départ et l\'arrivée')
    await expect(page.locator('[data-privacy-notice]').getByRole('link', { name: 'Mes zones' })).toHaveAttribute('href', '/settings#privacy')

    // Without the zone, the team sees the whole track again.
    await removeZones(owner)
    const restored = await (await family.get(`/api/routes/${id}`)).json() as Detail
    expect(restored.privacy_masked).toBe(false)
    expect(restored.geometry.coordinates).toEqual(COORDINATES)
    expect((await family.get(`/api/routes/${hiddenId}`)).ok()).toBe(true)
  }
  finally {
    await removeZones(owner)
    await owner.delete(`/api/routes/${id}`)
    await owner.delete(`/api/routes/${hiddenId}`)
  }
})

test('tells a team member that a route\'s start and end are hidden', async ({ page, newDevice }) => {
  const { id } = await (await page.request.post('/api/routes', { data: ROUTE })).json() as { id: string }
  try {
    await page.request.post('/api/profile/me/privacy-zones', { data: { center: START, radius_m: 200 } })
    const member = await newDevice('family')
    await member.goto(`/routes/${id}`)
    await expect(member.locator('[data-privacy-notice]')).toContainText('Départ et arrivée masqués par')
  }
  finally {
    await removeZones(page.request)
    await page.request.delete(`/api/routes/${id}`)
  }
})

test('adds and removes a zone in the settings', async ({ page }) => {
  try {
    await page.goto('/settings#privacy')
    await waitForHydration(page)
    const section = page.locator('[data-privacy-zones]')
    await expect(section).toContainText('Aucune zone')
    await section.getByRole('button', { name: 'Ajouter une zone' }).click()
    await waitForMap(page)
    const map = section.locator('.maplibregl-canvas')
    await map.click()
    await expect(section.locator('[data-privacy-center]')).toHaveAttribute('data-privacy-center', /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
    await section.getByRole('tab', { name: '200 m' }).click()
    await section.getByPlaceholder('Maison').fill('Bureau e2e')
    await section.getByRole('button', { name: 'Ajouter la zone' }).click()
    await expect(page.getByText('Zone ajoutée : tes parcours et sorties sont à jour', { exact: true })).toBeVisible()
    const zone = section.locator('[data-privacy-zone]')
    await expect(zone).toHaveCount(1)
    await expect(zone).toContainText('Bureau e2e')
    await expect(zone).toContainText('Rayon 200 m')

    // Kept in the account.
    await page.reload()
    await expect(zone).toContainText('Bureau e2e')

    page.once('dialog', dialog => dialog.accept())
    await waitForHydration(page)
    await zone.getByRole('button', { name: 'Retirer la zone Bureau e2e' }).click()
    await expect(page.getByText('Zone retirée : tes parcours et sorties sont à jour', { exact: true })).toBeVisible()
    await expect(section).toContainText('Aucune zone')
  }
  finally {
    await removeZones(page.request)
  }
})
