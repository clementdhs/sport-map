import { readFileSync } from 'node:fs'
import { expect, test, waitForMap } from '../fixtures'

test.use({ role: 'account' })

// Marked routes come from 4 real relations of Fontainebleau; the first Overpass instance is busy, as it often is.
test('finds marked routes around a place and imports one into the editor', async ({ page }) => {
  const fontainebleau = readFileSync('test/fixtures/overpass-fontainebleau.json', 'utf8')
  await page.route('https://overpass-api.de/api/interpreter', route => route.fulfill({ status: 504, body: 'busy' }))
  await page.route('https://maps.mail.ru/osm/tools/overpass/api/interpreter', route =>
    route.fulfill({ contentType: 'application/json', body: fontainebleau }))
  await page.route('https://api.maptiler.com/geocoding/**', route => route.fulfill({
    json: { features: [{ place_name: 'Fontainebleau, Seine-et-Marne, France', center: [2.65, 48.41] }] },
  }))

  await page.goto('/')
  await waitForMap(page)
  await page.getByRole('link', { name: 'Parcours balisés OpenStreetMap dans cette zone' }).click()
  await expect(page).toHaveURL(/\/discover(\?|$)/)
  await waitForMap(page)
  // The home map shows the whole of France: too wide for Overpass.
  await expect(page.getByText('La zone affichée est trop grande')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Chercher dans cette zone' })).toBeDisabled()

  await page.getByRole('combobox', { name: 'Rechercher un lieu' }).fill('Fontainebleau')
  await page.getByRole('option', { name: 'Fontainebleau, Seine-et-Marne, France' }).click()
  await page.getByRole('button', { name: 'Chercher dans cette zone' }).click()

  const results = page.getByRole('list', { name: 'Parcours balisés trouvés' })
  await expect(results.getByRole('listitem')).toHaveCount(4)
  await expect(page.getByText('4 parcours balisés').filter({ visible: true })).toBeVisible()

  // Its ways don't connect: it can't be imported, and has no elevation gain.
  const incomplete = results.getByRole('button', { name: /^Sentier Denecourt-Colinet 15\b/ })
  await expect(incomplete).toContainText('D+ inconnu')
  await incomplete.click()
  await expect(page.getByText('Ses morceaux ne se raccordent pas')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Importer/ })).toHaveCount(0)

  // The gains of the others are computed from the fake elevations (#71).
  const loop = results.getByRole('button', { name: /^Sentier Denecourt-Colinet 1\b/ })
  await expect(loop).toContainText(/D\+ \d+ m/)
  const gain = (await loop.textContent())!.match(/D\+ (\d+) m/)![1]!
  await loop.click()
  await page.getByRole('button', { name: 'Importer Sentier Denecourt-Colinet 1 dans l\'éditeur' }).click()

  await expect(page).toHaveURL('/routes/create')
  await expect(page.getByText('Parcours balisé importé').first()).toBeVisible()
  await expect(page.getByLabel('Nom')).toHaveValue('Sentier Denecourt-Colinet 1')
  await expect(page.getByRole('group', { name: 'Sport', exact: true }).getByRole('button', { pressed: true })).toHaveText('Rando')
  await expect(page.getByLabel('Description')).toHaveValue(/openstreetmap\.org\/relation\/389996/)
  // A 3.8 km loop in OpenStreetMap, with the gain the list showed.
  await expect(page.locator('p.text-3xl')).toHaveText(/^3,\d+ km$/)
  await expect(page.getByText('Dénivelé +', { exact: true }).locator('xpath=following-sibling::p')).toHaveText(`${gain} m`)

  // Back to the same search, its URL (written without navigating) kept in the history.
  await page.goBack()
  await expect(page).toHaveURL(/\/discover\?at=48\.\d+,2\.\d+,\d/)
  await expect(results.getByRole('listitem')).toHaveCount(4)
})

