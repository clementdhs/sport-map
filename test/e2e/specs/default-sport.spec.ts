import type { Page } from '@playwright/test'
import { expect, test, waitForHydration, waitForMap } from '../fixtures'

// The member's default sport (#148): chosen in the settings, preselected in the editor and when saving an outing,
// and offered as a quick filter on the home page, never imposed.
test.use({ role: 'account' })

const saved = (page: Page) => page.waitForResponse(response =>
  /\/api\/profile\/me\/preferences$/.test(response.url()) && response.request().method() === 'PATCH' && response.ok())

test('a default sport set in the settings is preselected in the editor and offered on the home page', async ({ page }) => {
  // Without one, the home page's sport chips keep their order.
  await page.goto('/')
  await waitForHydration(page)
  const chips = page.getByRole('group', { name: 'Sport', exact: true }).getByRole('button')
  await expect(chips.nth(1)).toHaveText('Course')

  await page.goto('/settings#sport')
  await waitForHydration(page)
  const setting = page.getByRole('combobox', { name: 'Mon sport' })
  await expect(setting).toContainText('Aucun')
  const chosen = saved(page)
  await setting.click()
  await page.getByRole('option', { name: 'Trail' }).click()
  await chosen
  expect(await (await page.request.get('/api/profile/me/preferences')).json()).toMatchObject({ defaultSport: 'trail' })

  // Preselected in the editor, and still the member's to change.
  await page.goto('/routes/create')
  await waitForMap(page)
  const editorSports = page.getByRole('group', { name: 'Sport', exact: true })
  const sport = editorSports.getByRole('button', { pressed: true })
  await expect(sport).toHaveText('Trail')
  await editorSports.getByRole('button', { name: 'VTT', exact: true }).click()
  await expect(sport).toHaveText('VTT')

  // On the home page, a quick filter the member turns on and off: their hiking route only shows without it.
  const [hikeId, trailId] = await Promise.all(([['Sentier rando e2e du sport', 'hiking'], ['Sentier trail e2e du sport', 'trail']] as const)
    .map(async ([name, sport_type]) => (await (await page.request.post('/api/routes', {
      data: { name, sport_type, is_public: false, coordinates: [[6.25, 45.88], [6.27, 45.89]] },
    })).json() as { id: string }).id))
  try {
    await page.goto('/')
    await waitForMap(page)
    const cards = page.getByTestId('route-results').locator('li a')
    // The default sport comes first among the chips.
    await expect(chips.nth(1)).toHaveText('Trail')
    const quickFilter = page.getByRole('button', { name: 'Trail', exact: true })
    await expect(cards.filter({ hasText: 'Sentier rando e2e du sport' })).toHaveCount(1)
    await expect(quickFilter).toHaveAttribute('aria-pressed', 'false')
    await quickFilter.click()
    await expect(quickFilter).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Filtres, 1 actif' })).toBeVisible()
    await expect(cards.filter({ hasText: 'Sentier rando e2e du sport' })).toHaveCount(0)
    await expect(cards.filter({ hasText: 'Sentier trail e2e du sport' })).toHaveCount(1)
    await quickFilter.click()
    await expect(quickFilter).toHaveAttribute('aria-pressed', 'false')
    await expect(cards.filter({ hasText: 'Sentier rando e2e du sport' })).toHaveCount(1)
  }
  finally {
    await Promise.all([hikeId, trailId].map(id => page.request.delete(`/api/routes/${id}`)))
  }

  // "Aucun" brings the editor's own default back.
  await page.goto('/settings#sport')
  await waitForHydration(page)
  const cleared = saved(page)
  await setting.click()
  await page.getByRole('option', { name: 'Aucun' }).click()
  await cleared
  await page.goto('/')
  await waitForHydration(page)
  await expect(page.getByRole('group', { name: 'Sport', exact: true }).getByRole('button').nth(1)).toHaveText('Course')
})

test.describe('saving an outing', () => {
  const START = { latitude: 45.9, longitude: 6.12, accuracy: 5 }
  test.use({ permissions: ['geolocation'], geolocation: START })

  test('preselects the default sport, still the member\'s to change', async ({ page, context }) => {
    await page.request.patch('/api/profile/me/preferences', { data: { defaultSport: 'mountain_biking' } })
    // Fake clock: the recorder times fixes with Date.now().
    await page.clock.install({ time: new Date('2026-09-28T08:00:00Z') })
    page.on('dialog', dialog => dialog.accept()) // "leave the page?" prompts

    await page.goto('/record')
    await waitForMap(page)
    await expect(page.getByText(/Précision GPS/)).toBeVisible()
    await page.getByRole('button', { name: 'Démarrer' }).click()
    for (let i = 1; i <= 2; i++) {
      await page.clock.fastForward(60_000)
      await context.setGeolocation({ ...START, latitude: START.latitude + i * 100 / 111_194.93 })
      await expect(page.getByTestId('distance')).toHaveText(`${i}00 m`)
    }

    await page.getByRole('button', { name: 'Terminer' }).click()
    const dialog = page.getByRole('dialog', { name: 'Terminer la sortie' })
    const sport = dialog.getByRole('combobox', { name: 'Sport' })
    await expect(sport).toContainText('VTT')
    await sport.click()
    await page.getByRole('option', { name: 'Randonnée' }).click()
    await expect(sport).toContainText('Randonnée')
  })
})
