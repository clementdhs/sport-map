import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import { insertRows, storedAvatarFiles, storedPhotoFiles, supabaseAdmin } from '../admin'
import type { Locator, Page } from '@playwright/test'
import { ACCOUNT_ROUTE_NAME, expect, test, waitForHydration } from '../fixtures'

test.use({ role: 'account' })

// Only its first bytes matter: the server checks the type from them.
const JPEG_BYTES = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0xFF, 0xD9])

// A PNG of a few MB (noise doesn't compress), drawn by the browser: the page has to crop and compress it.
async function bigPhoto(page: Page, color: string): Promise<Buffer> {
  const base64 = await page.evaluate(async (color) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1600
    canvas.height = 1200
    const context = canvas.getContext('2d')!
    context.fillStyle = color
    context.fillRect(0, 0, canvas.width, canvas.height)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    for (let i = 0; i < pixels.data.length; i += 4) pixels.data[i] = Math.random() * 255
    context.putImageData(pixels, 0, 0)
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(png => resolve(png!), 'image/png'))
    return new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result as string).split(',')[1]!)
      reader.readAsDataURL(blob)
    })
  }, color)
  return Buffer.from(base64, 'base64')
}

// Whether a signed-out visitor (publishable key only) can get a signed URL for a profile photo, straight from the
// storage API.
async function visitorCanSignAvatar(path: string): Promise<boolean> {
  const response = await fetch(`${process.env.E2E_SUPABASE_URL}/storage/v1/object/sign/avatars/${path}`, {
    method: 'POST',
    headers: { apikey: process.env.E2E_SUPABASE_PUBLIC_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 60 }),
  })
  return response.ok
}

// The avatar in `scope` shows the photo as stored (256 px), not the initials.
const showsPhoto = (scope: Locator) => expect(scope.locator('img')).toHaveJSProperty('naturalWidth', 256)

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
  await page.locator('input[name="identifier"]').fill(account.email)
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
  expect((await page.request.post('/api/profile/me/avatar', {
    multipart: { photo: { name: 'portrait.jpg', mimeType: 'image/jpeg', buffer: JPEG_BYTES } },
  })).status()).toBe(201)
  expect(await ratingCount()).toBe(1)

  // The archive holds all of it.
  await page.goto('/settings')
  await waitForHydration(page)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Télécharger mes données' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(new RegExp(`^sportmap-${account.username}-\\d{4}-\\d{2}-\\d{2}\\.zip$`))
  const files = unzipSync(readFileSync((await download.path())!))
  const text = (path: string) => strFromU8(files[path]!)
  const base = `parcours-rgpd-e2e-${routeId.slice(0, 8)}`
  expect(Object.keys(files)).toEqual(expect.arrayContaining([
    'LISEZMOI.txt', 'profil.json', 'parcours.json', 'avis.json', 'activite.json', 'collections.json', 'signalements.json', `parcours/${base}.gpx`,
  ]))
  const photos = Object.keys(files).filter(path => path.startsWith(`photos/${base}/`))
  expect(photos).toHaveLength(1)
  expect([...files[photos[0]!]!.subarray(0, 3)]).toEqual([0xFF, 0xD8, 0xFF])
  expect(JSON.parse(text('profil.json'))).toMatchObject({ username: account.username, email: account.email, photo: 'photo-de-profil.jpg' })
  expect([...files['photo-de-profil.jpg']!.subarray(0, 3)]).toEqual([0xFF, 0xD8, 0xFF])
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
  expect(await storedAvatarFiles(userId)).toEqual([])
  expect(await ratingCount()).toBe(0)
  await expect(supabaseAdmin(`/auth/v1/admin/users/${userId}`)).rejects.toThrow(/404/)
})

