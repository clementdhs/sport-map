import type { Page } from '@playwright/test'
import { ACCOUNT_ROUTE_NAME, expect, test, waitForHydration } from '../fixtures'

// The member's pace per sport (#146): set in the settings, it changes every estimated duration they look at, and
// can be worked out from their latest GPS outings.
test.use({ role: 'account' })

const saved = (page: Page) => page.waitForResponse(response =>
  /\/api\/profile\/me\/preferences$/.test(response.url()) && response.request().method() === 'PATCH' && response.ok())

test('a speed set in the settings changes the durations of the routes, an empty field brings the default back', async ({ page, accountRouteId }) => {
  // The worker's hiking route, about 3.9 km without known gain: 46 min at the default 5 km/h.
  const card = page.getByRole('link', { name: new RegExp(ACCOUNT_ROUTE_NAME) })
  await page.goto('/profile')
  await waitForHydration(page)
  await expect(card).toContainText('45 min')

  await page.goto('/settings#paces')
  await waitForHydration(page)
  const hiking = page.getByRole('textbox', { name: 'Randonnée' })
  await expect(hiking).toHaveAttribute('placeholder', '5')
  await hiking.fill('12')
  await hiking.press('Tab')
  await expect(page.getByText('Écris une vitesse entre 1 et 10 km/h, par exemple 4,5.')).toBeVisible()

  const speedSaved = saved(page)
  await hiking.fill('3,5')
  await hiking.press('Tab')
  await speedSaved
  await expect(page.getByText('Écris une vitesse entre 1 et 10 km/h, par exemple 4,5.')).toHaveCount(0)
  expect(await (await page.request.get('/api/profile/me/preferences')).json()).toMatchObject({ paces: { hiking: 60 / 3.5 } })

  // 66 min at 3.5 km/h, on the cards and the route page, which says where it comes from.
  await page.goto('/profile')
  await waitForHydration(page)
  await expect(card).toContainText('1 h 05')
  await page.goto(`/routes/${accountRouteId}`)
  await waitForHydration(page)
  await expect(page.getByText('1 h 05', { exact: true }).first()).toBeVisible()
  await expect(page.getByLabel(/^Ta vitesse de 3,5 km\/h/).first()).toBeAttached()

  // Emptied, the field gives the default back.
  await page.goto('/settings#paces')
  await waitForHydration(page)
  await expect(hiking).toHaveValue('3,5')
  const cleared = saved(page)
  await hiking.fill('')
  await hiking.press('Tab')
  await cleared
  await page.goto('/profile')
  await waitForHydration(page)
  await expect(card).toContainText('45 min')
})

test('offers the median pace of the latest GPS outings, left out the short ones and those without GPS points', async ({ page }) => {
  // A private mountain bike route of about 9.5 km with no known gain, and its outings: 12, 15 and 18 km/h over
  // 10 km, plus a short one and an older one without GPS points, both much faster.
  const { id: routeId } = await (await page.request.post('/api/routes', {
    data: { name: 'Parcours allure e2e', sport_type: 'mountain_biking', is_public: false, coordinates: [[6.1, 45.9], [6.2, 45.95]] },
  })).json() as { id: string }
  const outings = [
    { kmh: 18, km: 10, track: true },
    { kmh: 30, km: 0.5, track: true },
    { kmh: 15, km: 10, track: true },
    { kmh: 40, km: 10, track: false },
    { kmh: 12, km: 10, track: true },
  ]
  for (const [index, { kmh, km, track }] of outings.entries()) {
    const movingS = Math.round(km / kmh * 3600)
    const response = await page.request.post(`/api/routes/${routeId}/outings`, {
      data: {
        started_at: new Date(Date.UTC(2026, 8, 20 - index, 8)).toISOString(),
        duration_s: movingS + 120,
        moving_s: movingS,
        distance_m: km * 1000,
        ...track ? { track: [[6.1, 45.9, null, 0, 0], [6.2, 45.95, null, movingS + 120, movingS]] } : {},
      },
    })
    expect(response.ok()).toBe(true)
  }

  try {
    await page.goto('/settings#paces')
    await waitForHydration(page)
    await page.getByRole('button', { name: 'Calculer depuis mes sorties' }).click()
    const suggestion = page.locator('[data-pace-suggestion="mountain_biking"]')
    await expect(suggestion).toContainText('D\'après tes 3 dernières sorties : 15 km/h')

    // Nothing changes until the member accepts it.
    const mountainBiking = page.getByRole('textbox', { name: 'VTT' })
    await expect(mountainBiking).toHaveValue('')
    const accepted = saved(page)
    await suggestion.getByRole('button', { name: 'Utiliser' }).click()
    await accepted
    await expect(mountainBiking).toHaveValue('15')
    await expect(suggestion).toHaveCount(0)
  }
  finally {
    expect((await page.request.delete(`/api/routes/${routeId}`)).ok()).toBe(true)
  }
})
