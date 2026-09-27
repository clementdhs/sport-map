import { expect, test, waitForMap } from './fixtures'

test('draws, saves, then edits a route', async ({ page }) => {
  await page.goto('/routes/create')
  await waitForMap(page)

  // Three waypoints across the map; routing is mocked by the fixtures.
  const map = page.locator('.maplibregl-canvas')
  const box = (await map.boundingBox())!
  for (const [x, y] of [[0.3, 0.4], [0.5, 0.6], [0.7, 0.4]] as const) {
    await map.click({ position: { x: box.width * x, y: box.height * y } })
  }

  await expect(page.getByText('Profil altimétrique')).toBeVisible()
  await expect(page.getByText('0 m', { exact: true })).toHaveCount(0)

  // A point of interest, placed by clicking near the first segment.
  await page.getByRole('button', { name: 'Ajouter' }).click()
  await map.click({ position: { x: box.width * 0.4, y: box.height * 0.5 } })
  await page.getByRole('textbox', { name: "Note du point d'intérêt 1" }).fill('Fontaine')

  await page.getByLabel('Nom').fill('Parcours e2e')
  await page.getByRole('button', { name: 'Enregistrer le parcours' }).click()

  await expect(page).toHaveURL(/\/routes\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: 'Parcours e2e' })).toBeVisible()
  const pois = page.getByRole('region', { name: "Points d'intérêt" })
  await expect(pois).toContainText("Point d'eau")
  await expect(pois).toContainText('Fontaine')
  await expect(page.locator('[data-poi-marker]')).toHaveCount(1)

  // Editing reopens the same route, and saving updates it in place.
  const detailUrl = page.url()
  const ogImageUrl = `${detailUrl.replace('/routes/', '/api/routes/')}/og.png`
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', new RegExp(`^${ogImageUrl}\\?v=\\d+$`))
  await page.getByRole('link', { name: 'Modifier le parcours' }).click()
  await waitForMap(page)
  await expect(page.getByLabel('Nom')).toHaveValue('Parcours e2e')
  await page.getByRole('switch', { name: 'Parcours public' }).click()
  await page.getByRole('button', { name: 'Enregistrer les modifications' }).click()

  await expect(page).toHaveURL(detailUrl)
  await expect(page.getByText('Privé', { exact: true })).toBeVisible()

  // A private route has no link preview image, not even for its owner (it could end up in a public cache).
  await page.reload()
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(0)
  expect((await page.request.get(ogImageUrl)).status()).toBe(404)

  // The private route stays listed on its owner's profile.
  await page.goto('/profile')
  await expect(page.getByRole('link', { name: /Parcours e2e/ })).toBeVisible()
})
