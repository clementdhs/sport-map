import { insertRows } from '../admin'
import { expect, SEEDED_REVIEW, test, waitForMap } from '../fixtures'

test.use({ role: 'account' })

test('reviews the route of someone else, and reports an abusive comment', async ({ page }) => {
  const [author, reporter, otherReporter] = process.env.E2E_NEIGHBOR_IDS!.split(',')
  // A neighbor's route (far from the seeded ones, not to disturb the search tests), already reviewed by another.
  const [route] = await insertRows<{ id: string }>('routes', [{
    owner_id: author,
    name: 'Belvédère e2e du voisin',
    sport_type: 'hiking',
    is_public: true,
    geom: 'SRID=4326;LINESTRING(170 -45,170.1 -45.1)',
  }])
  const [abusive] = await insertRows<{ id: string }>('route_reviews', [
    { route_id: route!.id, user_id: reporter, rating: 2, comment: 'Commentaire insultant e2e' },
  ])
  await page.goto(`/routes/${route!.id}`)
  await waitForMap(page)
  await page.getByRole('tab', { name: /Avis/ }).click()
  const reviews = page.getByRole('region', { name: 'Avis', exact: true })
  await expect(reviews).toContainText('Commentaire insultant e2e')

  await reviews.getByRole('radio', { name: '4 étoiles' }).click()
  await reviews.getByLabel('Commentaire').fill('Belle vue au sommet')
  await reviews.getByRole('button', { name: 'Publier mon avis' }).click()
  await expect(reviews).toContainText('Belle vue au sommet')
  await expect(reviews).toContainText('3,0· 2 avis')

  await reviews.getByRole('button', { name: 'Modifier' }).click()
  await reviews.getByRole('radio', { name: '5 étoiles' }).click()
  await reviews.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(reviews).toContainText('3,5· 2 avis')

  page.once('dialog', dialog => dialog.accept())
  await reviews.getByRole('button', { name: 'Signaler' }).click()
  await expect(reviews.getByRole('button', { name: 'Signalé' })).toBeDisabled()

  // Two more reports: the comment is hidden automatically, its rating still counts.
  await insertRows('review_reports', [
    { review_id: abusive!.id, reporter_id: author },
    { review_id: abusive!.id, reporter_id: otherReporter },
  ])
  await page.reload()
  await expect(reviews).toContainText('Belle vue au sommet')
  await expect(reviews).not.toContainText('Commentaire insultant e2e')
  await expect(reviews).toContainText('3,5· 2 avis')

  page.once('dialog', dialog => dialog.accept())
  await reviews.getByRole('button', { name: 'Supprimer' }).click()
  await expect(reviews).not.toContainText('Belle vue au sommet')
  await expect(reviews).toContainText('2,0· 1 avis')
})

test('moderates the reviews of its own route', async ({ page, requestAs, accountRouteId: id }) => {
  await page.goto(`/routes/${id}`)
  await waitForMap(page)
  await page.getByRole('tab', { name: /Avis/ }).click()
  const reviews = page.getByRole('region', { name: 'Avis', exact: true })
  await expect(reviews).toContainText(SEEDED_REVIEW.comment)
  // The latest comments are quoted in the overview too (#233).
  await expect(page.getByTestId('team-word')).toContainText(SEEDED_REVIEW.comment)
  // No rating of one's own route.
  await expect(reviews.getByRole('button', { name: 'Publier mon avis' })).toHaveCount(0)

  const member = await requestAs('family')
  const asMember = async () => (await member.get(`/api/routes/${id}/reviews`)).json() as Promise<{ rating_count: number, reviews: unknown[] }>

  await reviews.getByRole('button', { name: 'Masquer le commentaire' }).click()
  await expect(reviews).toContainText("Commentaire masqué par l'auteur du parcours")
  await expect(page.getByTestId('team-word')).toHaveCount(0)
  expect(await asMember()).toMatchObject({ rating_count: 1, reviews: [] })

  await reviews.getByRole('button', { name: 'Afficher le commentaire' }).click()
  await expect(reviews).not.toContainText('Commentaire masqué')
  expect((await asMember()).reviews).toHaveLength(1)
})
