import { E2E_USER, expect, RESET_USER, SEEDED_LOOP_NAME, SEEDED_ROUTE_NAME, test, waitForHydration, waitForMap } from './fixtures'
import { passwordResetLink } from './mail'

test('finds a public route on the home map and opens it', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)

  const card = page.getByRole('link', { name: new RegExp(SEEDED_ROUTE_NAME) })
  await expect(card).toBeVisible()
  // Its average rating, from the seeded review.
  await expect(card).toContainText('4,0')
  await expect(card).toContainText('(1 avis)')
  // Its author by display name, not username.
  await expect(card).toContainText(`par ${E2E_USER.displayName}`)
  await card.click()

  await expect(page).toHaveURL(/\/routes\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: SEEDED_ROUTE_NAME })).toBeVisible()
  await expect(page.getByText('Durée', { exact: true })).toBeVisible()
  // Visitors can't edit or delete, and must sign in to review.
  await page.getByRole('button', { name: "Plus d'actions" }).click()
  await expect(page.getByRole('menuitem', { name: 'Exporter en GPX' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Modifier le parcours' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: /Avis/ }).click()
  const reviews = page.getByRole('region', { name: 'Avis', exact: true })
  await expect(reviews).toContainText('1 avis')
  await expect(reviews.getByRole('link', { name: 'Connecte-toi' })).toBeVisible()
  await expect(reviews.getByRole('button', { name: 'Signaler' })).toHaveCount(0)
})

test('shows the weather at the start of a route, crediting Open-Meteo', async ({ page }) => {
  await page.goto(`/routes/${process.env.E2E_ROUTE_ID}`)
  const weather = page.getByRole('region', { name: 'Météo au départ' })
  // From the fake Open-Meteo of the global setup: rain on the second afternoon, at the start's elevation.
  const rainyAfternoon = weather.getByRole('row').filter({ hasText: 'Demain' }).filter({ hasText: 'Après-midi' })
  await expect(rainyAfternoon).toContainText('6 mm (90 %)')
  await expect(weather).toContainText('à 450 m')
  await expect(weather.getByRole('link', { name: 'Open-Meteo.com' })).toHaveAttribute('href', 'https://open-meteo.com/')
})

test('summarises the slopes of a route and colours them on demand', async ({ page }) => {
  await page.goto(`/routes/${process.env.E2E_ROUTE_ID}`)
  await waitForMap(page)
  await expect(page.getByText(/Pente max : \d+ %/)).toBeVisible()
  const legend = page.getByRole('list', { name: 'Légende des pentes' })
  await expect(legend).toHaveCount(0)
  await page.getByRole('switch', { name: 'Pentes sur la carte et le profil' }).click()
  await expect(legend).toContainText('Plus de 15 %')
})

test('filters the search from the filters popover, counts and resets them', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)
  await expect(page.getByRole('link', { name: new RegExp(SEEDED_ROUTE_NAME) })).toBeVisible()

  await page.getByRole('button', { name: 'Filtres' }).click()
  await page.getByRole('combobox', { name: 'Sport' }).click()
  await page.getByRole('option', { name: 'Randonnée' }).click()
  await page.getByRole('switch', { name: /Boucles uniquement/ }).click()

  await expect(page.getByText('Aucun parcours dans cette zone')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Filtres, 2 actifs' })).toBeVisible()

  await page.getByRole('button', { name: 'Réinitialiser' }).click()
  await expect(page.getByRole('button', { name: 'Filtres', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Réinitialiser' })).toBeDisabled()
  await expect(page.locator('aside li a')).toHaveCount(2)
})

test('shows the results without scrolling on a phone, filters in a drawer', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await waitForMap(page)
  const cards = page.locator('aside li a')
  await expect(cards).toHaveCount(2)
  await expect(cards.first()).toBeInViewport()

  await page.getByRole('button', { name: 'Filtres' }).click()
  const drawer = page.getByRole('dialog', { name: 'Filtres' })
  await drawer.getByRole('switch', { name: /Boucles uniquement/ }).click()
  await drawer.getByRole('button', { name: 'Voir les parcours' }).click()
  await expect(drawer).toBeHidden()
  await expect(cards).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Filtres, 1 actif' })).toBeVisible()
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

  // The loop has no rating yet: it comes after the rated route.
  await page.getByRole('combobox', { name: 'Trier par' }).click()
  await page.getByRole('option', { name: 'Plus longs' }).click()
  await expect(cards.first()).toContainText(SEEDED_LOOP_NAME)
  await page.getByRole('combobox', { name: 'Trier par' }).click()
  await page.getByRole('option', { name: 'Mieux notés' }).click()
  await expect(cards.first()).toContainText(SEEDED_ROUTE_NAME)

  await page.getByRole('button', { name: 'Filtres' }).click()
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
  await page.getByRole('button', { name: 'Filtres' }).click()
  await page.getByRole('switch', { name: /Passant par la zone/ }).click()
  await searched
  await expect(page.locator('aside li a')).toHaveCount(2)
})

test('finds routes by name or description, anywhere, ignoring accents and case', async ({ page, request }) => {
  // Far from both seeded routes: a text search doesn't depend on the view.
  const farAway = 'minLng=-5&minLat=40&maxLng=-4&maxLat=41'
  const names = async (q: string) => ((await (await request.get(`/api/routes?${farAway}&q=${encodeURIComponent(q)}`)).json()) as { name: string }[]).map(route => route.name)
  expect(await names('CRETES')).toEqual([SEEDED_LOOP_NAME])
  // Every word, in any order, in the name or the description ("…créé par les tests de bout en bout.").
  expect(await names('lac traversee')).toEqual([SEEDED_ROUTE_NAME])
  expect((await names('bout tests')).sort()).toEqual([SEEDED_LOOP_NAME, SEEDED_ROUTE_NAME].sort())
  expect(await names('crêtes lac')).toEqual([])

  await page.goto('/')
  await waitForMap(page)
  const cards = page.locator('aside li a')
  await expect(cards).toHaveCount(2)
  // One field for places and routes: the routes suggestion comes first, picked with the keyboard.
  // (Places need MapTiler, which e2e runs without.)
  const searchBox = page.getByRole('combobox', { name: 'Rechercher un lieu ou un parcours' })
  await searchBox.fill('c')
  await expect(page.getByText('Tape au moins 2 lettres')).toBeVisible()
  await searchBox.fill('lac')
  await expect(page.getByRole('option', { name: 'Parcours contenant « lac »' })).toBeVisible()
  await searchBox.press('Escape')
  await expect(page.getByRole('option')).toHaveCount(0)
  await expect(cards).toHaveCount(2)
  await searchBox.fill('crêtes')
  await searchBox.press('ArrowDown')
  await searchBox.press('Enter')
  await expect(page.getByText('1 parcours pour « crêtes »')).toBeVisible()
  await expect(searchBox).toHaveValue('crêtes')
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText(SEEDED_LOOP_NAME)
  // Combined with the filters.
  await page.getByRole('button', { name: 'Filtres' }).click()
  await page.getByRole('combobox', { name: 'Sport' }).click()
  await page.getByRole('option', { name: 'Randonnée' }).click()
  await expect(page.getByText('Aucun parcours pour « crêtes »')).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Effacer la recherche' }).click()
  await expect(page.getByText('Aucun parcours dans cette zone')).toBeVisible()
})

test('lets visitors pick the light or dark mode and an accent color, kept after a reload', async ({ page }) => {
  await page.goto('/')
  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-accent', 'indigo')

  await page.getByRole('button', { name: 'Apparence' }).click()
  await page.getByRole('button', { name: 'Sombre' }).click()
  await expect(html).toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Clair' }).click()
  await expect(html).toHaveClass(/light/)
  await page.getByRole('button', { name: 'Violet' }).click()
  await expect(page.getByRole('button', { name: 'Violet' })).toHaveAttribute('aria-pressed', 'true')
  await expect(html).toHaveAttribute('data-accent', 'violet')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#7c3aed')

  // Rendered by the server with the chosen accent (cookie), the mode restored from localStorage.
  const response = await page.reload()
  expect(await response!.text()).toContain('data-accent="violet"')
  await expect(html).toHaveClass(/light/)
  // Light mode uses the 600 shade, for readable white text on buttons.
  const [primary, shade600] = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    return [style.getPropertyValue('--ui-primary'), style.getPropertyValue('--ui-color-primary-600')]
  })
  expect(primary).toBe(shade600)
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
  expect(ogImage).toMatch(new RegExp(`^https?://[^/]+/api/routes/${process.env.E2E_ROUTE_ID}/og\\.png\\?v=\\d+&lang=fr$`))
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

test.describe('follow mode', () => {
  // A fake GPS, starting at the start of the seeded route.
  test.use({ permissions: ['geolocation'], geolocation: { latitude: 45.899, longitude: 6.129, accuracy: 10 } })

  test('follows the position along the route and warns when straying from it', async ({ page, context }) => {
    await page.goto(`/routes/${process.env.E2E_ROUTE_ID}`)
    await page.getByRole('link', { name: 'Suivre le parcours' }).click()
    await waitForMap(page)
    const done = page.getByTestId('done')
    const remaining = page.getByTestId('remaining')
    await expect(done).toHaveText('0 m')
    await expect(remaining).toHaveText('6,05 km')

    // At the second point of the route, 3.34 km from the start.
    await context.setGeolocation({ latitude: 45.87, longitude: 6.14, accuracy: 10 })
    await expect(done).toHaveText('3,34 km')
    await expect(remaining).toHaveText('2,71 km')

    // 4 km east of it: off the track.
    await context.setGeolocation({ latitude: 45.87, longitude: 6.19, accuracy: 10 })
    await expect(page.getByText("Tu t'éloignes du tracé")).toBeVisible()

    // Back on the track, at its end.
    await context.setGeolocation({ latitude: 45.85, longitude: 6.16, accuracy: 10 })
    await expect(page.getByText("Tu t'éloignes du tracé")).toBeHidden()
    await expect(page.getByText('Tu es arrivé !')).toBeVisible()
    await expect(remaining).toHaveText('0 m')

    await page.getByRole('link', { name: 'Quitter' }).click()
    await expect(page).toHaveURL(new RegExp(`/routes/${process.env.E2E_ROUTE_ID}$`))
  })
})

test('resets a forgotten password from the email link, opened in another browser', async ({ page, browser }) => {
  await page.goto('/login')
  await waitForHydration(page)
  const origin = new URL(page.url()).origin
  await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click()
  await expect(page).toHaveURL(/\/forgot-password$/)

  // Same answer for an unknown address: the page doesn't tell which accounts exist.
  await page.locator('input[name="email"]').fill('personne@sport-map.test')
  await page.getByRole('button', { name: 'Recevoir un lien' }).click()
  const sent = page.getByText('Vérifie ta boîte mail')
  await expect(sent).toBeVisible()
  await page.reload()
  await waitForHydration(page)
  await page.locator('input[name="email"]').fill(RESET_USER.email)
  await page.getByRole('button', { name: 'Recevoir un lien' }).click()
  await expect(sent).toBeVisible()

  // The link works in another browser, without the session or storage of the one that asked for it.
  const link = await passwordResetLink(RESET_USER.email, origin)
  const phone = await browser.newContext({ baseURL: origin })
  const phonePage = await phone.newPage()
  await phonePage.goto(link)
  await waitForHydration(phonePage)
  await phonePage.getByLabel('Nouveau mot de passe').fill('nouveau-mot-de-passe')
  await phonePage.getByLabel('Confirme le mot de passe').fill('pas-le-meme')
  await phonePage.getByRole('button', { name: 'Enregistrer le mot de passe' }).click()
  await expect(phonePage.getByText('Les deux mots de passe sont différents')).toBeVisible()
  await phonePage.getByLabel('Confirme le mot de passe').fill('nouveau-mot-de-passe')
  // The error clears while typing: clicking while it shows would move the button under the pointer.
  await expect(phonePage.getByText('Les deux mots de passe sont différents')).toBeHidden()
  await phonePage.getByRole('button', { name: 'Enregistrer le mot de passe' }).click()
  await expect(phonePage).toHaveURL(`${origin}/`)
  await expect(phonePage.getByRole('button', { name: RESET_USER.email })).toBeVisible()

  // The link only works once.
  await phonePage.goto(link)
  await expect(phonePage.getByText('Lien invalide ou expiré')).toBeVisible()

  // Changed again from the settings, then used to sign in.
  await phonePage.goto('/settings')
  await waitForHydration(phonePage)
  await phonePage.getByLabel('Nouveau mot de passe').fill('encore-un-autre')
  await phonePage.getByLabel('Confirme le mot de passe').fill('encore-un-autre')
  await phonePage.getByRole('button', { name: 'Changer le mot de passe' }).click()
  // The toast, and its copy for screen readers.
  await expect(phonePage.getByText('Mot de passe modifié').first()).toBeVisible()
  await phone.close()

  await page.goto('/login')
  await waitForHydration(page)
  await page.locator('input[name="email"]').fill(RESET_USER.email)
  await page.locator('input[name="password"]').fill('encore-un-autre')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('button', { name: RESET_USER.email })).toBeVisible()
})