test('edits the profile and the appearance from the settings, reached through the account menu', async ({ page, users }) => {
  await page.goto('/profile')
  await waitForHydration(page)
  // Signed-in users change the appearance in the settings, not from the header.
  await expect(page.getByRole('button', { name: 'Apparence' })).toHaveCount(0)
  await page.getByRole('button', { name: users.account.username }).click()
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
  // Its own routes, drawn, without "by" on its own profile.
  const card = page.getByRole('link', { name: new RegExp(ACCOUNT_ROUTE_NAME) })
  await expect(card.locator('svg path')).toHaveAttribute('d', /^M\d+ \d+L/)
  await expect(card).not.toContainText(`par ${users.account.displayName}`)
  await expect(page.getByRole('button', { name: 'Supprimer mon compte' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Paramètres' })).toHaveAttribute('href', '/settings')
})

test('sets a profile photo framed and compressed in the settings, shown to the team, then changes and deletes it', async ({ page, users, accountRouteId, newDevice }) => {
  const [{ id: userId }] = await supabaseAdmin<[{ id: string }]>(`/rest/v1/profiles?select=id&username=eq.${users.account.username}`)
  const settingsAvatar = page.getByTestId('settings-avatar')
  const accountButton = page.getByRole('button', { name: `Mon compte (${users.account.username})` })
  await page.goto('/settings')
  await waitForHydration(page)
  await expect(settingsAvatar).toHaveText('CE') // Compte e2e N
  await expect(accountButton.locator('img')).toHaveCount(0)

  // A photo of a few MB, framed (zoomed in and moved with the keyboard), then sent as a 256 px WebP of a few kB.
  const source = await bigPhoto(page, '#2a6')
  expect(source.length).toBeGreaterThan(1_000_000)
  const choose = (buffer: Buffer) => page.getByLabel('Fichier de la photo de profil').setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer })
  const dialog = page.getByRole('dialog', { name: 'Cadrer la photo' })
  const save = async () => {
    const [request] = await Promise.all([
      page.waitForRequest(request => request.url().endsWith('/api/profile/me/avatar') && request.method() === 'POST'),
      dialog.getByRole('button', { name: 'Enregistrer la photo' }).click(),
    ])
    await expect(dialog).toBeHidden()
    return request.postDataBuffer()!.length
  }
  await choose(source)
  await dialog.getByRole('img', { name: /^Photo à cadrer/ }).focus()
  await page.keyboard.press('+')
  await page.keyboard.press('ArrowLeft')
  await expect(dialog.getByRole('slider', { name: 'Zoom' })).toHaveAttribute('aria-valuenow', '1.25')
  expect(await save()).toBeLessThan(30_000)
  await expect(page.getByText('Photo de profil enregistrée').first()).toBeVisible()
  await showsPhoto(settingsAvatar)
  const [stored] = await storedAvatarFiles(userId)
  expect(stored).toMatchObject({ name: expect.stringMatching(/\.webp$/), metadata: { mimetype: 'image/webp' } })
  expect(stored!.metadata.size).toBeLessThan(30_000)

  // In the account menu, on the profile and in the phone's tab bar.
  await showsPhoto(accountButton)
  await page.goto('/profile')
  await showsPhoto(page.getByTestId('profile-avatar'))
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('tab-avatar')).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 720 })

  // The team sees it on the profile and on route cards; signed-out visitors can't reach the file.
  const member = await newDevice('family')
  await member.goto(`/profile/${users.account.username}`)
  await showsPhoto(member.getByTestId('profile-avatar'))
  expect((await member.request.put(`/api/routes/${accountRouteId}/activity/saved`)).ok()).toBe(true)
  await member.goto('/collections/todo')
  await showsPhoto(member.getByRole('link', { name: new RegExp(ACCOUNT_ROUTE_NAME) }))
  expect((await member.request.delete(`/api/routes/${accountRouteId}/activity/saved`)).ok()).toBe(true)
  expect(await visitorCanSignAvatar(`${userId}/${stored!.name}`)).toBe(false)

  // Another photo replaces the file; deleting it brings the initials back and empties the folder.
  await page.goto('/settings')
  await waitForHydration(page)
  await choose(await bigPhoto(page, '#c50'))
  await save()
  await expect.poll(async () => (await storedAvatarFiles(userId)).map(file => file.name)).not.toContain(stored!.name)
  expect(await storedAvatarFiles(userId)).toHaveLength(1)
  page.once('dialog', confirm => confirm.accept())
  await page.getByRole('button', { name: 'Supprimer la photo' }).click()
  await expect(page.getByText('Photo de profil supprimée').first()).toBeVisible()
  await expect(settingsAvatar).toHaveText('CE')
  await expect(accountButton.locator('img')).toHaveCount(0)
  expect(await storedAvatarFiles(userId)).toEqual([])
})

