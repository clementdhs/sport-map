import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import type { LiveShareDetail, LiveShareStarted, LiveShareSummary } from '../../shared/types/live'
import { insertRows, supabaseAdmin } from './admin'
import { E2E_USER, EMPTY_MAP_STYLE, expect, familyRequest, routeAction, SEEDED_REVIEW, SEEDED_ROUTE_NAME, signedOutRequest, test, waitForHydration, waitForMap } from './fixtures'

test('draws, saves, then edits a route', async ({ page }) => {
  await page.goto('/routes/create')
  await waitForMap(page)

  // The sport chosen first decides how segments are routed.
  await page.getByRole('combobox', { name: 'Sport' }).click()
  await page.getByRole('option', { name: 'VTT' }).click()
  await expect(page.getByText('Itinéraire adapté : VTT')).toBeVisible()
  const routing = page.waitForRequest('**/api/routing/segment')

  // Three waypoints across the map; routing is mocked by the fixtures.
  const map = page.locator('.maplibregl-canvas')
  const box = (await map.boundingBox())!
  for (const [x, y] of [[0.3, 0.4], [0.5, 0.6], [0.7, 0.4]] as const) {
    await map.click({ position: { x: box.width * x, y: box.height * y } })
  }
  expect((await routing).postDataJSON()).toMatchObject({ mode: 'snap', sport_type: 'mountain_biking' })

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
  await expect(page.getByText('VTT', { exact: true })).toBeVisible()
  // The ways of the snapped segments, the difficulty on the mountain bike scale.
  await expect(page.getByRole('region', { name: 'Type de surface' })).toContainText(/Goudron\s+50\s%/)
  await expect(page.getByRole('region', { name: 'Type de surface' })).toContainText(/Chemin\s+50\s%/)
  await expect(page.getByRole('region', { name: 'Difficulté VTT (échelle S0 à S6)' })).toContainText('S2 obstacles, marches')
  const pois = page.getByRole('region', { name: "Points d'intérêt" })
  await expect(pois).toContainText("Point d'eau")
  await expect(pois).toContainText('Fontaine')
  await expect(page.locator('[data-poi-marker]')).toHaveCount(1)

  // Editing reopens the same route, and saving updates it in place.
  const detailUrl = page.url()
  const ogImageUrl = `${detailUrl.replace('/routes/', '/api/routes/')}/og.png`
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', new RegExp(`^${ogImageUrl}\\?v=\\d+&lang=fr$`))
  await routeAction(page, 'Modifier le parcours')
  await waitForMap(page)
  await expect(page.getByLabel('Nom')).toHaveValue('Parcours e2e')
  await page.getByRole('switch', { name: 'Visible par la famille' }).click()
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
function storedPhotoFiles(routeId: string): Promise<{ name: string }[]> {
  return supabaseAdmin('/storage/v1/object/list/route-photos', {
    method: 'POST',
    body: JSON.stringify({ prefix: `${routeId}/` }),
  })
}

// Whether a signed-out visitor (publishable key only) can get a signed URL for a file, straight from the storage API.
async function visitorCanSign(path: string): Promise<boolean> {
  const response = await fetch(`${process.env.E2E_SUPABASE_URL}/storage/v1/object/sign/route-photos/${path}`, {
    method: 'POST',
    headers: { apikey: process.env.E2E_SUPABASE_PUBLIC_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 60 }),
  })
  return response.ok
}

test('moves the editor map to a searched place without touching the track', async ({ page }) => {
  await page.route('https://api.maptiler.com/geocoding/**', route => route.fulfill({
    json: { features: [{ place_name: 'Annecy, Haute-Savoie, France', center: [6.129, 45.899], bbox: [6.10, 45.88, 6.16, 45.93] }] },
  }))
  await page.goto('/routes/create')
  await waitForMap(page)

  const map = page.locator('.maplibregl-canvas')
  const box = (await map.boundingBox())!
  for (const [x, y] of [[0.3, 0.4], [0.5, 0.6]] as const) {
    await map.click({ position: { x: box.width * x, y: box.height * y } })
  }
  const distance = page.locator('p.text-3xl')
  await expect(distance).not.toHaveText('0 m')
  const drawn = await distance.textContent()

  const searchBox = page.getByRole('combobox', { name: 'Rechercher un lieu' })
  await searchBox.fill('Annecy')
  // Places only: no route name search in the editor.
  await expect(page.getByRole('option', { name: 'Annecy, Haute-Savoie, France' })).toBeVisible()
  await expect(page.getByRole('option', { name: /Parcours contenant/ })).toHaveCount(0)
  await page.getByRole('option', { name: 'Annecy, Haute-Savoie, France' }).click()

  await expect.poll(async () => {
    const [lng, lat] = (await page.locator('[data-map-center]').getAttribute('data-map-center'))!.split(',').map(Number)
    return Math.abs(lng! - 6.13) < 0.05 && Math.abs(lat! - 45.905) < 0.05
  }, { timeout: 10_000 }).toBe(true)
  await expect(distance).toHaveText(drawn!)
})

test('adds, shows and deletes photos, and removes their files with the route', async ({ page, playwright }) => {
  const route = { name: 'Parcours photos e2e', sport_type: 'hiking', is_public: true, coordinates: [[6.1, 45.9], [6.2, 45.95]] }
  const { id } = await (await page.request.post('/api/routes', { data: route })).json() as { id: string }
  await page.goto(`/routes/${id}`)
  await waitForMap(page)

  // The button reflects the change right away (it used to need a reload).
  await page.getByRole('button', { name: 'Sauvegarder' }).click()
  await expect(page.getByRole('button', { name: 'Sauvegardé' })).toBeVisible()

  await page.getByRole('tab', { name: /Photos/ }).click()
  const upload = () => page.getByLabel('Choisir des photos').setInputFiles({ name: 'sommet.png', mimeType: 'image/png', buffer: PNG_1PX })
  const photos = page.getByRole('region', { name: 'Photos' }).locator('img')
  await upload()
  await expect(photos).toHaveCount(1)
  // Served by the private bucket through a signed URL.
  await expect.poll(() => photos.first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
  const [file] = await storedPhotoFiles(id)

  // Other members see the photos of a route visible to the family. Signed-out visitors can't reach the files,
  // even through the storage API.
  const member = await familyRequest(playwright, new URL(page.url()).origin)
  const asMember = await (await member.get(`/api/routes/${id}`)).json() as { photos: unknown[] }
  expect(asMember.photos).toHaveLength(1)
  expect(await visitorCanSign(`${id}/${file!.name}`)).toBe(false)

  // Once the route is private, other members don't see it any more.
  expect((await page.request.put(`/api/routes/${id}`, { data: { ...route, is_public: false } })).ok()).toBe(true)
  expect((await member.get(`/api/routes/${id}`)).status()).toBe(404)
  await member.dispose()
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
  await routeAction(page, 'Supprimer le parcours')
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
  await page.getByRole('tab', { name: /Avis/ }).click()
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
  await page.getByRole('tab', { name: /Avis/ }).click()
  const reviews = page.getByRole('region', { name: 'Avis', exact: true })
  await expect(reviews).toContainText(SEEDED_REVIEW.comment)
  // No rating of one's own route.
  await expect(reviews.getByRole('button', { name: 'Publier mon avis' })).toHaveCount(0)

  const member = await familyRequest(playwright, new URL(page.url()).origin)
  const asMember = async () => (await member.get(`/api/routes/${id}/reviews`)).json() as Promise<{ rating_count: number, reviews: unknown[] }>

  await reviews.getByRole('button', { name: 'Masquer le commentaire' }).click()
  await expect(reviews).toContainText("Commentaire masqué par l'auteur du parcours")
  expect(await asMember()).toMatchObject({ rating_count: 1, reviews: [] })

  await reviews.getByRole('button', { name: 'Afficher le commentaire' }).click()
  await expect(reviews).not.toContainText('Commentaire masqué')
  expect((await asMember()).reviews).toHaveLength(1)
  await member.dispose()
})

test.describe('recording an outing', () => {
  const START = { latitude: 45.9, longitude: 6.12, accuracy: 5 }
  test.use({ permissions: ['geolocation'], geolocation: START })

  test('records an outing, survives a page reload, and saves it as a completed route', async ({ page, context }) => {
    // Many steps and two map loads: more than the default 30 s on the CI runners.
    test.slow()
    // Fake clock: the recorder times fixes with Date.now().
    await page.clock.install({ time: new Date('2026-09-28T08:00:00Z') })
    page.on('dialog', dialog => dialog.accept()) // "leave the page?" prompts
    // `meters` north of the start, one fix per simulated minute.
    const walkTo = async (meters: number) => {
      // Jumps a minute ahead (runFor would also replay every stopwatch tick in between, slowly).
      await page.clock.fastForward(60_000)
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
    // Its first outing.
    await page.getByRole('tab', { name: /Passages/ }).click()
    await expect(page.getByTestId('outing')).toHaveCount(1)

    // Listed among the completed routes of the profile, with its times.
    await page.goto('/profile')
    await waitForHydration(page)
    await page.getByRole('tab', { name: /Réalisés/ }).click()
    await expect(page.getByText(/Fait le 28 septembre 2026 · \d+ min · [\d,]+ km\/h/)).toBeVisible()
  })
})

test.describe('offline follow mode', () => {
  // The other tests block the service worker, which would hide requests from page.route().
  test.use({ serviceWorkers: 'allow' })

  test('prepares a route, follows it without network, then removes it from the phone', async ({ page, context }) => {
    // The map style, for requests the service worker makes too (page.route doesn't see those).
    await context.route('https://api.maptiler.com/maps/**', route => route.fulfill({ json: EMPTY_MAP_STYLE }))
    const id = process.env.E2E_ROUTE_ID!
    await page.goto(`/routes/${id}`)
    // Pages load under the service worker once it is active.
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.reload()
    await waitForMap(page)

    await routeAction(page, 'Préparer pour le hors-ligne')
    await expect(page.getByText('Disponible hors-ligne', { exact: true })).toBeVisible()
    // The startup cleanup (5 s after loading) must keep a route prepared in the meantime.
    await page.waitForTimeout(6000)

    await context.setOffline(true)
    await page.goto(`/routes/${id}/follow`)
    await waitForMap(page)
    await expect(page.getByText('Parcouru')).toBeVisible()
    await expect(page.getByTestId('remaining')).toHaveText('6,05 km')
    await context.setOffline(false)

    await page.goto(`/routes/${id}`)
    await page.getByRole('button', { name: 'Supprimer du téléphone' }).click()
    await page.getByRole('button', { name: "Plus d'actions" }).click()
    await expect(page.getByRole('menuitem', { name: 'Préparer pour le hors-ligne' })).toBeVisible()
    expect(await page.evaluate(async () => (await caches.keys()).filter(n => n.startsWith('sport-map-offline-')))).toEqual([])
  })
})

test('groups routes in a collection visible to the family, which only shows them its routes visible to the family', async ({ page, playwright }) => {
  // A retry finds the collection of the failed attempt: each attempt makes its own.
  const name = `Week-end e2e ${test.info().retry + 1}`
  const { id: privateId } = await (await page.request.post('/api/routes', {
    data: { name: 'Parcours privé collection e2e', sport_type: 'hiking', is_public: false, coordinates: [[6.3, 45.8], [6.35, 45.82]] },
  })).json() as { id: string }

  // Created from the page of the seeded (visible to the family) route, which it then holds.
  await page.goto(`/routes/${process.env.E2E_ROUTE_ID}`)
  await routeAction(page, 'Ajouter à une collection')
  const dialog = page.getByRole('dialog', { name: 'Ajouter à une collection' })
  await dialog.getByRole('button', { name: 'Nouvelle collection' }).click()
  await dialog.getByLabel('Nom').fill(name)
  await dialog.getByRole('switch', { name: 'Visible par la famille' }).click()
  await dialog.getByRole('button', { name: 'Créer et ajouter' }).click()
  await expect(dialog.getByRole('checkbox', { name })).toBeChecked()
  await page.keyboard.press('Escape')

  // Added from the private route's page.
  await page.goto(`/routes/${privateId}`)
  await routeAction(page, 'Ajouter à une collection')
  const checkbox = page.getByRole('dialog').getByRole('checkbox', { name })
  await expect(checkbox).not.toBeChecked()
  await checkbox.click()
  await expect(checkbox).toBeChecked()
  await page.keyboard.press('Escape')

  await page.goto('/profile')
  await waitForHydration(page)
  await page.getByRole('tab', { name: /Collections/ }).click()
  await page.getByRole('link', { name: new RegExp(name) }).click()
  await expect(page).toHaveURL(/\/collections\/[0-9a-f-]{36}$/)
  await waitForMap(page)
  const routes = page.getByRole('list', { name: 'Parcours de la collection' })
  await expect(routes.getByRole('listitem')).toHaveCount(2)
  await expect(page.getByText('Visible par la famille', { exact: true })).toBeVisible()
  await expect(routes.getByRole('listitem').first()).toContainText(`par ${E2E_USER.displayName}`)

  // Another member sees the collection, without the private route.
  const collectionApi = page.url().replace('/collections/', '/api/collections/')
  const member = await familyRequest(playwright, new URL(page.url()).origin)
  const asMember = async () => (await member.get(collectionApi)).json() as Promise<{ is_mine: boolean, routes: { name: string }[] }>
  expect(await asMember()).toMatchObject({ is_mine: false, routes: [{ name: SEEDED_ROUTE_NAME }] })

  // Deleting a route takes it out of the collection.
  expect((await page.request.delete(`/api/routes/${privateId}`)).ok()).toBe(true)
  await page.reload()
  await waitForMap(page)
  await expect(routes.getByRole('listitem')).toHaveCount(1)

  // Removing the last route, then deleting the collection, keeps the route.
  await page.getByRole('button', { name: `Retirer ${SEEDED_ROUTE_NAME} de la collection` }).click()
  await expect(page.getByText('Collection vide')).toBeVisible()
  await page.getByRole('button', { name: 'Supprimer la collection' }).click()
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
  await expect(page).toHaveURL(/\/profile$/)
  expect((await member.get(collectionApi)).status()).toBe(404)
  expect((await member.get(`/api/routes/${process.env.E2E_ROUTE_ID}`)).ok()).toBe(true)
  await member.dispose()
})

// Only its first bytes matter: the server checks the type from them.
const JPEG_BYTES = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0xFF, 0xD9])

test('exports the data of a throwaway account, then deletes it without leaving anything behind', async ({ page, context }) => {
  const suffix = Date.now().toString(36)
  const account = { email: `jetable-${suffix}@sport-map.test`, username: `jetable_${suffix}`, password: `jetable-${suffix}-local` }
  const { id: userId } = await supabaseAdmin<{ id: string }>('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email: account.email, password: account.password, email_confirm: true, user_metadata: { username: account.username } }),
  })
  const [neighbor] = process.env.E2E_NEIGHBOR_IDS!.split(',')
  const [neighborRoute] = await insertRows<{ id: string }>('routes', [{
    owner_id: neighbor, name: 'Parcours e2e du voisin, noté puis oublié', sport_type: 'running', is_public: true,
    geom: 'SRID=4326;LINESTRING(171 -45,171.1 -45.1)',
  }])
  const ratingCount = async () =>
    (await supabaseAdmin<{ rating_count: number }[]>(`/rest/v1/routes?id=eq.${neighborRoute!.id}&select=rating_count`))[0]!.rating_count

  // Signed in as the throwaway account rather than the test account.
  await context.clearCookies()
  await page.goto('/login')
  await waitForHydration(page)
  await page.locator('input[name="email"]').fill(account.email)
  await page.locator('input[name="password"]').fill(account.password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('button', { name: 'Mon compte' })).toBeVisible()

  // A private route with a photo, a review and an outing on the neighbor's route, a collection.
  const { id: routeId } = await (await page.request.post('/api/routes', {
    data: { name: 'Parcours RGPD e2e', sport_type: 'hiking', is_public: false, coordinates: [[6.1, 45.9], [6.2, 45.95]] },
  })).json() as { id: string }
  expect((await page.request.post(`/api/routes/${routeId}/photos`, {
    multipart: { photo: { name: 'sommet.jpg', mimeType: 'image/jpeg', buffer: JPEG_BYTES } },
  })).ok()).toBe(true)
  expect((await page.request.put(`/api/routes/${neighborRoute!.id}/reviews`, { data: { rating: 2, comment: 'Avis RGPD e2e' } })).ok()).toBe(true)
  expect((await page.request.put(`/api/routes/${neighborRoute!.id}/activity/completed`)).ok()).toBe(true)
  expect((await page.request.post('/api/collections', { data: { name: 'Collection RGPD e2e', is_public: false, route_id: routeId } })).ok()).toBe(true)
  expect(await ratingCount()).toBe(1)

  // The archive holds all of it.
  await page.goto('/settings')
  await waitForHydration(page)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Télécharger mes données' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(new RegExp(`^sport-map-${account.username}-\\d{4}-\\d{2}-\\d{2}\\.zip$`))
  const files = unzipSync(readFileSync((await download.path())!))
  const text = (path: string) => strFromU8(files[path]!)
  const base = `parcours-rgpd-e2e-${routeId.slice(0, 8)}`
  expect(Object.keys(files)).toEqual(expect.arrayContaining([
    'LISEZMOI.txt', 'profil.json', 'parcours.json', 'avis.json', 'activite.json', 'collections.json', 'signalements.json', `parcours/${base}.gpx`,
  ]))
  const photos = Object.keys(files).filter(path => path.startsWith(`photos/${base}/`))
  expect(photos).toHaveLength(1)
  expect([...files[photos[0]!]!.subarray(0, 3)]).toEqual([0xFF, 0xD8, 0xFF])
  expect(JSON.parse(text('profil.json'))).toMatchObject({ username: account.username, email: account.email })
  expect(text(`parcours/${base}.gpx`)).toContain('<name>Parcours RGPD e2e</name>')
  expect(text('avis.json')).toContain('Avis RGPD e2e')
  expect(JSON.parse(text('activite.json'))).toMatchObject([{ route_id: neighborRoute!.id, activity_type: 'completed' }])
  expect(text('collections.json')).toContain('Collection RGPD e2e')

  // Deleting asks for the username, typed again.
  await page.getByRole('button', { name: 'Supprimer mon compte' }).click()
  const dialog = page.getByRole('dialog', { name: 'Supprimer mon compte ?' })
  const confirm = dialog.getByRole('button', { name: 'Supprimer définitivement' })
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel(/Pour confirmer/).fill('quelqu_un_d_autre')
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel(/Pour confirmer/).fill(account.username)
  await confirm.click()
  // Signed out, hence on the sign-in page.
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('link', { name: 'Connexion' })).toBeVisible()

  // Nothing left: rows, photo files, auth user; the neighbor's route no longer counts the rating.
  for (const [table, filter] of [
    ['profiles', `id=eq.${userId}`],
    ['routes', `owner_id=eq.${userId}`],
    ['route_photos', `route_id=eq.${routeId}`],
    ['route_reviews', `user_id=eq.${userId}`],
    ['review_reports', `reporter_id=eq.${userId}`],
    ['route_activity', `user_id=eq.${userId}`],
    ['collections', `owner_id=eq.${userId}`],
  ]) {
    expect(await supabaseAdmin(`/rest/v1/${table}?${filter}&select=*`), table).toEqual([])
  }
  expect(await storedPhotoFiles(routeId)).toEqual([])
  expect(await ratingCount()).toBe(0)
  await expect(supabaseAdmin(`/auth/v1/admin/users/${userId}`)).rejects.toThrow(/404/)
})

