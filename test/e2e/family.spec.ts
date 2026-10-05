import type { LiveShareStarted } from '../../shared/types/live'
import { AUTH_FILE, E2E_USER, expect, FAMILY_USER, SEEDED_LOOP_NAME, SEEDED_ROUTE_NAME, test, waitForHydration, waitForMap } from './fixtures'

test('finds a route of another member on the home map and opens it', async ({ page }) => {
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
  // Other members can't edit or delete it, but can review it.
  await page.getByRole('button', { name: "Plus d'actions" }).click()
  await expect(page.getByRole('menuitem', { name: 'Exporter en GPX' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Modifier le parcours' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: /Avis/ }).click()
  const reviews = page.getByRole('region', { name: 'Avis', exact: true })
  await expect(reviews).toContainText('1 avis')
  await expect(reviews.getByRole('button', { name: 'Publier mon avis' })).toBeVisible()
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

test('summarises the slopes and the ways of a route and colours the track on demand', async ({ page }) => {
  // MapLibre only logs an invalid line-gradient: the track then keeps its plain colour.
  const mapErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('line-gradient')) mapErrors.push(message.text())
  })
  await page.goto(`/routes/${process.env.E2E_ROUTE_ID}`)
  await waitForMap(page)
  await expect(page.getByText(/Pente max : \d+ %/)).toBeVisible()
  const legend = page.getByRole('list', { name: 'Légende des pentes' })
  await expect(legend).toHaveCount(0)
  // The radios are hidden behind their labels, which users click.
  const colouring = page.getByRole('group', { name: 'Couleurs du tracé' })
  await colouring.getByText('Pente', { exact: true }).click()
  await expect(page.getByRole('radio', { name: 'Pente' })).toBeChecked()
  await expect(legend).toContainText('Plus de 15 %')

  // A street then a dirt path graded T2, on the hiking scale since the route is a running one.
  await expect(page.getByRole('region', { name: 'Type de surface' })).toContainText(/Goudron\s+\d+\s%/)
  await expect(page.getByRole('region', { name: 'Type de surface' })).toContainText(/Sentier\s+\d+\s%/)
  await expect(page.getByRole('region', { name: /Difficulté des sentiers/ })).toContainText('T2 randonnée en montagne')
  await colouring.getByText('Surface', { exact: true }).click()
  await expect(legend).toHaveCount(0)
  await colouring.getByText('Difficulté', { exact: true }).click()
  await expect(page.getByRole('radio', { name: 'Difficulté' })).toBeChecked()
  // The seeded route stays under 5 %: one slope class, whose gradient has no stop (#63).
  expect(mapErrors).toEqual([])
})

test('shows nothing about the ways of a route drawn without them', async ({ page }) => {
  await page.goto(`/routes/${process.env.E2E_LOOP_ID}`)
  await expect(page.getByRole('radio', { name: 'Pente' })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Surface' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Type de surface' })).toHaveCount(0)
})

test('filters the search from the filters popover, counts and resets them', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)
  await expect(page.getByRole('link', { name: new RegExp(SEEDED_ROUTE_NAME) })).toBeVisible()

  await page.getByRole('button', { name: 'Filtres' }).click()
  await page.getByRole('combobox', { name: 'Sport' }).click()
  await page.getByRole('option', { name: 'Randonnée' }).click()
  await page.getByRole('switch', { name: /Boucles uniquement/ }).click()

  await expect(page.getByRole('paragraph').filter({ hasText: 'Aucun parcours dans cette zone' })).toBeVisible()
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

test('moves the bottom sheet over the map on a phone with its buttons, the keyboard or a drag', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await waitForMap(page)
  const sheet = page.locator('aside[data-sheet]')
  const collapse = sheet.getByRole('button', { name: 'Réduire le panneau' })
  const expand = sheet.getByRole('button', { name: 'Agrandir le panneau' })
  await expect(sheet).toHaveAttribute('data-sheet', 'half')
  await expect(sheet).toContainText('2 parcours dans cette zone')

  // Collapsed, only its title stays; the hidden content leaves the keyboard and screen reader order.
  await collapse.click()
  await expect(sheet).toHaveAttribute('data-sheet', 'collapsed')
  await expect(collapse).toBeDisabled()
  await expect(sheet.locator('[inert]')).toHaveCount(1)

  await expand.focus()
  await page.keyboard.press('Enter')
  await expect(sheet).toHaveAttribute('data-sheet', 'half')
  await expect(sheet.locator('[inert]')).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(sheet).toHaveAttribute('data-sheet', 'full')
  await expect(expand).toBeDisabled()

  // Dragging its header: to the bottom collapses it, then a third of the way up opens it at half height.
  // Once its height animation is over, the full sheet starts right under the floating top bar, still reachable.
  await expect(async () => expect((await sheet.boundingBox())!.y).toBeLessThan(100)).toPass()
  await expect(page.getByRole('button', { name: 'Mon compte' })).toBeInViewport()
  await expect(page.getByRole('link', { name: 'Créer un parcours' })).toHaveCount(0)
  const header = (await sheet.getByText('2 parcours dans cette zone').first().boundingBox())!
  const x = header.x + 40
  await page.mouse.move(x, header.y + 5)
  await page.mouse.down()
  await page.mouse.move(x, 805, { steps: 10 })
  await page.mouse.up()
  await expect(sheet).toHaveAttribute('data-sheet', 'collapsed')

  await page.mouse.move(x, 780)
  await page.mouse.down()
  await page.mouse.move(x, 550, { steps: 5 })
  await page.mouse.up()
  await expect(sheet).toHaveAttribute('data-sheet', 'half')
})

