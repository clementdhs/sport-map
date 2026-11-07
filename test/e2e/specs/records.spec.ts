import type { Page } from '@playwright/test'
import { expect, test, waitForHydration } from '../fixtures'

// Personal records (#140): best times worked out from the GPS points of the outings, shown in the profile's
// statistics with a link to their outing, whose Passages entry says it beat a record.
test.use({ role: 'account' })

const METERS_PER_DEG_LAT = 111_195

// A run of `meters` northwards at `secondsPerKm`, a GPS point every 2 seconds.
function run(meters: number, secondsPerKm: number) {
  const track: [number, number, null, number, number][] = []
  for (let s = 0; (s / secondsPerKm) * 1000 <= meters; s += 2) {
    track.push([6.1, 45.9 + (s / secondsPerKm) * 1000 / METERS_PER_DEG_LAT, null, s, s])
  }
  return track
}

async function addOuting(page: Page, routeId: string, startedAt: Date, secondsPerKm: number) {
  const track = run(2100, secondsPerKm)
  const movingS = track.at(-1)![4]
  const response = await page.request.post(`/api/routes/${routeId}/outings`, {
    data: { started_at: startedAt.toISOString(), duration_s: movingS, moving_s: movingS, distance_m: 2100, track },
  })
  expect(response.ok()).toBe(true)
  return (await response.json() as { id: string }).id
}

test('records come from the outings\' GPS points, link to their outing, which says it beat one', async ({ page }) => {
  const { id: routeId } = await (await page.request.post('/api/routes', {
    data: { name: 'Parcours records e2e', sport_type: 'running', is_public: false, coordinates: [[6.1, 45.9], [6.1, 45.919]] },
  })).json() as { id: string }

  try {
    // 3:00 per km, then a faster run two hours later at 2:30: faster than any other test's outing.
    const hour = 3_600_000
    await addOuting(page, routeId, new Date(Date.now() - 4 * hour), 180)
    const faster = await addOuting(page, routeId, new Date(Date.now() - 2 * hour), 150)

    await page.goto('/profile')
    await waitForHydration(page)
    await page.getByRole('tab', { name: 'Statistiques' }).click()
    const records = page.getByTestId('records')
    const bestKm = records.getByRole('link', { name: /^1 km/ })
    await expect(bestKm).toContainText('02:30')
    await expect(bestKm).toContainText('2:30 /km')
    await expect(bestKm).toContainText('Parcours records e2e')
    await expect(records.getByRole('link', { name: /^5 km/ })).toHaveCount(0)

    // Every year: still the same record.
    await records.getByRole('combobox', { name: 'Période des records' }).click()
    await page.getByRole('option', { name: 'Depuis toujours' }).click()
    await expect(bestKm).toContainText('02:30')

    // The record opens its outing's detail, which says it beat the first outing's best kilometre.
    await bestKm.click()
    await expect(page).toHaveURL(new RegExp(`/routes/${routeId}\\?tab=outings&outing=${faster}`))
    await expect(page.getByTestId('outing')).toHaveCount(2)
    const record = page.locator(`[data-outing-id="${faster}"]`)
    await expect(record).toContainText('Record !')
    await expect(record).toContainText('1 km')
    await expect(record.getByRole('button', { name: 'Détail' })).toHaveAttribute('aria-expanded', 'true')
  }
  finally {
    expect((await page.request.delete(`/api/routes/${routeId}`)).ok()).toBe(true)
  }
})
