import type { Page } from '@playwright/test'
import { expect, test, waitForHydration } from '../fixtures'

// The best weather slot of the session of the day (#265). The fake Open-Meteo of the global setup is dry and mild
// today, with the place at 9 o'clock, so there is always daylight left; the worker's account owns a route, whose
// start is its usual place.
test.use({ role: 'account' })

// The slot starts on the hour: the band highlights one cell per hour it touches.
async function expectSlotCells(page: Page) {
  const minutes = Number(await page.getByTestId('coach-session').getAttribute('data-minutes'))
  await expect(page.getByTestId('coach-weather').locator('li[data-in-slot]')).toHaveCount(Math.ceil(minutes / 60))
}

test('shows the best slot for the session, following the time available', async ({ page }) => {
  await page.goto('/coach')
  await waitForHydration(page)
  const weather = page.getByTestId('coach-weather')
  await expect(page.getByTestId('coach-weather-slot')).toContainText(/Meilleur créneau : \d+ h( \d+)? – \d+ h( \d+)? · \d+°, sans pluie/)
  await expect(weather.getByRole('listitem')).toHaveCount(6)
  await expect(weather.getByRole('link', { name: 'Open-Meteo.com' })).toHaveAttribute('href', 'https://open-meteo.com/')
  await expectSlotCells(page)

  const durations = page.getByTestId('coach-session-durations')
  for (const name of ['30 min', '1 h 30', '2 h']) {
    const button = durations.getByRole('button', { name, exact: true })
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await expectSlotCells(page)
  }
})

test('without the forecast, the session shows alone', async ({ page }) => {
  // Offline, or Open-Meteo out of order.
  await page.route('**/api/profile/me/coach-weather*', route => route.abort('internetdisconnected'))
  await page.goto('/coach')
  await waitForHydration(page)
  await expect(page.getByTestId('coach-session')).toBeVisible()
  await expect(page.getByTestId('coach-weather')).toBeHidden()
})
