import { expect, test, waitForHydration, waitForMap } from '../fixtures'

test.use({ role: 'account' })

test.describe('recording an outing', () => {
  const START = { latitude: 45.9, longitude: 6.12, accuracy: 5 }
  test.use({ permissions: ['geolocation'], geolocation: START })

  test('records an outing, survives a page reload, and saves it as a completed route', async ({ page, context }) => {
    // Many steps and two map loads: more than the default 30 s on the CI runners.
    test.slow()
    // Fake clock: the recorder times fixes with Date.now().
    await page.clock.install({ time: new Date('2026-09-28T08:00:00Z') })
    page.on('dialog', dialog => dialog.accept()) // "leave the page?" prompts
    // `meters` north of the start, one fix per simulated minute.
    const walkTo = async (meters: number) => {
      // Jumps a minute ahead (runFor would also replay every stopwatch tick in between, slowly).
      await page.clock.fastForward(60_000)
      await context.setGeolocation({ ...START, latitude: START.latitude + meters / 111_194.93 })
    }
    const distance = page.getByTestId('distance')

    await page.goto('/record')
    await waitForMap(page)
    await expect(page.getByText(/Précision GPS/)).toBeVisible()
    await page.getByRole('button', { name: 'Démarrer' }).click()
    await expect(page.getByText('Enregistrement', { exact: true })).toBeVisible()

    for (let i = 1; i <= 4; i++) {
      await walkTo(i * 100)
      await expect(distance).toHaveText(`${i}00 m`)
    }

    // Paused: moving doesn't count.
    await page.getByRole('button', { name: 'Pause' }).click()
    await walkTo(450)
    await expect(distance).toHaveText('400 m')
    await page.getByRole('button', { name: 'Reprendre' }).click()

    // The page closes by accident: the outing is kept on the phone.
    await page.reload()
    await waitForMap(page)
    await expect(page.getByText(/n'est pas terminée/)).toBeVisible()
    await page.getByRole('button', { name: 'Reprendre' }).click()
    await expect(distance).toHaveText('400 m')

    for (let i = 5; i <= 12; i++) await walkTo(i * 100)
    await expect(distance).toHaveText('1,20 km')

    await page.getByRole('button', { name: 'Terminer' }).click()
    const dialog = page.getByRole('dialog', { name: 'Terminer la sortie' })
    await expect(dialog.getByLabel('Nom')).toHaveValue('Sortie du 28 septembre 2026')
    await dialog.getByRole('button', { name: 'Enregistrer' }).click()

    await expect(page).toHaveURL(/\/routes\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { name: 'Sortie du 28 septembre 2026' })).toBeVisible()
    await expect(page.getByText('Enregistré au GPS')).toBeVisible()
    await expect(page.getByText('Privé', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Fait le/ })).toBeVisible()
    await expect(page.getByText(/Ta sortie : \d+ min, dont \d+ min en mouvement/)).toBeVisible()
    // Its first outing.
    await page.getByRole('tab', { name: /Passages/ }).click()
    await expect(page.getByTestId('outing')).toHaveCount(1)
    // Its pace chart and splits, from the GPS points kept with it: a full kilometre, then the last 200 m.
    await page.getByTestId('outing').getByRole('button', { name: 'Détail' }).click()
    const detail = page.getByTestId('outing-detail')
    await expect(detail.getByRole('img', { name: /^Allure \(min\/km\) : de [\d:]+ à [\d:]+ \/km sur 1,20 km$/ })).toBeVisible()
    await expect(detail.getByRole('rowheader')).toHaveText(['1', '200 m'])
    await expect(detail.getByTestId('split').first()).toContainText(/\d+:\d\d \/km/)

    // Replayed in a flyover, at its own pace: the controls give its moving time, the chart shows the point.
    await detail.getByRole('button', { name: 'Rejouer en 3D' }).click()
    const controls = page.getByRole('group', { name: 'Commandes du survol' })
    await expect(controls).toBeVisible()
    await expect(detail.getByTestId('chart-flyover-marker')).toBeVisible()
    await controls.getByRole('button', { name: 'Pause' }).click()
    await controls.getByRole('slider', { name: 'Position du survol' }).press('End')
    await expect(controls).toContainText(/1,20 km \/ 1,20 km · \d+ min/)
    await controls.getByRole('button', { name: 'Arrêter le survol' }).click()
    await expect(controls).toHaveCount(0)
    await expect(detail.getByTestId('chart-flyover-marker')).toHaveCount(0)

    // Listed among the completed routes of the profile, with its times.
    await page.goto('/profile')
    await waitForHydration(page)
    await page.getByRole('tab', { name: 'Parcours', exact: true }).click()
    await page.getByRole('tab', { name: /Réalisés/ }).click()
    await expect(page.getByText(/Fait le 28 septembre 2026 · \d+ min · [\d,]+ km\/h/)).toBeVisible()
  })

  test('warns about a GPS gap for a few seconds only (#180)', async ({ page, context }) => {
    await page.clock.install({ time: new Date('2026-10-25T08:00:00Z') })
    page.on('dialog', dialog => dialog.accept())
    const moveTo = async (meters: number, afterMs: number) => {
      await page.clock.fastForward(afterMs)
      await context.setGeolocation({ ...START, latitude: START.latitude + meters / 111_194.93 })
    }
    const gapAlert = page.getByText('GPS interrompu 1 fois')

    await page.goto('/record')
    await waitForMap(page)
    await page.getByRole('button', { name: 'Démarrer' }).click()
    await moveTo(100, 30_000)
    await expect(page.getByTestId('distance')).toHaveText('100 m')

    // Two minutes without any fix: a gap.
    await moveTo(300, 120_000)
    await expect(page.getByTestId('distance')).toHaveText('300 m')
    await expect(gapAlert).toBeVisible()
    await page.clock.fastForward(7000)
    await expect(gapAlert).toHaveCount(0)

    // A resumed outing doesn't warn again about its past gaps.
    await page.reload()
    await waitForMap(page)
    await page.getByRole('button', { name: 'Reprendre' }).click()
    await expect(page.getByTestId('distance')).toHaveText('300 m')
    await expect(gapAlert).toHaveCount(0)
  })

  test('turns the map with the direction of travel, then with the phone compass when stopped', async ({ page, context }) => {
    // Fake clock: a GPS course gets old, and the compass takes over, with Date.now().
    await page.clock.install({ time: new Date('2026-10-17T08:00:00Z') })
    const map = page.locator('[data-map-loaded]')
    const toggle = page.getByRole('button', { name: 'Orienter la carte dans le sens de la marche' })
    // `meters` east of the start.
    const walkEast = (meters: number) => context.setGeolocation({
      ...START,
      longitude: START.longitude + meters / (111_194.93 * Math.cos((START.latitude * Math.PI) / 180)),
    })
    // A compass reading of a phone lying flat: alpha turns counter-clockwise from north.
    const compass = (alpha: number) => page.evaluate((alpha) => {
      const type = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation'
      window.dispatchEvent(new DeviceOrientationEvent(type, { alpha, beta: 0, gamma: 0, absolute: true }))
    }, alpha)

    await page.goto('/record')
    await waitForMap(page)
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    // Kept on the phone.
    await page.reload()
    await waitForMap(page)
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    // Zoomed in on the position, still north up: no direction yet.
    await expect(map).toHaveAttribute('data-map-center', '6.1200,45.9000', { timeout: 10_000 })
    await expect(map).toHaveAttribute('data-map-bearing', '0')

    // Walking east: east is up.
    await page.clock.fastForward(5000)
    await walkEast(30)
    await expect(map).toHaveAttribute('data-map-bearing', '90')

    // Stopped, facing west: the compass turns the map.
    await page.clock.fastForward(15_000)
    await compass(90)
    await expect(map).toHaveAttribute('data-map-bearing', '270')

    // A gesture on the map stops following; "Recentrer" brings it back, turned with the direction.
    const box = (await map.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, { steps: 5 })
    await page.mouse.up()
    const recenter = page.getByRole('button', { name: 'Recentrer' })
    await expect(recenter).toBeVisible()
    await page.clock.fastForward(2000)
    await compass(315)
    await recenter.click()
    await expect(map).toHaveAttribute('data-map-bearing', '45')

    // MapLibre's compass brings north up back, and keeps it.
    await page.getByRole('button', { name: 'Réorienter vers le nord' }).click()
    await expect(map).toHaveAttribute('data-map-bearing', '0')
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })

  test('keeps the map still under the data screen, then brings it back to the position', async ({ page, context }) => {
    // Fake clock: 300 m in a simulated minute is a plausible speed for the recorder.
    await page.clock.install({ time: new Date('2026-11-06T08:00:00Z') })
    page.on('dialog', dialog => dialog.accept()) // "leave the page?" prompt at the end
    const map = page.locator('[data-map-loaded]')

    await page.goto('/record')
    await waitForMap(page)
    await expect(map).toHaveAttribute('data-map-center', '6.1200,45.9000', { timeout: 10_000 })
    await page.getByRole('button', { name: 'Démarrer' }).click()
    await page.getByRole('button', { name: 'Données' }).click()

    // The fix is recorded, but the map nobody sees doesn't move (#182).
    await page.clock.fastForward(60_000)
    await context.setGeolocation({ ...START, latitude: START.latitude + 300 / 111_194.93 })
    await expect(page.locator('[data-field="distance"]')).toContainText('300')
    await page.clock.fastForward(2000)
    await expect(map).toHaveAttribute('data-map-center', '6.1200,45.9000')

    // Back on the map: it catches up with the position.
    await page.getByRole('button', { name: 'Carte', exact: true }).click()
    await expect(map).toHaveAttribute('data-map-center', '6.1200,45.9027')
  })
})
