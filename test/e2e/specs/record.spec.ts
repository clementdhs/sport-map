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
    await page.getByRole('tab', { name: /Réalisés/ }).click()
    await expect(page.getByText(/Fait le 28 septembre 2026 · \d+ min · [\d,]+ km\/h/)).toBeVisible()
  })
})
