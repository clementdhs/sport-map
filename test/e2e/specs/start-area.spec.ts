import type { Page } from '@playwright/test'
import { expect, test, waitForHydration, waitForMap } from '../fixtures'

// "Ma zone de départ" (#147): with the position refused, the home page, the editor and /discover open on the area
// set in the settings instead of the whole of France.
test.use({ role: 'family', permissions: [] })

const ANNECY = { place_name: 'Annecy, Haute-Savoie, France', center: [6.12, 45.9], bbox: [6.08, 45.86, 6.16, 45.94] }
const FRANCE = [2.35, 46.6]

const saved = (page: Page) => page.waitForResponse(response =>
  /\/api\/profile\/me\/preferences$/.test(response.url()) && response.request().method() === 'PATCH' && response.ok())

async function mapCenter(page: Page): Promise<number[]> {
  await waitForMap(page)
  return (await page.locator('[data-map-center]').getAttribute('data-map-center'))!.split(',').map(Number)
}

async function expectMapOn(page: Page, [lng, lat]: number[]) {
  const [mapLng, mapLat] = await mapCenter(page)
  expect(Math.abs(mapLng! - lng!)).toBeLessThan(0.05)
  expect(Math.abs(mapLat! - lat!)).toBeLessThan(0.05)
}

test('maps open on the start area found by searching a place', async ({ page }) => {
  // Without one, the whole of France.
  await page.goto('/')
  await expectMapOn(page, FRANCE)

  await page.route('https://api.maptiler.com/geocoding/**', route => route.fulfill({ json: { features: [ANNECY] } }))
  await page.goto('/settings#start-area')
  await waitForHydration(page)
  const summary = page.locator('[data-start-area]')
  await expect(summary).toHaveText('Aucune zone : les cartes s\'ouvrent sur toute la France.')
  const areaSaved = saved(page)
  await page.getByRole('combobox', { name: 'Rechercher un lieu' }).fill('Annecy')
  await page.getByRole('option', { name: ANNECY.place_name }).click()
  await areaSaved
  await expect(summary).toHaveText(`Zone de départ : ${ANNECY.place_name}`)
  expect(await (await page.request.get('/api/profile/me/preferences')).json())
    .toMatchObject({ startArea: { bounds: ANNECY.bbox, name: ANNECY.place_name } })

  await page.goto('/')
  await expectMapOn(page, ANNECY.center)
  await page.goto('/routes/create')
  await expectMapOn(page, ANNECY.center)
  await page.goto('/discover')
  await expectMapOn(page, ANNECY.center)

  // A view of its own (here a shared link) wins over the start area.
  await page.goto('/discover?at=48.4,2.65,12')
  await expectMapOn(page, [2.65, 48.4])
})

test('the start area can be taken from the map\'s view, and removed', async ({ page }) => {
  await page.goto('/settings#start-area')
  await waitForHydration(page)
  const summary = page.locator('[data-start-area]')
  await page.getByRole('button', { name: 'Choisir sur la carte' }).click()
  // The map opens on the home map's view, here the whole of France.
  await expectMapOn(page, FRANCE)
  const areaSaved = saved(page)
  await page.getByRole('button', { name: 'Utiliser la vue actuelle de la carte' }).click()
  await areaSaved
  await expect(summary).toHaveText('Zone de départ : une vue de carte choisie')
  const { startArea } = await (await page.request.get('/api/profile/me/preferences')).json() as { startArea: { bounds: number[], name: null } }
  expect(startArea.name).toBeNull()
  expect(startArea.bounds).toHaveLength(4)

  const areaRemoved = saved(page)
  await page.getByRole('button', { name: 'Retirer la zone' }).click()
  await areaRemoved
  await expect(summary).toHaveText('Aucune zone : les cartes s\'ouvrent sur toute la France.')
  expect(await (await page.request.get('/api/profile/me/preferences')).json()).toMatchObject({ startArea: null })
  await page.goto('/')
  await expectMapOn(page, FRANCE)
})