test('edits the profile and the appearance from the settings, reached through the account menu', async ({ page }) => {
  await page.goto('/profile')
  // Signed-in users change the appearance in the settings, not from the header.
  await expect(page.getByRole('button', { name: 'Apparence' })).toHaveCount(0)
  await page.getByRole('button', { name: E2E_USER.email }).click()
  await page.getByRole('menuitem', { name: 'Paramètres' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByRole('heading', { name: 'Paramètres', level: 1 })).toBeVisible()

  // Global setup recreates the account for each run: no need to restore these. The display name stays the
  // seeded one, which other tests expect on route cards.
  await page.getByLabel('Nom affiché').fill(E2E_USER.displayName)
  await page.getByLabel('Bio').fill('Bio mise à jour depuis les paramètres')
  await page.getByRole('button', { name: 'Enregistrer le profil' }).click()
  await expect(page.getByText('Profil mis à jour').first()).toBeVisible()

  await page.getByRole('button', { name: 'Sombre' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Système' }).click()

  // The profile keeps the routes and statistics only, with a way back to the settings.
  await page.getByRole('link', { name: 'Mon profil' }).click()
  await expect(page.getByRole('heading', { name: E2E_USER.displayName, level: 1 })).toBeVisible()
  await expect(page.getByText('Bio mise à jour depuis les paramètres')).toBeVisible()
  await expect(page.getByRole('link', { name: new RegExp(SEEDED_ROUTE_NAME) })).toContainText(`par ${E2E_USER.displayName}`)
  await expect(page.getByRole('button', { name: 'Supprimer mon compte' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Paramètres' })).toHaveAttribute('href', '/settings')
})

// Map pages have no header: a floating bar (back, logo, account menu) and the main buttons over the map.
for (const device of [{ name: 'phone', width: 375, height: 812 }, { name: 'computer', width: 1280, height: 800 }]) {
  test(`reaches the account menu, creation, recording and back from the map pages, on a ${device.name}`, async ({ page }) => {
    await page.setViewportSize({ width: device.width, height: device.height })
    await page.goto('/')
    await waitForMap(page)
    await expect(page.getByRole('banner')).toHaveCount(0)
    // Nothing to go back to from the home page.
    await expect(page.getByRole('button', { name: 'Retour' })).toHaveCount(0)

    await page.getByRole('link', { name: 'Créer un parcours' }).click()
    await expect(page).toHaveURL(/\/routes\/create$/)
    await waitForMap(page)
    await page.getByRole('button', { name: 'Retour' }).click()
    await expect(page).toHaveURL(/\/$/)

    await page.getByRole('link', { name: 'Enregistrer une sortie' }).click()
    await expect(page).toHaveURL(/\/record$/)
    await page.getByRole('link', { name: 'Quitter' }).click()
    await expect(page).toHaveURL(/\/$/)

    // Opened from the profile, a route goes back to it; opened directly, to the home page.
    await page.getByRole('button', { name: 'Mon compte' }).click()
    await page.getByRole('menuitem', { name: 'Mon profil' }).click()
    await expect(page).toHaveURL(/\/profile$/)
    await expect(page.getByRole('banner')).toBeVisible()
    await page.getByRole('link', { name: new RegExp(SEEDED_ROUTE_NAME) }).click()
    await expect(page.getByRole('heading', { name: SEEDED_ROUTE_NAME, level: 1 })).toBeVisible()
    const routeUrl = page.url()
    await page.getByRole('button', { name: 'Retour' }).click()
    await expect(page).toHaveURL(/\/profile$/)

    await page.goto(routeUrl)
    await waitForHydration(page)
    await page.getByRole('button', { name: 'Retour' }).click()
    await expect(page).toHaveURL(/\/$/)
  })
}

test('switches the basemap to Plan IGN and keeps it on the device', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)
  await waitForHydration(page)
  const attribution = page.locator('.maplibregl-ctrl-attrib-inner')
  await expect(attribution).not.toContainText('IGN')

  await page.getByRole('button', { name: 'Fond de carte' }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: 'MapTiler Outdoor' })).toBeChecked()
  await page.getByRole('menuitemcheckbox', { name: 'Plan IGN' }).click()
  await expect(attribution).toContainText('Plan IGN')

  // Remembered on the device: the map opens on it again.
  await page.reload()
  await waitForMap(page)
  await expect(attribution).toContainText('Plan IGN')
  await waitForHydration(page)
  await page.getByRole('button', { name: 'Fond de carte' }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: 'Plan IGN' })).toBeChecked()
})

