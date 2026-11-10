import type { Page } from '@playwright/test'
import { expect, test, waitForHydration } from '../fixtures'

// The session of the day (#264): picked from the form, the goal and the time available.
test.use({ role: 'account' })

const DAY = 86_400_000

async function addOuting(page: Page, routeId: string, daysAgo: number) {
  const response = await page.request.post(`/api/routes/${routeId}/outings`, {
    data: { started_at: new Date(Date.now() - daysAgo * DAY - 3_600_000).toISOString(), duration_s: 3000, moving_s: 3000, distance_m: 50_000 },
  })
  expect(response.ok()).toBe(true)
}

test('a member picks a goal, and the time available changes the session', async ({ page }) => {
  // Steady outings on a private ~50 km route over 5 weeks, like coach-form.spec.ts: the coach judges the form
  // (progress), whatever the short outings other tests leave on the account.
  const { id: routeId } = await (await page.request.post('/api/routes', {
    data: { name: 'Séance du coach e2e', sport_type: 'running', is_public: false, coordinates: [[6.1, 45.9], [6.1, 46.35]] },
  })).json() as { id: string }

  try {
    for (const daysAgo of [8, 12, 15, 19, 22, 26, 29, 33, 1, 3]) await addOuting(page, routeId, daysAgo)

    await page.goto('/coach')
    await waitForHydration(page)
    await expect(page.getByTestId('coach-form-card')).toBeVisible()
    const goalText = page.getByTestId('coach-goal-text')
    await expect(goalText).toHaveText('pas encore choisi')

    // A race in 30 days, then saved and shown at the top of the page.
    await page.getByTestId('coach-goal-edit').click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: /Préparer une course/ }).click()
    const date = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10)
    await dialog.getByLabel('Date').fill(date)
    await dialog.getByLabel('Distance (km)').fill('21')
    await dialog.getByLabel('D+ (m)').fill('300')
    await dialog.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(dialog).toBeHidden()
    await expect(goalText).toContainText('course de 21 km et 300 m D+')
    await expect(page.getByTestId('coach-goal')).toContainText('dans 4 sem.')

    // Easing back in: easy sessions only, whose length follows the time available.
    await page.getByTestId('coach-goal-edit').click()
    await dialog.getByRole('button', { name: /Reprendre en douceur/ }).click()
    await dialog.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(dialog).toBeHidden()
    await expect(goalText).toHaveText('Reprendre en douceur')

    const session = page.getByTestId('coach-session')
    const durations = page.getByTestId('coach-session-durations')
    await expect(durations.getByRole('button', { name: '1 h', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(session).toHaveAttribute('data-minutes', '60')
    await expect(page.getByTestId('coach-session-title')).toHaveText('Sortie en endurance')
    const hourDistance = await page.getByTestId('coach-session-distance').textContent()

    await durations.getByRole('button', { name: '30 min' }).click()
    await expect(session).toHaveAttribute('data-minutes', '30')
    await expect(page.getByTestId('coach-session-distance')).not.toHaveText(hourDistance!)
    await expect(page.getByTestId('coach-session-other')).toBeHidden()

    // Two hours: a long run or an endurance run, "Autre séance" goes from one to the other.
    await durations.getByRole('button', { name: '2 h' }).click()
    await expect(session).toHaveAttribute('data-minutes', '120')
    const title = page.getByTestId('coach-session-title')
    const first = await title.textContent()
    await page.getByTestId('coach-session-other').click()
    await expect(title).not.toHaveText(first!)
    await expect(title).toHaveText(first === 'Sortie longue' ? 'Sortie en endurance' : 'Sortie longue')

    // Kept in the account.
    await page.reload()
    await waitForHydration(page)
    await expect(goalText).toHaveText('Reprendre en douceur')
  }
  finally {
    expect((await page.request.delete(`/api/routes/${routeId}`)).ok()).toBe(true)
    expect((await page.request.put('/api/profile/me/coach-goal', { data: { kind: 'progress' } })).ok()).toBe(true)
  }
})
