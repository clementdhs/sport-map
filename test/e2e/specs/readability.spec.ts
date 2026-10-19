import type { Page } from '@playwright/test'
import { expect, test, waitForHydration, waitForMap } from '../fixtures'

// Outdoor readability (#149): larger text and stronger contrast, set in the settings or from follow mode, kept in
// the account, rendered by the server, and laid out on a 360 px phone.
test.use({
  role: 'account',
  searchScope: 'all',
  viewport: { width: 360, height: 740 },
  permissions: ['geolocation'],
  geolocation: { latitude: 45.899, longitude: 6.129, accuracy: 10 },
})

const saved = (page: Page) => page.waitForResponse(response =>
  /\/api\/profile\/me\/preferences$/.test(response.url()) && response.request().method() === 'PATCH' && response.ok())

const rootFontSize = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)

// Nothing wider than the screen: no horizontal scroll, and every element of `locator` inside the viewport.
async function expectFits(page: Page, locator?: ReturnType<Page['locator']>) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
  if (!locator) return
  for (const box of await locator.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().toJSON() as DOMRect))) {
    expect(box.left).toBeGreaterThanOrEqual(0)
    expect(box.right).toBeLessThanOrEqual(360)
  }
}

test('outdoor readability enlarges the text, follows the account and fits a 360 px screen', async ({ page, newDevice }) => {
  await page.goto('/settings#appearance')
  await waitForHydration(page)
  const html = page.locator('html')
  await expect(html).not.toHaveAttribute('data-readability')
  expect(await rootFontSize(page)).toBe('16px')

  const setting = page.getByRole('switch', { name: 'Lisibilité en extérieur' })
  const chosen = saved(page)
  await setting.click()
  await chosen
  await expect(html).toHaveAttribute('data-readability', 'outdoor')
  expect(await rootFontSize(page)).toBe('18px')
  expect(await (await page.request.get('/api/profile/me/preferences')).json()).toMatchObject({ outdoorReadability: true })
  await expectFits(page, page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link'))

  // The server renders it (cookie): no flash of the small text.
  expect(await (await page.request.get('/settings')).text()).toContain('data-readability="outdoor"')

  // Home page: tab bar, panel and route cards.
  await page.goto('/')
  await waitForMap(page)
  await expect(html).toHaveAttribute('data-readability', 'outdoor')
  const cards = page.getByTestId('route-results').locator('li a')
  await expect(cards.first()).toBeVisible()
  await expectFits(page, page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link'))
  await expectFits(page, cards)

  // Follow mode: the shortcut shows it on, the top bar and the "Données" screen fit.
  await page.goto(`/routes/${process.env.E2E_ROUTE_ID}/follow`)
  await waitForMap(page)
  await waitForHydration(page)
  const toggle = page.getByRole('button', { name: 'Lisibilité en extérieur' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Données' }).click()
  const data = page.getByTestId('live-data')
  await expect(data).toBeVisible()
  await expectFits(page, page.getByRole('button'))
  await expectFits(page, data.locator('[data-field]'))

  // Recording: the most crowded top bar (status badge, shortcut, data button) still fits.
  page.on('dialog', dialog => dialog.accept()) // "leave the page?" prompts
  await page.goto('/record')
  await waitForMap(page)
  await page.getByRole('button', { name: 'Démarrer' }).click()
  await expect(page.getByRole('button', { name: 'Données' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Lisibilité en extérieur' })).toHaveAttribute('aria-pressed', 'true')
  await expectFits(page, page.getByRole('button'))
  await page.goto(`/routes/${process.env.E2E_ROUTE_ID}/follow`)
  await waitForMap(page)
  await waitForHydration(page)

  // Another device of the member catches up once the account is loaded.
  const other = await newDevice('account')
  await other.goto('/settings#appearance')
  await waitForHydration(other)
  await expect(other.locator('html')).toHaveAttribute('data-readability', 'outdoor')
  await expect(other.getByRole('switch', { name: 'Lisibilité en extérieur' })).toBeChecked()

  // The shortcut turns it off again, in the account too.
  const off = saved(page)
  await toggle.click()
  await off
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(html).not.toHaveAttribute('data-readability')
  expect(await rootFontSize(page)).toBe('16px')
  expect(await (await page.request.get('/api/profile/me/preferences')).json()).toMatchObject({ outdoorReadability: false })
})
