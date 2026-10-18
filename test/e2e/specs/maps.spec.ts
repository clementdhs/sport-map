import { expect, mockReliefStyle, test, waitForHydration, waitForMap } from '../fixtures'

test.use({ role: 'account' })

test('switches the basemap to Plan IGN and keeps it on the device', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)
  await waitForHydration(page)
  const attribution = page.locator('.maplibregl-ctrl-attrib-inner')
  await expect(attribution).not.toContainText('IGN')

  // Picked in the "Calques" panel (#104).
  await page.getByRole('button', { name: 'Calques' }).click()
  await expect(page.getByRole('radio', { name: 'MapTiler Outdoor' })).toBeChecked()
  await page.getByRole('radio', { name: 'Plan IGN' }).click()
  await expect(attribution).toContainText('Plan IGN')

  // Remembered on the device: the map opens on it again.
  await page.reload()
  await waitForMap(page)
  await expect(attribution).toContainText('Plan IGN')
  await waitForHydration(page)
  await page.getByRole('button', { name: 'Calques' }).click()
  await expect(page.getByRole('radio', { name: 'Plan IGN' })).toBeChecked()
})

test('keeps the map controls compact on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await waitForMap(page)
  await waitForHydration(page)
  // Pinching zooms; the compass only shows while the map is turned.
  const compass = page.getByRole('button', { name: 'Réorienter vers le nord' })
  await expect(page.getByRole('button', { name: 'Calques' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Zoom avant' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Zoom arrière' })).toBeHidden()
  await expect(compass).toBeHidden()

  await page.locator('.maplibregl-canvas').focus()
  await page.keyboard.press('Shift+ArrowRight')
  await expect(compass).toBeVisible()
  await compass.click()
  await expect(page.locator('[data-map-loaded]')).toHaveAttribute('data-map-bearing', '0')
  await expect(compass).toBeHidden()

  // A computer keeps the zoom buttons and the compass.
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(page.getByRole('button', { name: 'Zoom avant' })).toBeVisible()
  await expect(compass).toBeVisible()
})

test('explains the map in a legend that follows the basemap shown', async ({ page }) => {
  const ignLegendRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('PLANIGNV2-legend')) ignLegendRequests.push(request.url())
  })
  await page.goto('/')
  await waitForMap(page)
  await waitForHydration(page)

  // Opened with the keyboard from the "Calques" panel, in its place: a popover on a computer.
  const layers = page.getByRole('button', { name: 'Calques' })
  const panel = page.getByRole('dialog', { name: 'Calques' })
  await layers.focus()
  await page.keyboard.press('Enter')
  await panel.getByRole('button', { name: 'Légende' }).press('Enter')
  const legend = page.getByRole('dialog', { name: 'Légende' })
  await expect(panel).toHaveCount(0)
  await expect(legend.getByRole('tab', { name: 'Fond de carte' })).toHaveAttribute('aria-selected', 'true')
  await expect(legend.getByText('MapTiler Outdoor')).toBeVisible()
  // The fixtures' empty style has none of MapTiler's layers: no basemap part.
  await expect(legend.getByText('Pas de légende pour ce fond de carte.')).toBeVisible()
  await expect(legend.locator('[data-legend-sample]')).toHaveCount(0)

  // The app's own symbols, whatever the basemap.
  await legend.getByRole('tab', { name: 'Tracés et symboles' }).click()
  await expect(legend.getByText('Départ', { exact: true })).toBeVisible()
  await expect(legend.getByText('Point d\'eau')).toBeVisible()
  await expect(legend.getByText('Ta position et ta direction')).toBeVisible()
  await expect(legend.getByText('Plus de 15 %')).toBeVisible()

  // Closed, focus goes back to the panel's button.
  await page.keyboard.press('Escape')
  await expect(legend).toHaveCount(0)
  await expect(layers).toBeFocused()

  // Under Plan IGN, it shows the official legend, loaded only now.
  expect(ignLegendRequests).toEqual([])
  await layers.click()
  await panel.getByRole('radio', { name: 'Plan IGN' }).click()
  await panel.getByRole('button', { name: 'Légende' }).click()
  // It reopens on the tab left open.
  await expect(legend.getByRole('tab', { name: 'Tracés et symboles' })).toHaveAttribute('aria-selected', 'true')
  await legend.getByRole('tab', { name: 'Fond de carte' }).click()
  await expect(legend.getByRole('img', { name: 'Légende officielle du Plan IGN' })).toBeVisible()
  expect(ignLegendRequests).toHaveLength(1)
  // The panel opens in its place again.
  await layers.click()
  await expect(panel).toBeVisible()
  await expect(legend).toHaveCount(0)
  await page.keyboard.press('Escape')

  // A drawer on a phone, which takes focus.
  await page.setViewportSize({ width: 390, height: 844 })
  await layers.click()
  await panel.getByRole('button', { name: 'Légende' }).click()
  await expect(legend.getByRole('heading', { name: 'Légende' })).toBeVisible()
  await expect(legend).toBeFocused()
  await expect(legend.getByText('Plan IGN', { exact: true })).toBeVisible()
})

test('offers the 3D view when the style has elevations, and keeps it on the device', async ({ page }) => {
  const layers = page.getByRole('button', { name: 'Calques' })
  const view3d = page.getByRole('switch', { name: 'Vue 3D (relief)' })
  // The fixtures' empty style has no elevation source: no 3D switch in the "Calques" panel.
  await page.goto('/')
  await waitForMap(page)
  await layers.click()
  await expect(page.getByRole('radio', { name: 'Plan IGN' })).toBeVisible()
  await expect(view3d).toHaveCount(0)

  await mockReliefStyle(page)
  await page.reload()
  await waitForMap(page)
  await waitForHydration(page)
  await layers.click()
  await expect(view3d).toHaveAttribute('aria-checked', 'false')
  await view3d.click()
  await expect(view3d).toHaveAttribute('aria-checked', 'true')

  // Remembered on the device, and offered on the route page too. The switch shows once the style is read: a
  // map opening in 3D isn't awaited, since drawing the relief without a GPU (CI runners) takes over 15 s.
  await page.reload()
  await layers.click()
  await expect(view3d).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 })
  await page.goto(`/routes/${process.env.E2E_ROUTE_ID}`)
  await layers.click()
  await expect(view3d).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 })
  // Follow mode stays in 2D.
  await page.goto(`/routes/${process.env.E2E_ROUTE_ID}/follow`)
  await waitForMap(page)
  await layers.click()
  await expect(page.getByRole('radio', { name: 'Plan IGN' })).toBeVisible()
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