// A section of a marked route (#72), chosen with its fields; the map's taps and drags were checked by hand.
test('extracts a section of a marked route and imports it into the editor', async ({ page }) => {
  const fontainebleau = readFileSync('test/fixtures/overpass-fontainebleau.json', 'utf8')
  await page.route('**/api/interpreter', route => route.fulfill({ contentType: 'application/json', body: fontainebleau }))

  await page.goto('/discover?at=48.41,2.65,12')
  const results = page.getByRole('list', { name: 'Parcours balisés trouvés' })
  await expect(results.getByRole('listitem')).toHaveCount(4)

  // Its ways don't connect: a section stays on one of its pieces.
  await results.getByRole('button', { name: /^Sentier Denecourt-Colinet 15\b/ }).click()
  await page.getByRole('button', { name: 'Extraire un tronçon de Sentier Denecourt-Colinet 15' }).click()
  await expect(page.getByText('Ses morceaux ne se raccordent pas : le tronçon reste sur un seul.')).toBeVisible()
  await page.getByRole('button', { name: 'Revenir à la liste' }).click()

  await results.getByRole('button', { name: /^Sentier Denecourt-Colinet 7\b/ }).click()
  await page.getByRole('button', { name: 'Extraire un tronçon de Sentier Denecourt-Colinet 7' }).click()
  const panel = page.getByRole('region', { name: 'Extraire un tronçon' })
  await expect(panel.getByText('Sentier Denecourt-Colinet 7', { exact: true })).toBeVisible()
  await expect(results).toHaveCount(0)

  // A field is applied when it loses the focus, and then updates the others.
  await panel.getByRole('spinbutton', { name: 'Départ (km)' }).fill('1')
  await panel.getByRole('spinbutton', { name: 'Départ (km)' }).press('Tab')
  await expect(panel.getByRole('spinbutton', { name: 'Distance (km)' })).toHaveValue('9,7')
  await panel.getByRole('spinbutton', { name: 'Distance (km)' }).fill('2')
  await panel.getByRole('spinbutton', { name: 'Distance (km)' }).press('Tab')
  await expect(panel.getByRole('spinbutton', { name: 'Arrivée (km)' })).toHaveValue('3')

  // An arrival before the departure: the route is walked the other way.
  const arrival = panel.getByRole('spinbutton', { name: 'Arrivée (km)' })
  await arrival.fill('0,5')
  await arrival.press('Tab')
  await expect(panel.getByText('Il est parcouru dans l\'autre sens que le tracé d\'OpenStreetMap.')).toBeVisible()
  await expect(panel.getByRole('spinbutton', { name: 'Distance (km)' })).toHaveValue('0,5')
  await arrival.fill('3')
  await arrival.press('Tab')
  await expect(panel.getByText('Il est parcouru dans l\'autre sens')).toHaveCount(0)

  // Its elevations come from the fake IGN once the ends stay still.
  const summary = panel.getByText(/Tronçon de 2,00 km · D\+ \d+ m/)
  await expect(summary).toBeVisible()
  const gain = (await summary.textContent())!.match(/D\+ (\d+) m/)![1]!

  await panel.getByRole('button', { name: 'Importer le tronçon dans l\'éditeur' }).click()
  await expect(page).toHaveURL('/routes/create')
  await expect(page.getByText('Tronçon importé').first()).toBeVisible()
  await expect(page.getByLabel('Nom')).toHaveValue('Sentier Denecourt-Colinet 7, km 1 à 3')
  await expect(page.locator('p.text-3xl')).toHaveText(/^(1,9\d|2,00) km$/)
  // The editor keeps the section's elevations.
  await expect(page.getByText('Dénivelé +', { exact: true }).locator('xpath=following-sibling::p')).toHaveText(`${gain} m`)
})