test('collapses the side panel on a computer and remembers it after a reload', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)
  const panel = page.locator('aside[data-panel]')
  const map = page.locator('[data-map-loaded]')
  const collapse = page.getByRole('button', { name: 'Réduire le panneau' })
  const show = page.getByRole('button', { name: 'Afficher le panneau' })
  const title = page.getByText('2 parcours dans cette zone').filter({ visible: true })
  const width = (await map.boundingBox())!.width
  await expect(collapse).toHaveAttribute('aria-expanded', 'true')

  // The map takes the whole width; the panel's title floats over it, beside the button reopening it.
  await collapse.click()
  await expect(panel).toBeHidden()
  await expect(panel).toHaveAttribute('data-panel', 'collapsed')
  await expect(show).toBeFocused()
  await expect(show).toHaveAttribute('aria-expanded', 'false')
  await expect(title).toBeVisible()
  await expect(async () => expect((await map.boundingBox())!.width).toBeGreaterThan(width + 300)).toPass()

  await page.reload()
  await waitForMap(page)
  await expect(panel).toHaveAttribute('data-panel', 'collapsed')
  await expect(panel).toBeHidden()

  await show.focus()
  await page.keyboard.press('Enter')
  await expect(panel).toBeVisible()
  await expect(collapse).toBeFocused()
  await expect(show).toHaveCount(0)
  await page.reload()
  await waitForMap(page)
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('2 parcours dans cette zone')
})