test('counts a completed route in the profile statistics', async ({ page }) => {
  const outings = page.locator('dt', { hasText: 'Sorties' }).locator('xpath=following-sibling::dd')
  const emptyStats = page.getByText('Marque des parcours comme faits')
  const openStats = async () => {
    await page.goto('/profile')
    // A click before hydration is lost and the tab never opens.
    await waitForHydration(page)
    await page.getByRole('tab', { name: 'Statistiques' }).click()
  }
  await openStats()
  // Other tests of this file may have completed routes already: compare with the count before, once loaded.
  await expect(emptyStats.or(outings)).toBeVisible()
  const empty = await emptyStats.isVisible()
  const before = empty ? 0 : Number(await outings.textContent())

  const { id } = await (await page.request.post('/api/routes', {
    data: { name: 'Parcours stats e2e', sport_type: 'road_cycling', is_public: false, coordinates: [[6.1, 45.9], [6.2, 45.95]] },
  })).json() as { id: string }
  expect((await page.request.put(`/api/routes/${id}/activity/completed`)).ok()).toBe(true)

  await openStats()
  await expect(outings).toHaveText(String(before + 1))
  // Switching the period is immediate, and road cycling alone shows at least this route.
  await page.getByRole('combobox', { name: 'Sport' }).click()
  await page.getByRole('option', { name: 'Vélo de route' }).click()
  await page.getByRole('tab', { name: 'Années' }).click()
  await expect(page.getByText('Sur les 5 dernières années', { exact: true })).toBeVisible()
  expect(Number(await outings.textContent())).toBeGreaterThanOrEqual(1)
})

