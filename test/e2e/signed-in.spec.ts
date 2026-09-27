import { expect, test, waitForMap } from './fixtures'

test('draws, saves, then edits a route', async ({ page }) => {
  await page.goto('/routes/create')
  await waitForMap(page)

  // Three waypoints across the map; routing is mocked by the fixtures.
  const map = page.locator('.maplibregl-canvas')
  const box = (await map.boundingBox())!
  for (const [x, y] of [[0.3, 0.4], [0.5, 0.6], [0.7, 0.4]] as const) {
    await map.click({ position: { x: box.width * x, y: box.height * y } })
  }

  await expect(page.getByText('Profil altimétrique')).toBeVisible()
  await expect(page.getByText('0 m', { exact: true })).toHaveCount(0)

  // A point of interest, placed by clicking near the first segment.
  await page.getByRole('button', { name: 'Ajouter' }).click()
  await map.click({ position: { x: box.width * 0.4, y: box.height * 0.5 } })
  await page.getByRole('textbox', { name: "Note du point d'intérêt 1" }).fill('Fontaine')

  await page.getByLabel('Nom').fill('Parcours e2e')
  await page.getByRole('button', { name: 'Enregistrer le parcours' }).click()

  await expect(page).toHaveURL(/\/routes\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: 'Parcours e2e' })).toBeVisible()
  const pois = page.getByRole('region', { name: "Points d'intérêt" })
  await expect(pois).toContainText("Point d'eau")
  await expect(pois).toContainText('Fontaine')
  await expect(page.locator('[data-poi-marker]')).toHaveCount(1)

  // Editing reopens the same route, and saving updates it in place.
  const detailUrl = page.url()
  const ogImageUrl = `${detailUrl.replace('/routes/', '/api/routes/')}/og.png`
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', new RegExp(`^${ogImageUrl}\\?v=\\d+$`))
  await page.getByRole('link', { name: 'Modifier le parcours' }).click()
  await waitForMap(page)
  await expect(page.getByLabel('Nom')).toHaveValue('Parcours e2e')
  await page.getByRole('switch', { name: 'Parcours public' }).click()
  await page.getByRole('button', { name: 'Enregistrer les modifications' }).click()

  await expect(page).toHaveURL(detailUrl)
  await expect(page.getByText('Privé', { exact: true })).toBeVisible()

  // A private route has no link preview image, not even for its owner (it could end up in a public cache).
  await page.reload()
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(0)
  expect((await page.request.get(ogImageUrl)).status()).toBe(404)

  // The private route stays listed on its owner's profile.
  await page.goto('/profile')
  await expect(page.getByRole('link', { name: /Parcours e2e/ })).toBeVisible()
})

// A 1×1 PNG: the page converts it to WebP (or JPEG) before uploading it.
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

// Files left in the local storage bucket for a route (admin API: the secret key bypasses the policies).
async function storedPhotoFiles(routeId: string): Promise<unknown[]> {
  const key = process.env.E2E_SUPABASE_SECRET_KEY!
  const response = await fetch(`${process.env.E2E_SUPABASE_URL}/storage/v1/object/list/route-photos`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: `${routeId}/` }),
  })
  expect(response.ok).toBe(true)
  return response.json()
}

// Whether a visitor (publishable key only) can get a signed URL for a file, straight from the storage API.
async function visitorCanSign(path: string): Promise<boolean> {
  const response = await fetch(`${process.env.E2E_SUPABASE_URL}/storage/v1/object/sign/route-photos/${path}`, {
    method: 'POST',
    headers: { apikey: process.env.E2E_SUPABASE_PUBLIC_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 60 }),
  })
  return response.ok
}

test('adds, shows and deletes photos, and removes their files with the route', async ({ page, playwright }) => {
  const route = { name: 'Parcours photos e2e', sport_type: 'hiking', is_public: true, coordinates: [[6.1, 45.9], [6.2, 45.95]] }
  const { id } = await (await page.request.post('/api/routes', { data: route })).json() as { id: string }
  await page.goto(`/routes/${id}`)
  await waitForMap(page)

  // The button reflects the change right away (it used to need a reload).
  await page.getByRole('button', { name: 'Sauvegarder' }).click()
  await expect(page.getByRole('button', { name: 'Sauvegardé' })).toBeVisible()

  const upload = () => page.getByLabel('Choisir des photos').setInputFiles({ name: 'sommet.png', mimeType: 'image/png', buffer: PNG_1PX })
  const photos = page.getByRole('region', { name: 'Photos' }).locator('img')
  await upload()
  await expect(photos).toHaveCount(1)
  // Served by the private bucket through a signed URL.
  await expect.poll(() => photos.first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
  const [file] = await storedPhotoFiles(id) as { name: string }[]

  // Visitors see the photos of a public route.
  const visitor = await playwright.request.newContext({ baseURL: new URL(page.url()).origin })
  const asVisitor = await (await visitor.get(`/api/routes/${id}`)).json() as { photos: unknown[] }
  expect(asVisitor.photos).toHaveLength(1)
  await visitor.dispose()
  expect(await visitorCanSign(`${id}/${file!.name}`)).toBe(true)

  // Once the route is private, its files are out of their reach, even through the storage API.
  expect((await page.request.put(`/api/routes/${id}`, { data: { ...route, is_public: false } })).ok()).toBe(true)
  expect(await visitorCanSign(`${id}/${file!.name}`)).toBe(false)
  await page.reload()
  await waitForMap(page)

  await page.getByRole('button', { name: 'Agrandir la photo 1' }).click()
  await expect(page.getByRole('dialog', { name: 'Photo 1 sur 1' })).toBeVisible()
  await page.keyboard.press('Escape')

  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Supprimer la photo 1' }).click()
  await expect(photos).toHaveCount(0)
  expect(await storedPhotoFiles(id)).toHaveLength(0)

  // Deleting the route also deletes the files of its photos.
  await upload()
  await expect(photos).toHaveCount(1)
  await page.getByRole('button', { name: 'Supprimer le parcours' }).click()
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
  await expect(page).toHaveURL(/\/profile$/)
  expect(await storedPhotoFiles(id)).toHaveLength(0)
})
