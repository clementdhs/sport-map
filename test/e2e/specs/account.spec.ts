import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import { insertRows, storedPhotoFiles, supabaseAdmin } from '../admin'
import { ACCOUNT_ROUTE_NAME, expect, test, waitForHydration } from '../fixtures'

test.use({ role: 'account' })

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

test('edits the profile and the appearance from the settings, reached through the account menu', async ({ page, users }) => {
  await page.goto('/profile')
  // Signed-in users change the appearance in the settings, not from the header.
  await expect(page.getByRole('button', { name: 'Apparence' })).toHaveCount(0)
  await page.getByRole('button', { name: users.account.email }).click()
  await page.getByRole('menuitem', { name: 'Paramètres' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByRole('heading', { name: 'Paramètres', level: 1 })).toBeVisible()

  // Global setup recreates the account for each run: no need to restore these. The display name stays the
  // seeded one, which other tests expect on route cards.
  await page.getByLabel('Nom affiché').fill(users.account.displayName)
  await page.getByLabel('Bio').fill('Bio mise à jour depuis les paramètres')
  await page.getByRole('button', { name: 'Enregistrer le profil' }).click()
  await expect(page.getByText('Profil mis à jour').first()).toBeVisible()

  await page.getByRole('button', { name: 'Sombre' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Système' }).click()

  // The profile keeps the routes and statistics only, with a way back to the settings.
  await page.getByRole('link', { name: 'Mon profil' }).click()
  await expect(page.getByRole('heading', { name: users.account.displayName, level: 1 })).toBeVisible()
  await expect(page.getByText('Bio mise à jour depuis les paramètres')).toBeVisible()
  await expect(page.getByRole('link', { name: new RegExp(ACCOUNT_ROUTE_NAME) })).toContainText(`par ${users.account.displayName}`)
  await expect(page.getByRole('button', { name: 'Supprimer mon compte' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Paramètres' })).toHaveAttribute('href', '/settings')
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
