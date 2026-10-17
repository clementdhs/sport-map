import { expect, SEED_OWNER, SEEDED_LOOP_NAME, SEEDED_ROUTE_NAME, test, waitForMap } from '../fixtures'

// The main flows of a family member again, in a browser set to British English (playwright.config.ts): the
// language is detected from it, with English formats. User content (route names, reviews) stays as written.
test.use({ role: 'family' })

test('finds a route on the home map and opens it, in English', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)

  const card = page.getByRole('link', { name: new RegExp(SEEDED_ROUTE_NAME) })
  await expect(card).toContainText('6.05 km')
  await expect(card).toContainText('4.0')
  await expect(card).toContainText('(1 review)')
  await expect(card).toContainText(`by ${SEED_OWNER.displayName}`)
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
  // Members review the routes of others.
  await expect(reviews.getByRole('button', { name: 'Post my review' })).toBeVisible()
})

test('searches routes by name and filters them, in English', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)
  const cards = page.getByTestId('route-results').locator('li a')
  await expect(cards).toHaveCount(2)

  const searchBox = page.getByRole('combobox', { name: 'Search for a place or a route' })
  await searchBox.fill('c')
  await expect(page.getByText('Type at least 2 letters')).toBeVisible()
  await searchBox.fill('crêtes')
  await expect(page.getByRole('option', { name: 'Routes containing “crêtes”' })).toBeVisible()
  await searchBox.press('ArrowDown')
  await searchBox.press('Enter')
  await expect(page.getByRole('paragraph').filter({ hasText: '1 route for “crêtes”' })).toBeVisible()
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText(SEEDED_LOOP_NAME)
  await expect(cards.first()).toContainText('Loop')

  await page.getByRole('button', { name: 'Filters' }).click()
  await page.getByRole('combobox', { name: 'Sport' }).click()
  await page.getByRole('option', { name: 'Hiking' }).click()
  await expect(page.getByRole('paragraph').filter({ hasText: 'No route for “crêtes”' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Filters, 1 active' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Clear the search' }).click()
  await expect(page.getByRole('paragraph').filter({ hasText: 'No route in this area' })).toBeVisible()
})
