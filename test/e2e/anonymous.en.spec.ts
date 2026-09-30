import { E2E_USER, expect, SEEDED_LOOP_NAME, SEEDED_ROUTE_NAME, test, waitForHydration, waitForMap } from './fixtures'

// The main visitor flows again, in a browser set to British English (playwright.config.ts): the language is
// detected from it, with English formats. User content (route names, reviews) stays as written.

test('detects the browser language, and keeps the one a visitor picks', async ({ page, context }) => {
  await page.goto('/')
  await waitForHydration(page)
  const html = page.locator('html')
  await expect(html).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('combobox', { name: 'Search for a place or a route' })).toBeVisible()

  await page.getByRole('button', { name: 'Language' }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Français' }).click()
  await expect(html).toHaveAttribute('lang', 'fr')
  await expect(page.getByRole('combobox', { name: 'Rechercher un lieu ou un parcours' })).toBeVisible()

  // Kept in a cookie, and rendered by the server in that language despite the browser's.
  const cookies = await context.cookies()
  expect(cookies.find(cookie => cookie.name === 'sport-map-locale')?.value).toBe('fr')
  const response = await page.reload()
  expect(await response!.text()).toContain('lang="fr"')
  await expect(page.getByRole('button', { name: 'Langue' })).toBeVisible()
})

test('finds a public route on the home map and opens it, in English', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)

  const card = page.getByRole('link', { name: new RegExp(SEEDED_ROUTE_NAME) })
  await expect(card).toContainText('6.05 km')
  await expect(card).toContainText('4.0')
  await expect(card).toContainText('(1 review)')
  await expect(card).toContainText(`by ${E2E_USER.displayName}`)
  await card.click()

  await expect(page).toHaveURL(/\/routes\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: SEEDED_ROUTE_NAME })).toBeVisible()
  await expect(page.getByText('Time', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Weather at the start' })).toContainText('Tomorrow')
  // The link preview image is drawn in the page's language.
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /og\.png\?v=\d+&lang=en$/)
  await page.getByRole('button', { name: 'More actions' }).click()
  await expect(page.getByRole('menuitem', { name: 'Export as GPX' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: /Reviews/ }).click()
  const reviews = page.getByRole('region', { name: 'Reviews', exact: true })
  await expect(reviews).toContainText('1 review')
  await expect(reviews.getByRole('link', { name: 'Sign in' })).toBeVisible()
})

test('searches routes by name and filters them, in English', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)
  const cards = page.locator('aside li a')
  await expect(cards).toHaveCount(2)

  const searchBox = page.getByRole('combobox', { name: 'Search for a place or a route' })
  await searchBox.fill('c')
  await expect(page.getByText('Type at least 2 letters')).toBeVisible()
  await searchBox.fill('crêtes')
  await expect(page.getByRole('option', { name: 'Routes containing “crêtes”' })).toBeVisible()
  await searchBox.press('ArrowDown')
  await searchBox.press('Enter')
  await expect(page.getByText('1 route for “crêtes”')).toBeVisible()
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText(SEEDED_LOOP_NAME)
  await expect(cards.first()).toContainText('loop')

  await page.getByRole('button', { name: 'Filters' }).click()
  await page.getByRole('combobox', { name: 'Sport' }).click()
  await page.getByRole('option', { name: 'Hiking' }).click()
  await expect(page.getByText('No route for “crêtes”')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Filters, 1 active' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Clear the search' }).click()
  await expect(page.getByText('No route in this area')).toBeVisible()
})

test('shows server errors in English', async ({ page }) => {
  const response = await page.goto('/routes/00000000-0000-0000-0000-000000000000')
  expect(response?.status()).toBe(404)
  await expect(page.getByText('Route not found').first()).toBeVisible()
})
