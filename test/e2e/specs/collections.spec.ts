import { expect, routeAction, SEED_OWNER, SEEDED_ROUTE_NAME, test, waitForHydration, waitForMap } from '../fixtures'

test.use({ role: 'account' })

test('groups routes in a collection visible to the family, which only shows them its routes visible to the family', async ({ page, requestAs }) => {
  // A retry finds the collection of the failed attempt: each attempt makes its own.
  const name = `Week-end e2e ${test.info().retry + 1}`
  const { id: privateId } = await (await page.request.post('/api/routes', {
    data: { name: 'Parcours privé collection e2e', sport_type: 'hiking', is_public: false, coordinates: [[6.3, 45.8], [6.35, 45.82]] },
  })).json() as { id: string }

  // Created from the page of the seeded (visible to the family) route, which it then holds.
  await page.goto(`/routes/${process.env.E2E_ROUTE_ID}`)
  await routeAction(page, 'Ajouter à une collection')
  const dialog = page.getByRole('dialog', { name: 'Ajouter à une collection' })
  await dialog.getByRole('button', { name: 'Nouvelle collection' }).click()
  await dialog.getByLabel('Nom').fill(name)
  await dialog.getByRole('switch', { name: "Visible par l'équipe" }).click()
  await dialog.getByRole('button', { name: 'Créer et ajouter' }).click()
  await expect(dialog.getByRole('checkbox', { name })).toBeChecked()
  await page.keyboard.press('Escape')

  // Added from the private route's page.
  await page.goto(`/routes/${privateId}`)
  await routeAction(page, 'Ajouter à une collection')
  const checkbox = page.getByRole('dialog').getByRole('checkbox', { name })
  await expect(checkbox).not.toBeChecked()
  await checkbox.click()
  await expect(checkbox).toBeChecked()
  await page.keyboard.press('Escape')

  await page.goto('/profile')
  await waitForHydration(page)
  await page.getByRole('tab', { name: /Collections/ }).click()
  await page.getByRole('link', { name: new RegExp(name) }).click()
  await expect(page).toHaveURL(/\/collections\/[0-9a-f-]{36}$/)
  await waitForMap(page)
  const routes = page.getByRole('list', { name: 'Parcours de la collection' })
  await expect(routes.getByRole('listitem')).toHaveCount(2)
  await expect(page.getByText("Visible par l'équipe", { exact: true })).toBeVisible()
  await expect(routes.getByRole('listitem').first()).toContainText(`${SEEDED_ROUTE_NAME}`)
  await expect(routes.getByRole('listitem').first()).toContainText(`par ${SEED_OWNER.displayName}`)

  // Another member sees the collection, without the private route.
  const collectionApi = page.url().replace('/collections/', '/api/collections/')
  const member = await requestAs('family')
  const asMember = async () => (await member.get(collectionApi)).json() as Promise<{ is_mine: boolean, routes: { name: string }[] }>
  expect(await asMember()).toMatchObject({ is_mine: false, routes: [{ name: SEEDED_ROUTE_NAME }] })

  // Deleting a route takes it out of the collection.
  expect((await page.request.delete(`/api/routes/${privateId}`)).ok()).toBe(true)
  await page.reload()
  await waitForMap(page)
  await expect(routes.getByRole('listitem')).toHaveCount(1)

  // Removing the last route, then deleting the collection, keeps the route.
  await page.getByRole('button', { name: `Retirer ${SEEDED_ROUTE_NAME} de la collection` }).click()
  await expect(page.getByText('Collection vide')).toBeVisible()
  await page.getByRole('button', { name: 'Supprimer la collection' }).click()
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click()
  await expect(page).toHaveURL(/\/profile$/)
  expect((await member.get(collectionApi)).status()).toBe(404)
  expect((await member.get(`/api/routes/${process.env.E2E_ROUTE_ID}`)).ok()).toBe(true)
})
