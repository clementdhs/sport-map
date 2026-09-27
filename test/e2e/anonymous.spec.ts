import { expect, SEEDED_LOOP_NAME, SEEDED_ROUTE_NAME, test, waitForMap } from './fixtures'

test('finds a public route on the home map and opens it', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)

  const card = page.getByRole('link', { name: new RegExp(SEEDED_ROUTE_NAME) })
  await expect(card).toBeVisible()
  await card.click()

  await expect(page).toHaveURL(/\/routes\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: SEEDED_ROUTE_NAME })).toBeVisible()
  await expect(page.getByText('Durée estimée')).toBeVisible()
  // Visitors can't edit or delete.
  await expect(page.getByRole('link', { name: 'Modifier le parcours' })).toHaveCount(0)
})

test('filters the search by sport', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)
  await expect(page.getByRole('link', { name: new RegExp(SEEDED_ROUTE_NAME) })).toBeVisible()

  await page.getByRole('combobox', { name: 'Sport' }).click()
  await page.getByRole('option', { name: 'Randonnée' }).click()

  await expect(page.getByText('Aucun parcours dans cette zone')).toBeVisible()
})

test('keeps only loops and sorts the results', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)
  const cards = page.locator('aside li a')
  await expect(cards).toHaveCount(2)

  await page.getByRole('combobox', { name: 'Trier par' }).click()
  await page.getByRole('option', { name: 'Plus longs' }).click()
  await expect(cards.first()).toContainText(SEEDED_LOOP_NAME)
  await expect(cards.first()).toContainText('boucle')

  await page.getByRole('combobox', { name: 'Trier par' }).click()
  await page.getByRole('option', { name: 'Plus courts' }).click()
  await expect(cards.first()).toContainText(SEEDED_ROUTE_NAME)

  await page.getByRole('switch', { name: /Boucles uniquement/ }).click()
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText(SEEDED_LOOP_NAME)
})

test('finds routes passing through the view, pinned where they cross it', async ({ page, request }) => {
  // Around the end of the seeded point-to-point route, far from its start.
  const view = 'minLng=6.15&minLat=45.84&maxLng=6.17&maxLat=45.86'
  expect(await (await request.get(`/api/routes?${view}`)).json()).toEqual([])
  const passing = await (await request.get(`/api/routes?${view}&through=true`)).json() as { name: string, marker: number[] }[]
  expect(passing.map(route => route.name)).toEqual([SEEDED_ROUTE_NAME])
  expect(passing[0]!.marker[0]).toBeCloseTo(6.16, 3)
  expect(passing[0]!.marker[1]).toBeCloseTo(45.85, 3)

  // The switch sends the option.
  await page.goto('/')
  await waitForMap(page)
  const searched = page.waitForRequest(req => req.url().includes('/api/routes?') && req.url().includes('through=true'))
  await page.getByRole('switch', { name: /Passant par la zone/ }).click()
  await searched
  await expect(page.locator('aside li a')).toHaveCount(2)
})

test('exports a public route as GPX', async ({ request }) => {
  const response = await request.get(`/api/routes/${process.env.E2E_ROUTE_ID}/gpx`)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/gpx+xml')
  expect(response.headers()['content-disposition']).toContain('traversee-e2e-du-lac.gpx')
  const gpx = await response.text()
  expect(gpx).toContain('<trkpt lat="45.899" lon="6.129"><ele>450</ele></trkpt>')
})

test('gives a public route a link preview image', async ({ page, request }) => {
  await page.goto(`/routes/${process.env.E2E_ROUTE_ID}`)
  const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content')
  expect(ogImage).toMatch(new RegExp(`^https?://[^/]+/api/routes/${process.env.E2E_ROUTE_ID}/og\\.png\\?v=\\d+$`))
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')

  const response = await request.get(new URL(ogImage!).pathname)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('image/png')
  expect(response.headers()['cache-control']).toContain('public')
  // PNG signature
  expect((await response.body()).subarray(1, 4).toString()).toBe('PNG')
})

test('serves every icon of the PWA manifest', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json() as { icons: { src: string, sizes: string, purpose?: string }[] }
  expect(manifest.icons.map(icon => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']))
  expect(manifest.icons.some(icon => icon.purpose === 'maskable')).toBe(true)
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src)
    expect(response.status(), icon.src).toBe(200)
    expect(response.headers()['content-type'], icon.src).toBe('image/png')
  }
  expect((await request.get('/apple-touch-icon-180x180.png')).status()).toBe(200)
})

test('sends visitors to the login page before creating a route', async ({ page }) => {
  await page.goto('/routes/create')
  await expect(page).toHaveURL(/\/login\?redirect=\/routes\/create$/)
})

test('shows a 404 page for an unknown route', async ({ page }) => {
  const response = await page.goto('/routes/00000000-0000-0000-0000-000000000000')
  expect(response?.status()).toBe(404)
  await expect(page.getByText('Parcours introuvable').first()).toBeVisible()
})
