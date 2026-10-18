import type { Page } from '@playwright/test'
import { expect, test, waitForHydration } from '../fixtures'

// Preferences follow the member's account (#145): what one device changes, another finds after a reload, even
// when it was changed offline; and the values a device kept before #145 fill an empty account. Each page here is
// its own device (browser context), signed in as the same member.
test.use({ role: 'account' })

const PREFERENCES_URL = /\/api\/profile\/me\/preferences$/
const isSave = (url: string, method: string) => PREFERENCES_URL.test(url) && method === 'PATCH'
const saved = (page: Page) => page.waitForResponse(response => isSave(response.url(), response.request().method()) && response.ok())
const pending = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('sport-map:preferences-sync') ?? 'null')?.pending)

test('a setting changed on one device is found on another, even when changed offline', async ({ page, context, newDevice }) => {
  await page.goto('/settings#voice')
  await waitForHydration(page)
  const turnedOn = saved(page)
  await page.getByRole('switch', { name: 'Activer le guidage vocal' }).click()
  await turnedOn

  const computer = await newDevice('account')
  await computer.goto('/settings#voice')
  await waitForHydration(computer)
  await expect(computer.getByRole('switch', { name: 'Activer le guidage vocal' })).toBeChecked()
  await expect(computer.getByRole('checkbox', { name: 'Arrivée' })).toBeChecked()

  // Offline, the change applies on the phone and waits there…
  await context.setOffline(true)
  const failed = page.waitForEvent('requestfailed', request => isSave(request.url(), request.method()))
  await page.getByRole('checkbox', { name: 'Arrivée' }).click()
  await failed
  await expect(page.getByRole('checkbox', { name: 'Arrivée' })).not.toBeChecked()
  expect(await pending(page)).toEqual(['voice'])

  // …until the network returns.
  const sent = saved(page)
  await context.setOffline(false)
  await sent
  await expect.poll(() => pending(page)).toEqual([])
  await computer.reload()
  await waitForHydration(computer)
  await expect(computer.getByRole('switch', { name: 'Activer le guidage vocal' })).toBeChecked()
  await expect(computer.getByRole('checkbox', { name: 'Arrivée' })).not.toBeChecked()
})

test('the settings a device kept before #145 fill an empty account', async ({ newDevice }) => {
  // A phone used before #145: its own choices, no trace of an account.
  const phone = await newDevice('account', { 'sport-map:search-scope': 'all', 'sport-map:map-3d': '1' })
  const filled = saved(phone)
  await phone.goto('/settings')
  await filled
  expect(await (await phone.request.get('/api/profile/me/preferences')).json()).toEqual({ searchScope: 'all', map3d: true })

  // The computer then opens the home page on "Tous".
  const computer = await newDevice('account')
  await computer.goto('/')
  await waitForHydration(computer)
  await expect(computer.getByRole('tab', { name: 'Tous' })).toHaveAttribute('aria-selected', 'true')
})
