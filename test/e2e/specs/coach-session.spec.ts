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
    // The member's week (#283): 4 outings, whose days must be as many, the long run on one of them.
    await dialog.getByTestId('coach-goal-outings').getByRole('button', { name: '4', exact: true }).click()
    const dayPills = dialog.getByTestId('coach-goal-days')
    for (const day of ['mar.', 'jeu.', 'dim.']) await dayPills.getByRole('button', { name: day }).click()
    await dialog.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(dialog).toContainText('Choisis autant de jours que de sorties, ou aucun')
    await dayPills.getByRole('button', { name: 'sam.' }).click()
    await expect(dialog.getByTestId('coach-goal-long-run').getByRole('button', { name: 'lun.' })).toHaveCount(0)
    await dialog.getByTestId('coach-goal-long-run').getByRole('button', { name: 'dim.' }).click()
    await dialog.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(dialog).toBeHidden()
    await expect(goalText).toContainText('course de 21 km et 300 m D+')
    const week = page.getByTestId('coach-goal-week')
    await expect(week).toHaveText('4 sorties / sem. : mar., jeu., sam., dim.')
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
    // The 50 km outings leave room for an hour (#281), and the easy pace says where it comes from.
    await expect(page.getByTestId('coach-session-capped')).toBeHidden()
    await expect(page.getByTestId('coach-session-pace-source').getByRole('link', { name: 'La régler' })).toHaveAttribute('href', '/settings#paces')
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
    const todayTitle = await title.textContent()

    // Another day (#279): the session of that day, with the time chosen so far, its own choices kept apart.
    const days = page.getByTestId('coach-session-days')
    const tomorrow = days.getByRole('button', { name: 'Demain' })
    await expect(days.getByRole('button', { name: 'Aujourd\'hui' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('coach-session-ahead')).toBeHidden()
    await tomorrow.click()
    await expect(tomorrow).toHaveAttribute('aria-pressed', 'true')
    await expect(session).toHaveAttribute('data-day', (await tomorrow.getAttribute('data-day'))!)
    await expect(session).toHaveAttribute('data-minutes', '120')
    await expect(page.getByTestId('coach-session-heading')).toContainText('Séance prévue')
    await expect(page.getByTestId('coach-session-ahead')).toBeVisible()
    await durations.getByRole('button', { name: '45 min' }).click()
    await expect(session).toHaveAttribute('data-minutes', '45')
    await days.getByRole('button', { name: 'Aujourd\'hui' }).click()
    await expect(session).toHaveAttribute('data-minutes', '120')
    await expect(title).toHaveText(todayTitle!)
    await expect(page.getByTestId('coach-session-heading')).toContainText('Séance du jour')

    // Kept in the account; the day and its duration in this browser.
    await tomorrow.click()
    await expect(session).toHaveAttribute('data-minutes', '45')
    await page.reload()
    await waitForHydration(page)
    await expect(goalText).toHaveText('Reprendre en douceur')
    await expect(week).toHaveText('4 sorties / sem. : mar., jeu., sam., dim.')
    await expect(tomorrow).toHaveAttribute('aria-pressed', 'true')
    await expect(session).toHaveAttribute('data-minutes', '45')
  }
  finally {
    expect((await page.request.delete(`/api/routes/${routeId}`)).ok()).toBe(true)
    expect((await page.request.put('/api/profile/me/coach-goal', { data: { kind: 'progress' } })).ok()).toBe(true)
  }
})