test('resizes the side panel with the mouse or the keyboard and remembers its width', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)
  const panel = page.locator('aside[data-panel]')
  const edge = page.getByRole('separator', { name: 'Redimensionner le panneau' })
  await expect(edge).toHaveAttribute('aria-valuenow', '384')
  await expect(edge).toHaveAttribute('aria-valuemin', '320')
  await expect(edge).toHaveAttribute('aria-valuemax', '720')

  // Dragging its edge 200 px to the left widens it as much; far to the right stops at the narrowest panel.
  const box = (await edge.boundingBox())!
  const x = box.x + box.width / 2
  await page.mouse.move(x, 300)
  await page.mouse.down()
  await page.mouse.move(x - 200, 300, { steps: 10 })
  await page.mouse.up()
  await expect(edge).toHaveAttribute('aria-valuenow', '584')
  expect((await panel.boundingBox())!.width).toBeCloseTo(584, 0)
  await page.mouse.move(x - 200, 300)
  await page.mouse.down()
  await page.mouse.move(x + 300, 300, { steps: 5 })
  await page.mouse.up()
  await expect(edge).toHaveAttribute('aria-valuenow', '320')

  await edge.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(edge).toHaveAttribute('aria-valuenow', '336')
  await page.keyboard.press('End')
  await expect(edge).toHaveAttribute('aria-valuenow', '720')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(edge).toHaveAttribute('aria-valuenow', '656')

  await page.reload()
  await waitForMap(page)
  await expect(edge).toHaveAttribute('aria-valuenow', '656')
  expect((await panel.boundingBox())!.width).toBeCloseTo(656, 0)
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
  await expect(page.getByRole('paragraph').filter({ hasText: '1 parcours pour « crêtes »' })).toBeVisible()
  await expect(searchBox).toHaveValue('crêtes')
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText(SEEDED_LOOP_NAME)
  // Combined with the filters.
  await page.getByRole('button', { name: 'Filtres' }).click()
  await page.getByRole('combobox', { name: 'Sport' }).click()
  await page.getByRole('option', { name: 'Randonnée' }).click()
  await expect(page.getByRole('paragraph').filter({ hasText: 'Aucun parcours pour « crêtes »' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Effacer la recherche' }).click()
  await expect(page.getByRole('paragraph').filter({ hasText: 'Aucun parcours dans cette zone' })).toBeVisible()
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

    // The data screen, with its values chosen on the phone.
    await waitForHydration(page)
    await page.getByRole('button', { name: 'Données' }).click()
    const data = page.getByTestId('live-data')
    await expect(data.locator('[data-field="remaining"]')).toContainText(/2,71\s*km/)
    await expect(data.locator('[data-field="time"]')).toBeVisible()
    await page.getByRole('button', { name: 'Personnaliser' }).click()
    await page.getByRole('checkbox', { name: 'Heure' }).click()
    await page.getByRole('radio', { name: 'Allure (min/km)' }).click()
    await page.keyboard.press('Escape')
    await expect(data.locator('[data-field="time"]')).toHaveCount(0)
    await expect(data.locator('[data-field="speed"]')).toContainText('/km')
    await page.reload()
    await waitForHydration(page)
    await page.getByRole('button', { name: 'Données' }).click()
    await expect(data.locator('[data-field="remaining"]')).toBeVisible()
    await expect(data.locator('[data-field="time"]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Carte', exact: true }).click()
    await expect(done).toHaveText('3,34 km')

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

  test('records the outing while following, and lists it on the route without another route', async ({ page, context }) => {
    test.slow()
    // Fake clock: the recorder times fixes with Date.now().
    await page.clock.install({ time: new Date('2026-09-28T08:00:00Z') })
    page.on('dialog', dialog => dialog.accept()) // "leave the page?" and "delete?" prompts
    const id = process.env.E2E_ROUTE_ID!
    const myProfile = async () => (await (await page.request.get('/api/profile/me')).json()) as {
      created: unknown[]
      outings: { route_id: string, moving_s: number | null }[]
    }
    const routesBefore = (await myProfile()).created.length
    const done = page.getByTestId('done')
    const elapsed = page.getByTestId('recording-elapsed')

    await page.goto(`/routes/${id}/follow`)
    await waitForMap(page)
    await waitForHydration(page)
    await expect(done).toHaveText('0 m')
    await page.getByRole('button', { name: 'Enregistrer la sortie' }).click()
    await expect(elapsed).toBeVisible()

    // A quarter of an hour later, at the second point of the route.
    await page.clock.fastForward(15 * 60_000)
    await context.setGeolocation({ latitude: 45.87, longitude: 6.14, accuracy: 10 })
    await expect(done).toHaveText('3,34 km')

    // The page closes by accident: the outing is kept on the phone, and following goes on.
    await page.reload()
    await waitForMap(page)
    await waitForHydration(page)
    await expect(page.getByText(/n'est pas terminée/)).toBeVisible()
    await page.getByRole('button', { name: 'Reprendre' }).click()
    await expect(elapsed).toHaveText(/^1\d:\d\d$/)

    // At the end of the route.
    await page.clock.fastForward(15 * 60_000)
    await context.setGeolocation({ latitude: 45.85, longitude: 6.16, accuracy: 10 })
    await expect(page.getByText('Tu es arrivé !')).toBeVisible()

    await page.getByRole('button', { name: 'Terminer' }).click()
    const dialog = page.getByRole('dialog', { name: 'Terminer la sortie' })
    await expect(dialog).toContainText('30 min')
    await dialog.getByRole('button', { name: 'Enregistrer' }).click()

    // Back on the route's page, on its outings.
    await expect(page).toHaveURL(new RegExp(`/routes/${id}\\?tab=outings$`))
    await expect(page.getByRole('heading', { name: SEEDED_ROUTE_NAME, level: 1 })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Passages/ })).toHaveAttribute('aria-selected', 'true')
    const outing = page.getByTestId('outing').filter({ hasText: FAMILY_USER.username }).first()
    await expect(outing).toContainText('28 septembre 2026')
    await expect(outing).toContainText(/30 min au total, 30 min en mouvement/)
    await expect(outing).toContainText("de moins que l'estimation")
    await expect(page.getByRole('button', { name: /Fait le/ })).toBeVisible()

    // No new route, and the outing counts in the statistics.
    const profile = await myProfile()
    expect(profile.created).toHaveLength(routesBefore)
    expect(profile.outings.filter(o => o.route_id === id && o.moving_s! >= 1700).length).toBeGreaterThanOrEqual(1)

    // Deleted by its author.
    const count = await page.getByTestId('outing').count()
    await outing.getByRole('button', { name: 'Supprimer ce passage' }).click()
    await expect(page.getByTestId('outing')).toHaveCount(count - 1)
  })

  test('reads out leaving the route, getting back on it and the arrival', async ({ page, context }) => {
    // What the page says, instead of the browser's voice.
    await page.addInitScript(() => {
      const said: string[] = []
      Object.assign(window, { said })
      window.speechSynthesis.speak = (utterance: SpeechSynthesisUtterance) => void said.push(`${utterance.lang}: ${utterance.text}`)
    })
    const said = () => page.evaluate(() => (window as unknown as { said: string[] }).said)

    await page.goto(`/routes/${process.env.E2E_ROUTE_ID}/follow`)
    await waitForMap(page)
    await waitForHydration(page)
    await page.getByRole('button', { name: 'Guidage vocal' }).click()
    await page.getByRole('switch', { name: 'Activer le guidage vocal' }).click()
    await page.getByRole('checkbox', { name: 'Arrivée' }).click()
    await page.keyboard.press('Escape')
    await expect.poll(said).toEqual(['fr-FR: Guidage vocal activé.'])

    // 4 km east of the route, then back on it at its end: the arrival is not read out, as chosen.
    await context.setGeolocation({ latitude: 45.87, longitude: 6.19, accuracy: 10 })
    await expect(page.getByText("Tu t'éloignes du tracé")).toBeVisible()
    await context.setGeolocation({ latitude: 45.85, longitude: 6.16, accuracy: 10 })
    await expect(page.getByText('Tu es arrivé !')).toBeVisible()
    await expect.poll(said).toEqual([
      'fr-FR: Guidage vocal activé.',
      'fr-FR: Tu quittes le parcours.',
      'fr-FR: Tu es de retour sur le parcours.',
    ])

    // The choices are kept on the phone.
    await page.reload()
    await waitForHydration(page)
    await page.getByRole('button', { name: 'Guidage vocal' }).click()
    await expect(page.getByRole('switch', { name: 'Activer le guidage vocal' })).toBeChecked()
    await expect(page.getByRole('checkbox', { name: 'Arrivée' })).not.toBeChecked()
  })
})

test('follows the outing of another member sharing their position, until it ends', async ({ page, playwright, baseURL }) => {
  test.slow()
  // The test account shares its position (its phone, through the API).
  const sharer = await playwright.request.newContext({ baseURL, storageState: AUTH_FILE })
  const { id } = await (await sharer.post('/api/live', { data: { route_id: process.env.E2E_ROUTE_ID } })).json() as LiveShareStarted
  const sendPoint = async (minutesAgo: number, lat: number) => {
    const fixedAt = new Date(Date.now() - minutesAgo * 60_000).toISOString()
    expect((await sharer.post(`/api/live/${id}/points`, { data: { points: [{ fixed_at: fixedAt, lng: 6.13, lat, accuracy_m: 8 }] } })).status()).toBe(204)
  }
  await sendPoint(11, 45.899)
  await sendPoint(10, 45.896)
  // Fake clock from now on, to run the 20 s refreshes at once.
  await page.clock.install()

  // Announced on the home page, listed among the outings in progress.
  await page.goto('/')
  await page.getByRole('link', { name: `${E2E_USER.displayName} est en sortie` }).click()
  await expect(page).toHaveURL(`/live/${id}`)
  await page.getByRole('link', { name: 'Sorties en cours' }).click()
  await expect(page.getByRole('heading', { name: 'Sorties en cours' })).toBeVisible()
  await page.getByRole('link', { name: new RegExp(`Sortie de ${E2E_USER.displayName}`) }).click()

  // The map of the outing, with the route followed and how old the latest position is.
  await waitForMap(page)
  await expect(page.getByRole('heading', { name: `Sortie de ${E2E_USER.displayName}` })).toBeVisible()
  await expect(page.getByRole('link', { name: SEEDED_ROUTE_NAME })).toBeVisible()
  const lastPosition = page.getByTestId('live-last-position')
  await expect(lastPosition).toHaveText(/^Dernière position à \d\d:\d\d \(il y a 10 min\)$/)
  await expect(lastPosition).toHaveClass(/text-warning/)

  // A new point shows at the next refresh.
  await sendPoint(0, 45.893)
  await page.clock.fastForward(20_000)
  await expect(lastPosition).toHaveText(/\(il y a \d+ s\)$/)
  await expect(lastPosition).not.toHaveClass(/text-warning/)

  // Stopped on the phone: the page says so at the next refresh.
  expect((await sharer.delete(`/api/live/${id}`)).status()).toBe(204)
  await page.clock.fastForward(20_000)
  await expect(page.getByText('Ce partage de position est terminé')).toBeVisible()
  await expect(page.getByText(`${E2E_USER.displayName} ne partage plus sa position.`)).toBeVisible()
  await sharer.dispose()

  // Nothing in progress any more.
  await page.goto('/live')
  await expect(page.getByText('Personne ne partage sa position en ce moment.')).toBeVisible()
})