// Of the 4 Fontainebleau relations: 2 loops (one tagged, one closing on itself), 1 one-way route, 1 whose ways don't
// connect (shape unknown).
test('filters the marked routes and keeps the filters and the view in the URL', async ({ page }) => {
  const fontainebleau = readFileSync('test/fixtures/overpass-fontainebleau.json', 'utf8')
  await page.route('**/api/interpreter', route => route.fulfill({ contentType: 'application/json', body: fontainebleau }))

  // A shared link: the page opens on its view and searches at once.
  await page.goto('/discover?at=48.41,2.65,12')
  const results = page.getByRole('list', { name: 'Parcours balisés trouvés' })
  await expect(results.getByRole('listitem')).toHaveCount(4)

  await page.getByRole('button', { name: 'Filtres' }).click()
  await page.getByRole('tab', { name: 'Boucles' }).click()
  await expect(results.getByRole('listitem')).toHaveCount(2)
  await expect(page.getByText('2 parcours balisés sur 4').filter({ visible: true })).toBeVisible()
  await expect(results.getByRole('button', { name: /^Sentier Denecourt-Colinet 1\b/ })).toBeVisible()

  await page.getByRole('tab', { name: 'Allers simples' }).click()
  await expect(results.getByRole('listitem')).toHaveCount(1)
  const oneWay = results.getByRole('button', { name: /^Sentier Denecourt-Colinet 7\b/ })
  await expect(oneWay).toContainText('Aller simple')
  await expect(oneWay).toContainText('en aller-retour')
  await page.getByRole('checkbox', { name: 'National', exact: true }).check()
  await expect(page.getByRole('button', { name: 'Filtres, 2 actifs' })).toBeVisible()
  await expect(page).toHaveURL(/shape=linear/)
  await expect(page).toHaveURL(/scope=national/)

  // The local route is hidden by the scope: nothing left, and the filters can be reset from the list.
  await page.keyboard.press('Escape')
  await expect(results).toHaveCount(0)
  await expect(page.getByText('Aucun parcours ne correspond aux filtres.')).toBeVisible()

  // Found again in the history or shared: same filters, same view.
  await page.reload()
  await expect(page.getByText('Aucun parcours ne correspond aux filtres.')).toBeVisible()
  await expect(page).toHaveURL(/at=48\.41,2\.65,12/)
  await page.getByRole('button', { name: 'Réinitialiser' }).click()
  await expect(results.getByRole('listitem')).toHaveCount(4)
  await expect(page).not.toHaveURL(/shape=/)
})

// The fake elevations make gentle slopes: no Fontainebleau route climbs 2,000 m.
test('filters the marked routes on their elevation gain, keeping those whose gain is unknown', async ({ page }) => {
  const fontainebleau = readFileSync('test/fixtures/overpass-fontainebleau.json', 'utf8')
  await page.route('**/api/interpreter', route => route.fulfill({ contentType: 'application/json', body: fontainebleau }))

  await page.goto('/discover?at=48.41,2.65,12&dplus=2000-')
  const results = page.getByRole('list', { name: 'Parcours balisés trouvés' })
  await expect(page.getByRole('button', { name: 'Filtres, 1 actif' })).toBeVisible()
  // Once the gains are known, only the route that can't have one is left.
  await expect(results.getByRole('listitem')).toHaveCount(1)
  await expect(results.getByRole('button', { name: /^Sentier Denecourt-Colinet 15\b/ })).toContainText('D+ inconnu')

  await page.getByRole('button', { name: 'Filtres, 1 actif' }).click()
  await expect(page.getByText('Plus de 2000 m D+')).toBeVisible()
  await expect(page.getByText('Les parcours dont le dénivelé n\'est pas encore calculé restent affichés.')).toBeVisible()

  // The gains are kept for the family: coming back computes nothing again.
  const computations: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/osm/elevations') computations.push(request.url())
  })
  await page.reload()
  await expect(results.getByRole('listitem')).toHaveCount(1)
  await expect(results).toContainText('D+ inconnu')
  expect(computations).toEqual([])
})
