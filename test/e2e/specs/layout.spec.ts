import { ACCOUNT_ROUTE_NAME, expect, test, waitForHydration, waitForMap } from '../fixtures'

// A family member moves the bottom sheet and the side panel; the test account goes through the map pages.
test.use({ role: 'family' })

test.describe('as the test account', () => {
  test.use({ role: 'account' })

  // Map pages have no header: a floating bar (back, logo, account menu) and the main buttons over the map.
  for (const device of [{ name: 'phone', width: 375, height: 812 }, { name: 'computer', width: 1280, height: 800 }]) {
    test(`reaches the account menu, creation, recording and back from the map pages, on a ${device.name}`, async ({ page }) => {
      await page.setViewportSize({ width: device.width, height: device.height })
      await page.goto('/')
      await waitForMap(page)
      await expect(page.getByRole('banner')).toHaveCount(0)
      // Nothing to go back to from the home page.
      await expect(page.getByRole('button', { name: 'Retour' })).toHaveCount(0)

      await page.getByRole('link', { name: 'Créer un parcours' }).click()
      await expect(page).toHaveURL(/\/routes\/create$/)
      await waitForMap(page)
      await page.getByRole('button', { name: 'Retour' }).click()
      await expect(page).toHaveURL(/\/$/)

      await page.getByRole('link', { name: 'Enregistrer une sortie' }).click()
      await expect(page).toHaveURL(/\/record$/)
      await page.getByRole('link', { name: 'Quitter' }).click()
      await expect(page).toHaveURL(/\/$/)

      // Opened from the profile, a route goes back to it; opened directly, to the home page.
      await page.getByRole('button', { name: 'Mon compte' }).click()
      await page.getByRole('menuitem', { name: 'Mon profil' }).click()
      await expect(page).toHaveURL(/\/profile$/)
      await expect(page.getByRole('banner')).toBeVisible()
      await page.getByRole('link', { name: new RegExp(ACCOUNT_ROUTE_NAME) }).click()
      await expect(page.getByRole('heading', { name: ACCOUNT_ROUTE_NAME, level: 1 })).toBeVisible()
      const routeUrl = page.url()
      await page.getByRole('button', { name: 'Retour' }).click()
      await expect(page).toHaveURL(/\/profile$/)

      await page.goto(routeUrl)
      await waitForHydration(page)
      await page.getByRole('button', { name: 'Retour' }).click()
      await expect(page).toHaveURL(/\/$/)
    })
  }
})

test('moves the bottom sheet over the map on a phone with its buttons, the keyboard or a drag', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await waitForMap(page)
  const sheet = page.locator('aside[data-sheet]')
  const collapse = sheet.getByRole('button', { name: 'Réduire le panneau' })
  const expand = sheet.getByRole('button', { name: 'Agrandir le panneau' })
  await expect(sheet).toHaveAttribute('data-sheet', 'half')
  await expect(sheet).toContainText('2 parcours dans cette zone')

  // Collapsed, only its title stays; the hidden content leaves the keyboard and screen reader order.
  await collapse.click()
  await expect(sheet).toHaveAttribute('data-sheet', 'collapsed')
  await expect(collapse).toBeDisabled()
  await expect(sheet.locator('[inert]')).toHaveCount(1)

  await expand.focus()
  await page.keyboard.press('Enter')
  await expect(sheet).toHaveAttribute('data-sheet', 'half')
  await expect(sheet.locator('[inert]')).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(sheet).toHaveAttribute('data-sheet', 'full')
  await expect(expand).toBeDisabled()

  // Dragging its header: to the bottom collapses it, then a third of the way up opens it at half height.
  // Once its height animation is over, the full sheet starts right under the floating top bar, still reachable.
  await expect(async () => expect((await sheet.boundingBox())!.y).toBeLessThan(100)).toPass()
  await expect(page.getByRole('button', { name: 'Mon compte' })).toBeInViewport()
  await expect(page.getByRole('link', { name: 'Créer un parcours' })).toHaveCount(0)
  const header = (await sheet.getByText('2 parcours dans cette zone').first().boundingBox())!
  const x = header.x + 40
  await page.mouse.move(x, header.y + 5)
  await page.mouse.down()
  await page.mouse.move(x, 805, { steps: 10 })
  await page.mouse.up()
  await expect(sheet).toHaveAttribute('data-sheet', 'collapsed')

  await page.mouse.move(x, 780)
  await page.mouse.down()
  await page.mouse.move(x, 550, { steps: 5 })
  await page.mouse.up()
  await expect(sheet).toHaveAttribute('data-sheet', 'half')
})

test('collapses the side panel on a computer and remembers it after a reload', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)
  const panel = page.locator('aside[data-panel]')
  const map = page.locator('[data-map-loaded]')
  const collapse = page.getByRole('button', { name: 'Réduire le panneau' })
  const show = page.getByRole('button', { name: 'Afficher le panneau' })
  const title = page.getByText('2 parcours dans cette zone').filter({ visible: true })
  const width = (await map.boundingBox())!.width
  await expect(collapse).toHaveAttribute('aria-expanded', 'true')

  // The map takes the whole width; the panel's title floats over it, beside the button reopening it.
  await collapse.click()
  await expect(panel).toBeHidden()
  await expect(panel).toHaveAttribute('data-panel', 'collapsed')
  await expect(show).toBeFocused()
  await expect(show).toHaveAttribute('aria-expanded', 'false')
  await expect(title).toBeVisible()
  await expect(async () => expect((await map.boundingBox())!.width).toBeGreaterThan(width + 300)).toPass()

  await page.reload()
  await waitForMap(page)
  await expect(panel).toHaveAttribute('data-panel', 'collapsed')
  await expect(panel).toBeHidden()

  await show.focus()
  await page.keyboard.press('Enter')
  await expect(panel).toBeVisible()
  await expect(collapse).toBeFocused()
  await expect(show).toHaveCount(0)
  await page.reload()
  await waitForMap(page)
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('2 parcours dans cette zone')
})

test('resizes the side panel with the mouse or the keyboard and remembers its width', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)
  const panel = page.locator('aside[data-panel]')
  const edge = page.getByRole('separator', { name: 'Redimensionner le panneau' })
  await expect(edge).toHaveAttribute('aria-valuenow', '384')
  await expect(edge).toHaveAttribute('aria-valuemin', '320')
  await expect(edge).toHaveAttribute('aria-valuemax', '720')

  // Dragging its edge 200 px to the left widens it as much; far to the right stops at the narrowest panel.
  const box = (await edge.boundingBox())!
  const x = box.x + box.width / 2
  await page.mouse.move(x, 300)
  await page.mouse.down()
  await page.mouse.move(x - 200, 300, { steps: 10 })
  await page.mouse.up()
  await expect(edge).toHaveAttribute('aria-valuenow', '584')
  expect((await panel.boundingBox())!.width).toBeCloseTo(584, 0)
  await page.mouse.move(x - 200, 300)
  await page.mouse.down()
  await page.mouse.move(x + 300, 300, { steps: 5 })
  await page.mouse.up()
  await expect(edge).toHaveAttribute('aria-valuenow', '320')

  await edge.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(edge).toHaveAttribute('aria-valuenow', '336')
  await page.keyboard.press('End')
  await expect(edge).toHaveAttribute('aria-valuenow', '720')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(edge).toHaveAttribute('aria-valuenow', '656')

  await page.reload()
  await waitForMap(page)
  await expect(edge).toHaveAttribute('aria-valuenow', '656')
  expect((await panel.boundingBox())!.width).toBeCloseTo(656, 0)
})