test('offers ten accent colors in the settings, rendered by the server in a shade readable in both modes', async ({ page, context, baseURL }) => {
  // A color picked among the four offered before #144 still applies.
  await context.addCookies([{ name: 'sport-map-accent', value: 'green', url: baseURL }])
  await page.goto('/settings#appearance')
  await waitForHydration(page)
  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-accent', 'green')
  await expect(page.getByRole('group', { name: 'Couleur' }).getByRole('button')).toHaveCount(10)
  await expect(page.getByRole('button', { name: 'Vert', exact: true })).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: 'Clair' }).click()
  await page.getByRole('button', { name: 'Sarcelle' }).click()
  await expect(page.getByRole('button', { name: 'Sarcelle' })).toHaveAttribute('aria-pressed', 'true')
  await expect(html).toHaveAttribute('data-accent', 'teal')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#005f5a')

  // No flash: the server renders the accent and its light-mode shade (800 for teal, for white text on buttons and links on the cream surfaces).
  const response = await page.reload()
  const body = await response!.text()
  expect(body).toContain('data-accent="teal"')
  expect(body).toContain('data-accent-shade="800"')
  // A click before hydration is lost and the mode never changes.
  await waitForHydration(page)
  const primary = () => page.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    return ['--ui-primary', '--ui-color-primary-700', '--ui-color-primary-400'].map(name => style.getPropertyValue(name))
  })
  const [light, shade700] = await primary()
  expect(light).toBe(shade700)

  // Dark mode keeps the 400 shade, with dark text on buttons.
  await page.getByRole('button', { name: 'Sombre' }).click()
  await expect(html).toHaveClass(/dark/)
  const [dark, , shade400] = await primary()
  expect(dark).toBe(shade400)
})

test('counts a completed route in the profile summary and statistics', async ({ page, users }) => {
  const valueOf = (scope: Locator, label: string) => scope.locator('dt', { hasText: label }).locator('xpath=following-sibling::dd')
  const outings = valueOf(page.getByRole('tabpanel'), 'Sorties')
  // The current year's totals at the top of the profile, the member's own and the one the family sees.
  const summaryOutings = valueOf(page.getByTestId('profile-summary'), 'Sorties')
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
  const summaryBefore = Number(await summaryOutings.textContent())
  await expect(page.getByTestId('profile-summary')).toContainText(`En ${new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric' }).format(new Date())}`)
  await expect(page.getByTestId('profile-avatar')).toHaveText('CE') // Compte e2e N

  const { id } = await (await page.request.post('/api/routes', {
    data: { name: 'Parcours stats e2e', sport_type: 'road_cycling', is_public: false, coordinates: [[6.1, 45.9], [6.2, 45.95]] },
  })).json() as { id: string }
  expect((await page.request.put(`/api/routes/${id}/activity/completed`)).ok()).toBe(true)

  await openStats()
  await expect(outings).toHaveText(String(before + 1))
  await expect(summaryOutings).toHaveText(String(summaryBefore + 1))
  // The family sees the same totals, the private route included, but not the route itself.
  await page.goto(`/profile/${users.account.username}`)
  await expect(summaryOutings).toHaveText(String(summaryBefore + 1))
  await expect(page.getByText('Parcours stats e2e')).toHaveCount(0)
  await page.goto('/profile')
  await waitForHydration(page)
  await page.getByRole('tab', { name: 'Statistiques' }).click()
  // Switching the period is immediate, and road cycling alone shows at least this route.
  await page.getByRole('combobox', { name: 'Sport' }).click()
  await page.getByRole('option', { name: 'Vélo de route' }).click()
  await page.getByRole('tab', { name: 'Années' }).click()
  await expect(page.getByText('Sur les 5 dernières années', { exact: true })).toBeVisible()
  expect(Number(await outings.textContent())).toBeGreaterThanOrEqual(1)
})

