import type { Page } from '@playwright/test'
import { expect, test, waitForHydration } from '../fixtures'

// The coach's form of the moment (#263): the load of the last 7 days against the 4 weeks before, worked out in the
// browser from the profile's outings.
test.use({ role: 'account' })

const DAY = 86_400_000

async function addOuting(page: Page, routeId: string, daysAgo: number) {
  const response = await page.request.post(`/api/routes/${routeId}/outings`, {
    data: { started_at: new Date(Date.now() - daysAgo * DAY - 3_600_000).toISOString(), duration_s: 3000, moving_s: 3000, distance_m: 50_000 },
  })
  expect(response.ok()).toBe(true)
}

test('a member with dated outings sees their form, then an overload', async ({ page }) => {
  // A private route of about 50 km: its load dwarfs the short outings other tests leave on the account.
  const { id: routeId } = await (await page.request.post('/api/routes', {
    data: { name: 'Forme du coach e2e', sport_type: 'running', is_public: false, coordinates: [[6.1, 45.9], [6.1, 46.35]] },
  })).json() as { id: string }

  try {
    // Two outings a week for the 4 weeks before, two in the last 7 days: as much as usual.
    for (const daysAgo of [8, 12, 15, 19, 22, 26, 29, 33, 1, 3]) await addOuting(page, routeId, daysAgo)

    await page.goto('/coach/forme')
    await waitForHydration(page)
    const state = page.getByTestId('coach-form-state')
    await expect(state).toHaveAttribute('data-state', 'progress')
    await expect(state).toContainText('En progression')
    await expect(page.getByRole('meter', { name: 'Forme du moment' })).toBeVisible()
    await expect(page.getByTestId('form-week')).toHaveCount(8)
    await expect(page.getByTestId('coach-form-outings').getByRole('listitem').filter({ hasText: 'Forme du coach e2e' })).toHaveCount(2)
    await expect(page.getByRole('table')).toContainText('Charge')

    // Two more outings this week: twice the usual load.
    await addOuting(page, routeId, 2)
    await addOuting(page, routeId, 4)
    await page.reload()
    await waitForHydration(page)
    await expect(state).toHaveAttribute('data-state', 'overload')
    await expect(state).toContainText('En surcharge')
    await expect(page.getByTestId('coach-form-outings').getByRole('listitem').filter({ hasText: 'Forme du coach e2e' })).toHaveCount(4)
  }
  finally {
    expect((await page.request.delete(`/api/routes/${routeId}`)).ok()).toBe(true)
  }
})