// Last: it uses up the test account's routing quota for the day (the other tests mock routing).
test('caps routing requests per user and per day', async ({ page, playwright, baseURL }) => {
  const segment = { from: [6.1, 45.9], to: [6.2, 45.95], mode: 'straight', sport_type: 'running' }
  // The e2e server allows 3 a day and has no OpenRouteService key: counted requests then answer 503.
  for (let i = 0; i < 3; i++) {
    expect((await page.request.post('/api/routing/segment', { data: segment })).status()).toBe(503)
  }
  const refused = await page.request.post('/api/routing/segment', { data: segment })
  expect(refused.status()).toBe(429)
  expect(await refused.json()).toMatchObject({
    statusMessage: "Limite de 3 calculs d'itinéraire par jour atteinte",
    data: { reason: 'daily_quota' },
  })

  // Signed-out visitors can't use routing at all.
  const visitor = await signedOutRequest(playwright, baseURL!)
  expect((await visitor.post('/api/routing/segment', { data: segment })).status()).toBe(401)
  await visitor.dispose()
})

test('shares the location with the family during an outing, then deletes it', async ({ request, playwright, baseURL }) => {
  const member = await familyRequest(playwright, baseURL!)
  const point = (minute: number) => ({ fixed_at: `2026-10-04T08:0${minute}:00Z`, lng: 6.12, lat: 45.9 + minute / 1000, accuracy_m: 5 })

  const started = await request.post('/api/live', { data: { route_id: process.env.E2E_ROUTE_ID } })
  expect(started.status()).toBe(201)
  const { id } = await started.json() as LiveShareStarted

  // Points out of order, then one sent again with an older one arriving late: nothing is lost or doubled, and
  // the latest position stays the latest fix.
  expect((await request.post(`/api/live/${id}/points`, { data: { points: [point(2), point(1)] } })).status()).toBe(204)
  expect((await request.post(`/api/live/${id}/points`, { data: { points: [point(1), point(0)] } })).status()).toBe(204)

  // The family sees the share, its route and its track; ?after= only brings the newer points.
  const list = await (await member.get('/api/live')).json() as LiveShareSummary[]
  expect(list).toEqual([expect.objectContaining({
    id, user_name: E2E_USER.displayName, is_mine: false, route: { id: process.env.E2E_ROUTE_ID, name: SEEDED_ROUTE_NAME },
    last_fixed_at: expect.stringMatching(/^2026-10-04T08:02:00/),
  })])
  const detail = await (await member.get(`/api/live/${id}`)).json() as LiveShareDetail
  expect(detail.points.map(p => p.lat)).toEqual([45.9, 45.901, 45.902])
  expect(detail.route_geometry?.type).toBe('LineString')
  const newer = await (await member.get(`/api/live/${id}?after=${encodeURIComponent(point(1).fixed_at)}`)).json() as LiveShareDetail
  expect(newer).toMatchObject({ points: [{ lat: 45.902 }], route_geometry: null })

  // Other members can neither add points nor stop it.
  expect((await member.post(`/api/live/${id}/points`, { data: { points: [point(3)] } })).status()).toBe(404)
  expect((await member.delete(`/api/live/${id}`)).status()).toBe(204)
  expect((await member.get(`/api/live/${id}`)).ok()).toBe(true)

  // Starting again replaces the share whose end never reached the server.
  const { id: second } = await (await request.post('/api/live', { data: {} })).json() as LiveShareStarted
  expect((await member.get(`/api/live/${id}`)).status()).toBe(404)
  expect((await member.get(`/api/live/${second}`)).ok()).toBe(true)

  // Expired after 12 hours: hidden from the family and closed to new points, until the cron job removes it.
  await supabaseAdmin(`/rest/v1/live_shares?id=eq.${second}`, {
    method: 'PATCH',
    body: JSON.stringify({ expires_at: new Date(Date.now() - 60_000).toISOString() }),
  })
  expect((await member.get(`/api/live/${second}`)).status()).toBe(404)
  expect(await (await member.get('/api/live')).json()).toEqual([])
  expect((await request.post(`/api/live/${second}/points`, { data: { points: [point(4)] } })).status()).toBe(404)

  // Stopped: the share and its track are deleted.
  expect((await request.delete(`/api/live/${second}`)).status()).toBe(204)
  expect(await supabaseAdmin(`/rest/v1/live_shares?id=eq.${second}&select=id`)).toEqual([])
  expect(await supabaseAdmin(`/rest/v1/live_positions?share_id=in.(${id},${second})&select=fixed_at`)).toEqual([])
  await member.dispose()
})

