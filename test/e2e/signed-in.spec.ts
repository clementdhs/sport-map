import { insertRows, supabaseAdmin } from './admin'
import { expect, SEEDED_REVIEW, test, waitForMap } from './fixtures'

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

// Visitors: without it, request contexts reuse the signed-in session of the project.
const NO_SESSION = { cookies: [], origins: [] }

// A 1×1 PNG: the page converts it to WebP (or JPEG) before uploading it.
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

// Files left in the local storage bucket for a route (admin API: the secret key bypasses the policies).
function storedPhotoFiles(routeId: string): Promise<{ name: string }[]> {
  return supabaseAdmin('/storage/v1/object/list/route-photos', {
    method: 'POST',
    body: JSON.stringify({ prefix: `${routeId}/` }),
  })
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
  const [file] = await storedPhotoFiles(id)

  // Visitors see the photos of a public route.
  const visitor = await playwright.request.newContext({ baseURL: new URL(page.url()).origin, storageState: NO_SESSION })
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

test('reviews the route of someone else, and reports an abusive comment', async ({ page }) => {
  const [author, reporter, otherReporter] = process.env.E2E_NEIGHBOR_IDS!.split(',')
  // A neighbor's route (far from the seeded ones, not to disturb the search tests), already reviewed by another.
  const [route] = await insertRows<{ id: string }>('routes', [{
    owner_id: author,
    name: 'Belvédère e2e du voisin',
    sport_type: 'hiking',
    is_public: true,
    geom: 'SRID=4326;LINESTRING(170 -45,170.1 -45.1)',
  }])
  const [abusive] = await insertRows<{ id: string }>('route_reviews', [
    { route_id: route!.id, user_id: reporter, rating: 2, comment: 'Commentaire insultant e2e' },
  ])
  await page.goto(`/routes/${route!.id}`)
  await waitForMap(page)
  const reviews = page.getByRole('region', { name: 'Avis', exact: true })
  await expect(reviews).toContainText('Commentaire insultant e2e')

  await reviews.getByRole('radio', { name: '4 étoiles' }).click()
  await reviews.getByLabel('Commentaire').fill('Belle vue au sommet')
  await reviews.getByRole('button', { name: 'Publier mon avis' }).click()
  await expect(reviews).toContainText('Belle vue au sommet')
  await expect(reviews).toContainText('3,0· 2 avis')

  await reviews.getByRole('button', { name: 'Modifier' }).click()
  await reviews.getByRole('radio', { name: '5 étoiles' }).click()
  await reviews.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(reviews).toContainText('3,5· 2 avis')

  page.once('dialog', dialog => dialog.accept())
  await reviews.getByRole('button', { name: 'Signaler' }).click()
  await expect(reviews.getByRole('button', { name: 'Signalé' })).toBeDisabled()

  // Two more reports: the comment is hidden automatically, its rating still counts.
  await insertRows('review_reports', [
    { review_id: abusive!.id, reporter_id: author },
    { review_id: abusive!.id, reporter_id: otherReporter },
  ])
  await page.reload()
  await expect(reviews).toContainText('Belle vue au sommet')
  await expect(reviews).not.toContainText('Commentaire insultant e2e')
  await expect(reviews).toContainText('3,5· 2 avis')

  page.once('dialog', dialog => dialog.accept())
  await reviews.getByRole('button', { name: 'Supprimer' }).click()
  await expect(reviews).not.toContainText('Belle vue au sommet')
  await expect(reviews).toContainText('2,0· 1 avis')
})

test('moderates the reviews of its own route', async ({ page, playwright }) => {
  const id = process.env.E2E_ROUTE_ID!
  await page.goto(`/routes/${id}`)
  await waitForMap(page)
  const reviews = page.getByRole('region', { name: 'Avis', exact: true })
  await expect(reviews).toContainText(SEEDED_REVIEW.comment)
  // No rating of one's own route.
  await expect(reviews.getByRole('button', { name: 'Publier mon avis' })).toHaveCount(0)

  const visitor = await playwright.request.newContext({ baseURL: new URL(page.url()).origin, storageState: NO_SESSION })
  const asVisitor = async () => (await visitor.get(`/api/routes/${id}/reviews`)).json() as Promise<{ rating_count: number, reviews: unknown[] }>

  await reviews.getByRole('button', { name: 'Masquer le commentaire' }).click()
  await expect(reviews).toContainText("Commentaire masqué par l'auteur du parcours")
  expect(await asVisitor()).toMatchObject({ rating_count: 1, reviews: [] })

  await reviews.getByRole('button', { name: 'Afficher le commentaire' }).click()
  await expect(reviews).not.toContainText('Commentaire masqué')
  expect((await asVisitor()).reviews).toHaveLength(1)
  await visitor.dispose()
})

test.describe('recording an outing', () => {
  const START = { latitude: 45.9, longitude: 6.12, accuracy: 5 }
  test.use({ permissions: ['geolocation'], geolocation: START })

  test('records an outing, survives a page reload, and saves it as a completed route', async ({ page, context }) => {
    // Fake clock: the recorder times fixes with Date.now().
    await page.clock.install({ time: new Date('2026-09-28T08:00:00Z') })
    page.on('dialog', dialog => dialog.accept()) // "leave the page?" prompts
    // `meters` north of the start, one fix per simulated minute.
    const walkTo = async (meters: number) => {
      await page.clock.runFor(60_000)
      await context.setGeolocation({ ...START, latitude: START.latitude + meters / 111_194.93 })
    }
    const distance = page.getByTestId('distance')

    await page.goto('/record')
    await waitForMap(page)
    await expect(page.getByText(/Précision GPS/)).toBeVisible()
    await page.getByRole('button', { name: 'Démarrer' }).click()
    await expect(page.getByText('Enregistrement', { exact: true })).toBeVisible()

    for (let i = 1; i <= 4; i++) {
      await walkTo(i * 100)
      await expect(distance).toHaveText(`${i}00 m`)
    }

    // Paused: moving doesn't count.
    await page.getByRole('button', { name: 'Pause' }).click()
    await walkTo(450)
    await expect(distance).toHaveText('400 m')
    await page.getByRole('button', { name: 'Reprendre' }).click()

    // The page closes by accident: the outing is kept on the phone.
    await page.reload()
    await waitForMap(page)
    await expect(page.getByText(/n'est pas terminée/)).toBeVisible()
    await page.getByRole('button', { name: 'Reprendre' }).click()
    await expect(distance).toHaveText('400 m')

    for (let i = 5; i <= 12; i++) await walkTo(i * 100)
    await expect(distance).toHaveText('1,20 km')

    await page.getByRole('button', { name: 'Terminer' }).click()
    const dialog = page.getByRole('dialog', { name: 'Terminer la sortie' })
    await expect(dialog.getByLabel('Nom')).toHaveValue('Sortie du 28 septembre 2026')
    await dialog.getByRole('button', { name: 'Enregistrer' }).click()

    await expect(page).toHaveURL(/\/routes\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { name: 'Sortie du 28 septembre 2026' })).toBeVisible()
    await expect(page.getByText('Enregistré au GPS')).toBeVisible()
    await expect(page.getByText('Privé', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Fait le/ })).toBeVisible()
    await expect(page.getByText(/Ta sortie : \d+ min, dont \d+ min en mouvement/)).toBeVisible()

    // Listed among the completed routes of the profile, with its times.
    await page.goto('/profile')
    await page.getByRole('tab', { name: /Réalisés/ }).click()
    await expect(page.getByText(/Fait le 28 septembre 2026 · \d+ min · [\d,]+ km\/h/)).toBeVisible()
  })
})
