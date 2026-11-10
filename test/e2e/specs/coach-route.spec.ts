import { expect, test, waitForHydration, waitForMap } from '../fixtures'

// The route of the session of the day (#266): from the coach page to the session mode of the Créer panel, loops
// from the device's position (mocked by fixtures.ts), then followed.
test.use({ role: 'account', permissions: ['geolocation'], geolocation: { latitude: 45.9, longitude: 6.12, accuracy: 10 } })

test('generates the route of the session from home and follows it', async ({ page }) => {
  // No goal and no dated outings: the account's outings all come from this run, so the coach is still learning
  // and proposes an endurance run. A goal set here would leak into coach-session.spec.ts, which starts without one.
  let sessionRouteId: string | null = null

  try {
    // Nothing is routed before the click (OpenRouteService quota).
    const loopRequests: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/routing/loop')) loopRequests.push(request.url())
    })
    await page.goto('/coach')
    await waitForHydration(page)
    await expect(page.getByTestId('coach-session-title')).toHaveText('Sortie en endurance')
    expect(loopRequests).toHaveLength(0)

    await page.getByRole('button', { name: 'Générer le tracé depuis chez moi' }).click()
    await expect(page).toHaveURL(/\/routes\/create\?mode=session/)
    await waitForMap(page)
    await expect(page.getByRole('tab', { name: 'Séance' })).toHaveAttribute('aria-selected', 'true')
    const panel = page.getByTestId('session-route')
    await expect(panel.getByTestId('session-route-title')).toHaveText('Sortie en endurance')
    await expect(panel).toContainText('Séance du jour · 1 h')

    // Three loops from the position, the best one on top with its figures and duration, the others under it.
    await expect(panel.getByTestId('session-route-distance')).toHaveText(/km$/)
    expect(loopRequests).toHaveLength(3)
    await expect(panel.getByRole('heading', { name: 'Autres tracés pour cette séance' })).toBeVisible()
    const others = panel.getByRole('list', { name: 'Autres tracés pour cette séance' }).getByRole('button')
    await expect(others).toHaveCount(2)
    // Another one becomes the picked one, the first moves to the list.
    await others.first().click()
    await expect(others).toHaveCount(2)
    await expect(panel.getByTestId('session-route-distance')).toHaveText(/km$/)

    // Following saves the route (private, named after the session) and opens follow mode.
    await panel.getByRole('button', { name: 'Suivre maintenant' }).click()
    await expect(page).toHaveURL(/\/routes\/[0-9a-f-]{36}\/follow/)
    sessionRouteId = page.url().match(/\/routes\/([0-9a-f-]{36})\/follow/)![1]!
    await waitForMap(page)
    await expect(page.getByText('Suivi en cours')).toBeVisible()
    await expect(page.getByText(/^Sortie en endurance — /).first()).toBeVisible()
    const saved = await (await page.request.get(`/api/routes/${sessionRouteId}`)).json() as { is_public: boolean, sport_type: string }
    expect(saved.is_public).toBe(false)
    expect(saved.sport_type).toBe('running')
  }
  finally {
    if (sessionRouteId) expect((await page.request.delete(`/api/routes/${sessionRouteId}`)).ok()).toBe(true)
  }
})
