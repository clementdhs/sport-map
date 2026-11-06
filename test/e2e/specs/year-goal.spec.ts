import type { Page } from '@playwright/test'
import { expect, test, waitForHydration } from '../fixtures'

// The member's goal for the year (#141): set on their profile, kept in their account with the preferences,
// shown as a gauge with the pace, and never on their public profile.
test.use({ role: 'account' })

const saved = (page: Page) => page.waitForResponse(response =>
  /\/api\/profile\/me\/preferences$/.test(response.url()) && response.request().method() === 'PATCH' && response.ok())

test('a goal set on the profile shows its gauge on every device, privately', async ({ page, newDevice, accountRouteId }) => {
  await page.goto('/profile')
  await waitForHydration(page)
  const goal = page.getByTestId('year-goal')
  // The app's year is the French one.
  const year = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date()).slice(0, 4)

  await goal.getByRole('button', { name: `Fixer un objectif pour ${year}` }).click()
  const dialog = page.getByRole('dialog', { name: 'Objectif de l\'année' })
  await expect(dialog.getByRole('spinbutton', { name: 'Objectif (km)' })).toHaveValue(/1\s?000/)
  const chosen = saved(page)
  await dialog.getByRole('button', { name: 'Enregistrer' }).click()
  await chosen
  expect(await (await page.request.get('/api/profile/me/preferences')).json())
    .toMatchObject({ yearGoal: { metric: 'distance', target: 1000, sport: null } })
  await expect(goal.getByRole('heading', { name: `Objectif ${year}` })).toBeVisible()
  await expect(goal.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '1000')
  await expect(goal).toContainText(/\/ 1\s000 km/)
  await expect(goal.getByTestId('year-goal-status')).toContainText('par semaine')

  // Found on another device, and never shown to the team.
  const computer = await newDevice('account')
  await computer.goto('/profile')
  await waitForHydration(computer)
  await expect(computer.getByTestId('year-goal')).toContainText(/\/ 1\s000 km/)
  await computer.getByRole('link', { name: 'Voir mon profil tel que l\'équipe le voit' }).click()
  await expect(computer.getByTestId('profile-summary')).toBeVisible()
  await expect(computer.getByTestId('year-goal')).toHaveCount(0)

  // At least one outing this year (the route marked as done today) for a goal of one outing: reached.
  expect((await page.request.put(`/api/routes/${accountRouteId}/activity/completed`)).ok()).toBe(true)
  try {
    await page.reload()
    await waitForHydration(page)
    await goal.getByRole('button', { name: 'Modifier l\'objectif' }).click()
    await dialog.getByRole('tab', { name: 'Sorties' }).click()
    const target = dialog.getByRole('spinbutton', { name: 'Objectif (sorties)' })
    await target.fill('1')
    const changed = saved(page)
    await dialog.getByRole('button', { name: 'Enregistrer' }).click()
    await changed
    await expect(goal.getByTestId('year-goal-status')).toHaveText('Objectif atteint, bravo !')

    // Removed: the button to set one comes back.
    await goal.getByRole('button', { name: 'Modifier l\'objectif' }).click()
    const removed = saved(page)
    await dialog.getByRole('button', { name: 'Supprimer l\'objectif' }).click()
    await removed
    await expect(goal.getByRole('button', { name: `Fixer un objectif pour ${year}` })).toBeVisible()
    expect(await (await page.request.get('/api/profile/me/preferences')).json()).toMatchObject({ yearGoal: null })
  }
  finally {
    await page.request.delete(`/api/routes/${accountRouteId}/activity/completed`)
  }
})