test.describe('sharing the location during an outing', () => {
  // At the start of the seeded route.
  const START = { latitude: 45.899, longitude: 6.129, accuracy: 5 }
  test.use({ permissions: ['geolocation'], geolocation: START })

  test('shares the position while following, fills in a network gap, and stops when leaving', async ({ page, context, playwright, baseURL }) => {
    test.slow()
    // Fake clock: one point is kept every 30 s of Date.now().
    await page.clock.install({ time: new Date('2026-10-04T08:00:00Z') })
    const member = await familyRequest(playwright, baseURL!)
    const shares = async () => await (await member.get('/api/live')).json() as LiveShareSummary[]
    // `meters` south of the start, 30 simulated seconds later.
    const moveTo = async (meters: number) => {
      await page.clock.fastForward(30_000)
      await context.setGeolocation({ ...START, latitude: START.latitude - meters / 111_194.93 })
    }
    const status = page.getByTestId('live-status')

    await page.goto(`/routes/${process.env.E2E_ROUTE_ID}/follow`)
    await waitForMap(page)
    await expect(page.getByText(/Précision GPS/)).toBeVisible()
    // Never shared without asking.
    expect(await shares()).toEqual([])

    await page.getByRole('button', { name: 'Partager ma position' }).click()
    await page.getByRole('dialog', { name: 'Partager ta position avec la famille ?' }).getByRole('button', { name: 'Partager', exact: true }).click()
    await expect(page.getByText('Position partagée avec la famille')).toBeVisible()
    await expect(status).toHaveText('Envoyée il y a 0 s')
    const [share] = await shares()
    expect(share).toMatchObject({ user_name: E2E_USER.displayName, route: { name: SEEDED_ROUTE_NAME } })

    // No network for a minute: the points wait, then all arrive in order.
    await context.setOffline(true)
    await moveTo(100)
    await moveTo(200)
    await expect(status).toHaveText('Pas de réseau : 2 positions en attente')
    await context.setOffline(false)
    // The next try, 30 s after the last one.
    await page.clock.fastForward(30_000)
    await expect(status).toHaveText('Envoyée il y a 0 s')
    const { points } = await (await member.get(`/api/live/${share!.id}`)).json() as LiveShareDetail
    expect(points.map(point => Math.round((START.latitude - point.lat) * 111_194.93))).toEqual([0, 100, 200])

    // Leaving follow mode stops sharing.
    await page.getByRole('link', { name: 'Quitter' }).click()
    await expect(page).toHaveURL(new RegExp(`/routes/${process.env.E2E_ROUTE_ID}$`))
    await expect.poll(shares).toEqual([])
    await member.dispose()
  })

  test('shares the position while recording, and stops when the outing is discarded', async ({ page, context, playwright, baseURL }) => {
    test.slow()
    await page.clock.install({ time: new Date('2026-10-04T08:00:00Z') })
    page.on('dialog', dialog => dialog.accept()) // "discard the outing?"
    const member = await familyRequest(playwright, baseURL!)
    const shares = async () => await (await member.get('/api/live')).json() as LiveShareSummary[]

    await page.goto('/record')
    await waitForMap(page)
    await expect(page.getByText(/Précision GPS/)).toBeVisible()
    // Offered once the outing has started.
    await expect(page.getByRole('button', { name: 'Partager ma position' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Démarrer' }).click()
    await page.getByRole('button', { name: 'Partager ma position' }).click()
    await page.getByRole('dialog', { name: 'Partager ta position avec la famille ?' }).getByRole('button', { name: 'Partager', exact: true }).click()
    await expect(page.getByText('Position partagée avec la famille')).toBeVisible()
    await expect.poll(shares).toEqual([expect.objectContaining({ route: null })])

    for (const meters of [100, 200]) {
      await page.clock.fastForward(60_000)
      await context.setGeolocation({ ...START, latitude: START.latitude + meters / 111_194.93 })
      await expect(page.getByTestId('distance')).toHaveText(`${meters} m`)
    }
    await page.getByRole('button', { name: 'Terminer' }).click()
    await page.getByRole('dialog', { name: 'Terminer la sortie' }).getByRole('button', { name: 'Abandonner la sortie' }).click()
    await expect(page.getByRole('button', { name: 'Démarrer' })).toBeVisible()
    await expect.poll(shares).toEqual([])
    await member.dispose()
  })
})
