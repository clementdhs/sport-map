import { expect, test, waitForMap } from '../fixtures'

// Creating a route again, in a browser set to British English (playwright.config.ts).
test.use({ role: 'account' })

test('draws, saves and deletes a route, in English', async ({ page }) => {
  await page.goto('/routes/create')
  await waitForMap(page)
  // The create panel's modes (#215), drawing by hand first.
  await expect(page.getByRole('tab', { name: 'By hand' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: 'Loop' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Click on the map to place the start.' })).toBeVisible()
  await expect(page.getByText('Already have a track?')).toBeVisible()

  const map = page.locator('.maplibregl-canvas')
  const box = (await map.boundingBox())!
  for (const [x, y] of [[0.3, 0.4], [0.5, 0.6], [0.7, 0.4]] as const) {
    await map.click({ position: { x: box.width * x, y: box.height * y } })
  }
  await expect(page.getByText('Elevation profile')).toBeVisible()

  await page.getByRole('button', { name: 'Add' }).click()
  await map.click({ position: { x: box.width * 0.4, y: box.height * 0.5 } })
  await page.getByRole('textbox', { name: 'Note for point of interest 1' }).fill('Fountain')

  // The shared validation messages are translated too.
  await page.getByRole('button', { name: 'Save the route' }).click()
  await expect(page.getByText('Name required')).toBeVisible()
  await page.getByLabel('Name').fill('English e2e route')
  // The message only goes away when leaving the field, moving the fields below it: leave it before clicking them.
  await page.getByLabel('Name').blur()
  await expect(page.getByText('Name required')).toBeHidden()
  // Private, so the family tests don't find it on the home map.
  const isPublic = page.getByRole('switch', { name: 'Visible to the team' })
  await isPublic.click()
  await expect(isPublic).not.toBeChecked()
  await page.getByRole('button', { name: 'Save the route' }).click()

  await expect(page).toHaveURL(/\/routes\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: 'English e2e route' })).toBeVisible()
  await expect(page.getByText('Private', { exact: true })).toBeVisible()
  const steps = page.getByRole('region', { name: 'Stages' })
  await expect(steps.getByTestId('route-step').first()).toContainText(/Fountain.*Water point/)
  await expect(steps.getByTestId('route-step').last()).toContainText('Finish')

  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Delete the route' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete this route?' })
  await dialog.getByRole('button', { name: 'Delete' }).click()
  // The toast, and its copy for screen readers.
  await expect(page.getByText('Route deleted').first()).toBeVisible()
})
