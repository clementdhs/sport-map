import { expect, mockReliefStyle, test, waitForHydration, waitForMap } from '../fixtures'

test.use({ role: 'account' })

test('switches the basemap to Plan IGN and keeps it on the device', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)
  await waitForHydration(page)
  const attribution = page.locator('.maplibregl-ctrl-attrib-inner')
  await expect(attribution).not.toContainText('IGN')

  await page.getByRole('button', { name: 'Fond de carte' }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: 'MapTiler Outdoor' })).toBeChecked()
  await page.getByRole('menuitemcheckbox', { name: 'Plan IGN' }).click()
  await expect(attribution).toContainText('Plan IGN')

  // Remembered on the device: the map opens on it again.
  await page.reload()
  await waitForMap(page)
  await expect(attribution).toContainText('Plan IGN')
  await waitForHydration(page)
  await page.getByRole('button', { name: 'Fond de carte' }).click()
  await expect(page.getByRole('menuitemcheckbox', { name: 'Plan IGN' })).toBeChecked()
})

test('offers the 3D view when the style has elevations, and keeps it on the device', async ({ page }) => {
  const view3d = page.getByRole('button', { name: 'Vue 3D (relief)' })
  // The fixtures' empty style has no elevation source: no 3D button.
  await page.goto('/')
  await waitForMap(page)
  await expect(page.getByRole('button', { name: 'Fond de carte' })).toBeVisible()
  await expect(view3d).toHaveCount(0)

  await mockReliefStyle(page)
  await page.reload()
  await waitForMap(page)
  await waitForHydration(page)
  await expect(view3d).toHaveAttribute('aria-pressed', 'false')
  await view3d.click()
  await expect(view3d).toHaveAttribute('aria-pressed', 'true')

  // Remembered on the device, and offered on the route page too. The button shows once the style is read: a
  // map opening in 3D isn't awaited, since drawing the relief without a GPU (CI runners) takes over 15 s.
  await page.reload()
  await expect(view3d).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 })
  await page.goto(`/routes/${process.env.E2E_ROUTE_ID}`)
  await expect(view3d).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 })
  // Follow mode stays in 2D.
  await page.goto(`/routes/${process.env.E2E_ROUTE_ID}/follow`)
  await waitForMap(page)
  await expect(page.getByRole('button', { name: 'Fond de carte' })).toBeVisible()
  await expect(view3d).toHaveCount(0)
})

test('flies over a route, and goes back to the starting view when stopped', async ({ page }) => {
  // The fixtures' empty style has no relief: the flyover only tilts the camera, which CI runners draw quickly.
  await page.goto(`/routes/${process.env.E2E_ROUTE_ID}`)
  await waitForMap(page)
  await waitForHydration(page)
  const map = page.locator('[data-map-loaded]')
  const startingView = await map.getAttribute('data-map-center')
  const controls = page.getByRole('group', { name: 'Commandes du survol' })
  const position = controls.getByRole('slider', { name: 'Position du survol' })

  await page.getByRole('button', { name: 'Survol 3D' }).click()
  await expect(controls).toBeVisible()
  // The moving point advances, on the controls' profile and on the route's.
  await expect.poll(async () => Number(await position.getAttribute('aria-valuenow'))).toBeGreaterThan(0)
  await expect(page.getByTestId('profile-flyover-marker')).toBeVisible()

  await controls.getByRole('button', { name: 'Pause' }).click()
  await expect(controls.getByRole('button', { name: 'Lecture' })).toBeVisible()
  await controls.getByRole('button', { name: 'Vitesse ×1' }).click()
  await expect(controls.getByRole('button', { name: 'Vitesse ×2' })).toBeVisible()
  // Moved to the arrival with the keyboard: the flyover is over and can start again.
  await position.press('End')
  await expect(position).toHaveAttribute('aria-valuenow', (await position.getAttribute('aria-valuemax'))!)
  await expect(controls.getByRole('button', { name: 'Rejouer' })).toBeVisible()

  await controls.getByRole('button', { name: 'Arrêter le survol' }).click()
  await expect(controls).toHaveCount(0)
  await expect(page.getByTestId('profile-flyover-marker')).toHaveCount(0)
  await expect(map).toHaveAttribute('data-map-center', startingView!)
})
