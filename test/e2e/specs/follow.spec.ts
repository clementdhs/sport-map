import { EMPTY_MAP_STYLE, expect, routeAction, SEEDED_ROUTE_NAME, test, waitForHydration, waitForMap } from '../fixtures'

// A family member follows the seeded route, the test account prepares it for offline use.
test.describe('follow mode', () => {
  // A fake GPS, starting at the start of the seeded route.
  test.use({ role: 'family', permissions: ['geolocation'], geolocation: { latitude: 45.899, longitude: 6.129, accuracy: 10 } })

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
    // A value checked comes last; the arrows move it.
    await page.getByRole('checkbox', { name: 'Durée du tour' }).click()
    await page.getByRole('button', { name: 'Monter « Durée du tour »' }).click()
    await page.keyboard.press('Escape')
    await expect(data.locator('[data-field="time"]')).toHaveCount(0)
    const order = ['distance', 'remaining', 'speed', 'remainingGain', 'lapTime', 'arrival']
    await expect.poll(() => data.locator('[data-field]').evaluateAll(tiles => tiles.map(tile => tile.getAttribute('data-field')))).toEqual(order)
    // With a lap value on screen, "Tour" starts a new lap.
    await page.getByRole('button', { name: 'Tour', exact: true }).click()
    await expect(page.getByText('Tour 2')).toBeVisible()
    // The speed needs 5 s of fixes: a dash without unit until then, so a fast machine gets here too early.
    await expect(data.locator('[data-field="speed"]')).toContainText('/km', { timeout: 10_000 })
    await page.reload()
    await waitForHydration(page)
    await page.getByRole('button', { name: 'Données' }).click()
    await expect(data.locator('[data-field="remaining"]')).toBeVisible()
    await expect(data.locator('[data-field="time"]')).toHaveCount(0)
    await expect.poll(() => data.locator('[data-field]').evaluateAll(tiles => tiles.map(tile => tile.getAttribute('data-field')))).toEqual(order)
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

  test('records the outing while following, and lists it on the route without another route', async ({ page, context, users }) => {
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
    const todoIds = async () => ((await (await page.request.get('/api/collections/todo')).json()) as { routes: { id: string }[] }).routes.map(r => r.id)
    // On the "À faire" list, which the recorded outing takes it off.
    expect((await page.request.put(`/api/routes/${id}/activity/saved`)).ok()).toBe(true)
    expect(await todoIds()).toContain(id)
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
    const outing = page.getByTestId('outing').filter({ hasText: users.family.username }).first()
    await expect(outing).toContainText('28 septembre 2026')
    await expect(outing).toContainText(/30 min au total, 30 min en mouvement/)
    await expect(outing).toContainText("de moins que l'estimation")
    await expect(page.getByRole('button', { name: /Fait le/ })).toBeVisible()

    // No new route, and the outing counts in the statistics.
    const profile = await myProfile()
    expect(profile.created).toHaveLength(routesBefore)
    expect(profile.outings.filter(o => o.route_id === id && o.moving_s! >= 1700).length).toBeGreaterThanOrEqual(1)
    expect(await todoIds()).not.toContain(id)

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

test.describe('offline follow mode', () => {
  // The other tests block the service worker, which would hide requests from page.route().
  test.use({ role: 'account', serviceWorkers: 'allow' })

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