test('reaches each settings section from its table of contents, on a computer and on a phone, and links to it', async ({ page }) => {
  await page.goto('/settings')
  await waitForHydration(page)
  const sections = page.getByRole('navigation', { name: 'Sections des paramètres' })
  const link = (name: string) => sections.getByRole('link', { name })
  await expect(sections.getByRole('link')).toHaveText(['Profil', 'Compte', 'Apparence et langue', 'Sport par défaut', 'Mes allures', 'Ma zone de départ', 'Guidage vocal'])
  await expect(link('Profil')).toHaveAttribute('aria-current', 'location')

  // One click and the section is in sight, with its own URL.
  await link('Guidage vocal').click()
  await expect(page).toHaveURL(/\/settings#voice$/)
  await expect(link('Guidage vocal')).toHaveAttribute('aria-current', 'location')
  await expect(page.getByRole('heading', { name: 'Guidage vocal', level: 2 })).toBeInViewport()

  // Voice guidance, set here as in follow mode, kept in the account and cached on the device.
  const voice = page.getByRole('switch', { name: 'Activer le guidage vocal' })
  await expect(page.getByRole('checkbox', { name: 'Arrivée' })).toBeDisabled()
  await voice.click()
  await page.getByRole('checkbox', { name: 'Arrivée' }).click()
  await page.reload()
  await waitForHydration(page)
  await expect(voice).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Arrivée' })).not.toBeChecked()
  expect(await page.evaluate(() => localStorage.getItem('sport-map:voice'))).toBe(
    JSON.stringify({ enabled: true, announcements: ['track', 'kilometres', 'climbs'] }),
  )

  // A link straight to a section, then the highlighted link follows the scroll.
  await page.goto('/settings#appearance')
  await waitForHydration(page)
  await expect(link('Apparence et langue')).toHaveAttribute('aria-current', 'location')
  await expect(page.getByRole('heading', { name: 'Apparence et langue', level: 2 })).toBeInViewport()
  await page.mouse.move(600, 400)
  await page.mouse.wheel(0, -100_000)
  await expect(link('Profil')).toHaveAttribute('aria-current', 'location')

  // Phones: a strip of sections stuck under the header, clear of the bottom tab bar.
  await page.setViewportSize({ width: 375, height: 812 })
  await link('Compte').click()
  await expect(page).toHaveURL(/\/settings#account$/)
  const strip = await sections.boundingBox()
  const heading = await page.getByRole('heading', { name: 'Compte', level: 2 }).boundingBox()
  expect(strip!.y).toBeGreaterThan(0)
  expect(heading!.y).toBeGreaterThanOrEqual(strip!.y + strip!.height)
  expect(heading!.y).toBeLessThan(strip!.y + strip!.height + 100)

  await link('Guidage vocal').click()
  await expect(link('Guidage vocal')).toBeInViewport()
  const tabBar = await page.getByRole('navigation', { name: 'Navigation principale' }).last().boundingBox()
  const last = await page.locator('#voice').boundingBox()
  expect(last!.y + last!.height).toBeLessThanOrEqual(tabBar!.y)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
})
