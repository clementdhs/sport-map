import { expect, test, waitForMap } from '../fixtures'

// The seeded routes, seen by a family member who doesn't own them.
test.use({ role: 'family' })

test('shows the weather at the start of a route, crediting Open-Meteo', async ({ page }) => {
  await page.goto(`/routes/${process.env.E2E_ROUTE_ID}`)
  const weather = page.getByRole('region', { name: 'Météo au départ' })
  // From the fake Open-Meteo of the global setup: rain on the second afternoon, at the start's elevation.
  const rainyAfternoon = weather.getByRole('row').filter({ hasText: 'Demain' }).filter({ hasText: 'Après-midi' })
  await expect(rainyAfternoon).toContainText('6 mm (90 %)')
  await expect(weather).toContainText('à 450 m')
  await expect(weather.getByRole('link', { name: 'Open-Meteo.com' })).toHaveAttribute('href', 'https://open-meteo.com/')
})

test('summarises the slopes and the ways of a route and colours the track on demand', async ({ page }) => {
  // MapLibre only logs an invalid line-gradient: the track then keeps its plain colour.
  const mapErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('line-gradient')) mapErrors.push(message.text())
  })
  await page.goto(`/routes/${process.env.E2E_ROUTE_ID}`)
  await waitForMap(page)
  await expect(page.getByText(/Pente max : \d+ %/)).toBeVisible()
  // A street then a dirt path graded T2, on the hiking scale since the route is a running one.
  await expect(page.getByRole('region', { name: 'Type de surface' })).toContainText(/Goudron\s+\d+\s%/)
  await expect(page.getByRole('region', { name: 'Type de surface' })).toContainText(/Sentier\s+\d+\s%/)
  await expect(page.getByRole('region', { name: /Difficulté des sentiers/ })).toContainText('T2 randonnée en montagne')
  // The weather comes before the details of the ways (#103).
  await expect(page.getByRole('region', { name: 'Météo au départ' })).toBeVisible()
  const weatherBox = await page.getByRole('region', { name: 'Météo au départ' }).boundingBox()
  const surfaceBox = await page.getByRole('region', { name: 'Type de surface' }).boundingBox()
  expect(weatherBox!.y).toBeLessThan(surfaceBox!.y)

  // The colouring is picked in the map's "Calques" panel, with its legend.
  const legend = page.getByRole('list', { name: 'Légende des couleurs du tracé' })
  await page.getByRole('button', { name: 'Calques' }).click()
  const colouring = page.getByRole('group', { name: 'Couleurs du tracé' })
  await expect(colouring.getByRole('radio', { name: 'Aucune' })).toBeChecked()
  await expect(legend).toHaveCount(0)
  await colouring.getByText('Pente', { exact: true }).click()
  await expect(colouring.getByRole('radio', { name: 'Pente' })).toBeChecked()
  await expect(legend).toContainText('Plus de 15 %')
  // It stays open while the map is moved.
  await page.locator('.maplibregl-canvas').click({ position: { x: 20, y: 300 } })
  await colouring.getByText('Surface', { exact: true }).click()
  await expect(legend).toContainText('Goudron')
  await expect(legend).not.toContainText('Plus de 15 %')
  await colouring.getByText('Difficulté', { exact: true }).click()
  await expect(colouring.getByRole('radio', { name: 'Difficulté' })).toBeChecked()
  await expect(legend).toContainText('T2 randonnée en montagne')
  // The seeded route stays under 5 %: one slope class, whose gradient has no stop (#63).
  expect(mapErrors).toEqual([])
})

test('shows nothing about the ways of a route drawn without them', async ({ page }) => {
  await page.goto(`/routes/${process.env.E2E_LOOP_ID}`)
  await waitForMap(page)
  await page.getByRole('button', { name: 'Calques' }).click()
  await expect(page.getByRole('radio', { name: 'Pente' })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Surface' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Type de surface' })).toHaveCount(0)
})

test('exports a route as GPX', async ({ request }) => {
  const response = await request.get(`/api/routes/${process.env.E2E_ROUTE_ID}/gpx`)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/gpx+xml')
  expect(response.headers()['content-disposition']).toContain('traversee-e2e-du-lac.gpx')
  const gpx = await response.text()
  expect(gpx).toContain('<trkpt lat="45.899" lon="6.129"><ele>450</ele></trkpt>')
})

test('gives a route visible to the family a link preview image', async ({ page, request }) => {
  await page.goto(`/routes/${process.env.E2E_ROUTE_ID}`)
  const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content')
  expect(ogImage).toMatch(new RegExp(`^https?://[^/]+/api/routes/${process.env.E2E_ROUTE_ID}/og\\.png\\?v=\\d+&lang=fr$`))
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')

  const response = await request.get(new URL(ogImage!).pathname)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('image/png')
  expect(response.headers()['cache-control']).toContain('public')
  // PNG signature
  expect((await response.body()).subarray(1, 4).toString()).toBe('PNG')
})

test('shows a 404 page for an unknown route', async ({ page }) => {
  const response = await page.goto('/routes/00000000-0000-0000-0000-000000000000')
  expect(response?.status()).toBe(404)
  await expect(page.getByText('Parcours introuvable').first()).toBeVisible()
})
