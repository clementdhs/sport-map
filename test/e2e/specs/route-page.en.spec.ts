import { expect, test } from '../fixtures'

// An error of the server, in a browser set to British English (playwright.config.ts).
test.use({ role: 'family' })

test('shows server errors in English', async ({ page }) => {
  const response = await page.goto('/routes/00000000-0000-0000-0000-000000000000')
  expect(response?.status()).toBe(404)
  await expect(page.getByText('Route not found').first()).toBeVisible()
})
