import { insertRows, supabaseAdmin } from '../admin'
import { E2E_NEIGHBORS, expect, SEED_OWNER, SEEDED_LOOP_NAME, SEEDED_REVIEW, SEEDED_ROUTE_NAME, test, waitForMap } from '../fixtures'

// These tests count every route visible to the team in France, and every route matching their words, while
// other spec files run: those put the routes they make visible to the team far away (FAR_AWAY in fixtures.ts).
// The seeded routes aren't the member's: they show under "Tous".
test.use({ role: 'family', searchScope: 'all' })

test.describe('my routes and the team\'s', () => {
  test.use({ searchScope: null })

  test('shows my routes by default, private ones included, never another member\'s private routes', async ({ page, requestAs }) => {
    const [neighbor] = process.env.E2E_NEIGHBOR_IDS!.split(',')
    // Near the seeded routes: a private route of the member, and one of another member.
    const { id: mineId } = await (await page.request.post('/api/routes', {
      data: { name: 'Raidillon privé e2e du membre', sport_type: 'hiking', is_public: false, coordinates: [[6.25, 45.88], [6.27, 45.89]] },
    })).json() as { id: string }
    const [other] = await insertRows<{ id: string }>('routes', [{
      owner_id: neighbor, name: 'Raidillon privé e2e du voisin', sport_type: 'hiking', is_public: false,
      geom: 'SRID=4326;LINESTRING(6.25 45.88,6.27 45.89)',
    }])
    try {
      await page.goto('/')
      await waitForMap(page)
      const cards = page.getByTestId('route-results').locator('li a')
      await expect(page.getByRole('tab', { name: 'Mes parcours' })).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByRole('paragraph').filter({ hasText: '1 de tes parcours ici' })).toBeVisible()
      await expect(cards).toHaveCount(1)
      await expect(cards.first()).toContainText('Raidillon privé e2e du membre')
      await expect(cards.first().getByLabel('Privé', { exact: true })).toBeVisible()

      // "Tous" adds the team's routes, kept after a reload.
      await page.getByRole('tab', { name: 'Tous' }).click()
      await expect(page.getByRole('paragraph').filter({ hasText: '3 parcours ici' })).toBeVisible()
      await expect(cards).toHaveCount(3)
      await page.reload()
      await waitForMap(page)
      await expect(page.getByRole('tab', { name: 'Tous' })).toHaveAttribute('aria-selected', 'true')
      await expect(cards).toHaveCount(3)
      await expect(cards.filter({ hasText: 'Raidillon privé e2e du voisin' })).toHaveCount(0)

      // Neither in a map view nor by name, whatever the scope.
      const view = 'minLng=6&minLat=45.7&maxLng=6.5&maxLat=46'
      const names = async (query: string) => ((await (await page.request.get(`/api/routes?${query}`)).json()) as { name: string }[]).map(route => route.name)
      expect(await names(`${view}&scope=all`)).not.toContain('Raidillon privé e2e du voisin')
      expect(await names(`${view}&scope=mine`)).toEqual(['Raidillon privé e2e du membre'])
      expect(await names(`${view}&scope=all&q=raidillon`)).toEqual(['Raidillon privé e2e du membre'])
      expect(await names(`${view}&scope=mine&q=raidillon`)).toEqual(['Raidillon privé e2e du membre'])
      // The test account doesn't see the member's private route either.
      const account = await requestAs('account')
      const accountNames = ((await (await account.get(`/api/routes?${view}&scope=all&q=raidillon`)).json()) as { name: string }[]).map(route => route.name)
      expect(accountNames).toEqual([])
    }
    finally {
      await page.request.delete(`/api/routes/${mineId}`)
      await supabaseAdmin(`/rest/v1/routes?id=eq.${other!.id}`, { method: 'DELETE' })
    }
  })
})

test('finds a route of another member on the home map and opens it', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)

  const card = page.getByRole('link', { name: new RegExp(SEEDED_ROUTE_NAME) })
  await expect(card).toBeVisible()
  // Its average rating, from the seeded review.
  await expect(card).toContainText('4,0')
  await expect(card).toContainText('(1 avis)')
  // Its author by display name, not username.
  await expect(card).toContainText(`par ${SEED_OWNER.displayName}`)
  // Its outline and its stats.
  await expect(card.getByTestId('route-track')).toHaveAttribute('d', /^M\d+ \d+L/)
  await expect(card).toContainText('Course sur route')
  await expect(card).toContainText(/\d+ m D\+/)
  await card.click()

  await expect(page).toHaveURL(/\/routes\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: SEEDED_ROUTE_NAME })).toBeVisible()
  await expect(page.getByText('Durée', { exact: true })).toBeVisible()
  // Other members can't edit or delete it, but can review it.
  await page.getByRole('button', { name: "Plus d'actions" }).click()
  await expect(page.getByRole('menuitem', { name: 'Exporter en GPX' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Modifier le parcours' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: /Avis/ }).click()
  const reviews = page.getByRole('region', { name: 'Avis', exact: true })
  await expect(reviews).toContainText('1 avis')
  await expect(reviews.getByRole('button', { name: 'Publier mon avis' })).toBeVisible()
})

test('groups nearby starts on the home map, keeps the hovered route visible and zooms on a group', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)

  // At the scale of France, both seeded routes near Annecy make one group.
  const group = page.getByRole('button', { name: '2 parcours ici, zoomer pour les voir' })
  await expect(group).toBeVisible()
  await expect(group).toHaveText('2')

  // A route hovered in the list shows above its group, until the mouse leaves its card.
  const highlight = page.locator('[data-route-highlight]')
  await expect(highlight).toHaveCount(0)
  await page.getByRole('link', { name: new RegExp(SEEDED_ROUTE_NAME) }).hover()
  await expect(highlight).toBeVisible()
  await page.getByTestId('route-results').locator('li a').filter({ hasText: SEEDED_LOOP_NAME }).hover()
  await expect(highlight).toBeVisible()
  await group.hover()
  await expect(highlight).toHaveCount(0)

  // A click zooms on the group, until its routes are apart.
  await group.click()
  await expect(group).toBeHidden()
  await expect(page.locator('[data-route-cluster]')).toHaveCount(0)
  await expect.poll(async () => {
    const [lng, lat] = (await page.locator('[data-map-center]').getAttribute('data-map-center'))!.split(',').map(Number)
    return Math.abs(lng! - 6.16) < 0.1 && Math.abs(lat! - 45.9) < 0.1
  }, { timeout: 10_000 }).toBe(true)
  await expect(page.getByTestId('route-results').locator('li a')).toHaveCount(2)
})

test('filters the search from the filters popover, counts and resets them', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)
  await expect(page.getByRole('link', { name: new RegExp(SEEDED_ROUTE_NAME) })).toBeVisible()

  await page.getByRole('button', { name: 'Filtres' }).click()
  await page.getByRole('combobox', { name: 'Sport' }).click()
  await page.getByRole('option', { name: 'Randonnée' }).click()
  await page.getByRole('switch', { name: /Boucles uniquement/ }).click()

  await expect(page.getByRole('paragraph').filter({ hasText: 'Aucun parcours dans cette zone' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Filtres, 2 actifs' })).toBeVisible()

  await page.getByRole('button', { name: 'Réinitialiser' }).click()
  await expect(page.getByRole('button', { name: 'Filtres', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Réinitialiser' })).toBeDisabled()
  await expect(page.getByTestId('route-results').locator('li a')).toHaveCount(2)
})

test('shows the results without scrolling on a phone, filters in a drawer', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await waitForMap(page)
  // The sheet opens collapsed (#197): its title alone gives the count; once opened at half height, the first card shows.
  const sheet = page.locator('aside[data-sheet]')
  await expect(sheet).toHaveAttribute('data-sheet', 'collapsed')
  await expect(sheet).toContainText('2 parcours ici')
  await sheet.getByText('2 parcours ici').first().click()
  const cards = page.getByTestId('route-results').locator('li a')
  await expect(cards).toHaveCount(2)
  await expect(cards.first()).toBeInViewport()

  await page.getByRole('button', { name: 'Filtres' }).click()
  const drawer = page.getByRole('dialog', { name: 'Filtres' })
  await drawer.getByRole('switch', { name: /Boucles uniquement/ }).click()
  await drawer.getByRole('button', { name: 'Voir les parcours' }).click()
  await expect(drawer).toBeHidden()
  await expect(cards).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Filtres, 1 actif' })).toBeVisible()
})

test('keeps only loops and sorts the results', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)
  const cards = page.getByTestId('route-results').locator('li a')
  await expect(cards).toHaveCount(2)

  await page.getByRole('combobox', { name: 'Trier par' }).click()
  await page.getByRole('option', { name: 'Plus longs' }).click()
  await expect(cards.first()).toContainText(SEEDED_LOOP_NAME)
  await expect(cards.first()).toContainText('Boucle')

  await page.getByRole('combobox', { name: 'Trier par' }).click()
  await page.getByRole('option', { name: 'Plus courts' }).click()
  await expect(cards.first()).toContainText(SEEDED_ROUTE_NAME)

  // The loop has no rating yet: it comes after the rated route.
  await page.getByRole('combobox', { name: 'Trier par' }).click()
  await page.getByRole('option', { name: 'Plus longs' }).click()
  await expect(cards.first()).toContainText(SEEDED_LOOP_NAME)
  await page.getByRole('combobox', { name: 'Trier par' }).click()
  await page.getByRole('option', { name: 'Mieux notés' }).click()
  await expect(cards.first()).toContainText(SEEDED_ROUTE_NAME)

  await page.getByRole('button', { name: 'Filtres' }).click()
  await page.getByRole('switch', { name: /Boucles uniquement/ }).click()
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText(SEEDED_LOOP_NAME)
})

test('finds routes passing through the view, pinned where they cross it', async ({ page, request }) => {
  // Around the end of the seeded point-to-point route, far from its start.
  const view = 'minLng=6.15&minLat=45.84&maxLng=6.17&maxLat=45.86'
  expect(await (await request.get(`/api/routes?${view}`)).json()).toEqual([])
  const passing = await (await request.get(`/api/routes?${view}&through=true`)).json() as { name: string, marker: number[] }[]
  expect(passing.map(route => route.name)).toEqual([SEEDED_ROUTE_NAME])
  expect(passing[0]!.marker[0]).toBeCloseTo(6.16, 3)
  expect(passing[0]!.marker[1]).toBeCloseTo(45.85, 3)

  // The switch sends the option.
  await page.goto('/')
  await waitForMap(page)
  const searched = page.waitForRequest(req => req.url().includes('/api/routes?') && req.url().includes('through=true'))
  await page.getByRole('button', { name: 'Filtres' }).click()
  await page.getByRole('switch', { name: /Passant par la zone/ }).click()
  await searched
  await expect(page.getByTestId('route-results').locator('li a')).toHaveCount(2)
})

test('finds routes by name or description, anywhere, ignoring accents and case', async ({ page, request }) => {
  // Far from both seeded routes: a text search doesn't depend on the view.
  const farAway = 'minLng=-5&minLat=40&maxLng=-4&maxLat=41'
  const names = async (q: string) => ((await (await request.get(`/api/routes?${farAway}&q=${encodeURIComponent(q)}`)).json()) as { name: string }[]).map(route => route.name)
  expect(await names('CRETES')).toEqual([SEEDED_LOOP_NAME])
  // Every word, in any order, in the name or the description ("…créé par les tests de bout en bout.").
  expect(await names('lac traversee')).toEqual([SEEDED_ROUTE_NAME])
  expect((await names('bout tests')).sort()).toEqual([SEEDED_LOOP_NAME, SEEDED_ROUTE_NAME].sort())
  expect(await names('crêtes lac')).toEqual([])

  await page.goto('/')
  await waitForMap(page)
  const cards = page.getByTestId('route-results').locator('li a')
  await expect(cards).toHaveCount(2)
  // One field for places and routes: the routes suggestion comes first, picked with the keyboard.
  // (Places need MapTiler, which e2e runs without.)
  const searchBox = page.getByRole('combobox', { name: 'Rechercher un lieu ou un parcours' })
  await searchBox.fill('c')
  await expect(page.getByText('Tape au moins 2 lettres')).toBeVisible()
  await searchBox.fill('lac')
  await expect(page.getByRole('option', { name: 'Parcours contenant « lac »' })).toBeVisible()
  await searchBox.press('Escape')
  await expect(page.getByRole('option')).toHaveCount(0)
  await expect(cards).toHaveCount(2)
  await searchBox.fill('crêtes')
  await searchBox.press('ArrowDown')
  await searchBox.press('Enter')
  await expect(page.getByRole('paragraph').filter({ hasText: '1 parcours pour « crêtes »' })).toBeVisible()
  await expect(searchBox).toHaveValue('crêtes')
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText(SEEDED_LOOP_NAME)
  // Combined with the filters.
  await page.getByRole('button', { name: 'Filtres' }).click()
  await page.getByRole('combobox', { name: 'Sport' }).click()
  await page.getByRole('option', { name: 'Randonnée' }).click()
  await expect(page.getByRole('paragraph').filter({ hasText: 'Aucun parcours pour « crêtes »' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Effacer la recherche' }).click()
  await expect(page.getByRole('paragraph').filter({ hasText: 'Aucun parcours dans cette zone' })).toBeVisible()
})

// Route cards (#232): the latest review's comment as a member's quote, and the viewer's "Fait ×N" stamp, both
// coming with the search results.
test("cards show a member's quote and my done stamp", async ({ page }) => {
  const { id } = await (await page.request.post('/api/routes', {
    data: { name: 'Boucle tamponnée e2e', sport_type: 'trail', is_public: false, coordinates: [[6.25, 45.88], [6.27, 45.89]] },
  })).json() as { id: string }
  try {
    expect((await page.request.put(`/api/routes/${id}/activity/completed`)).ok()).toBe(true)
    await page.goto('/')
    await waitForMap(page)
    const cards = page.getByTestId('route-results').locator('li a')
    await expect(cards.filter({ hasText: SEEDED_ROUTE_NAME }).getByTestId('route-quote'))
      .toHaveText(`« ${SEEDED_REVIEW.comment} » — ${E2E_NEIGHBORS[0]!.username}`)
    const mine = cards.filter({ hasText: 'Boucle tamponnée e2e' })
    await expect(mine.getByText('Fait une fois')).toBeAttached()
    await expect(mine.getByTestId('route-quote')).toHaveCount(0)
  }
  finally {
    await page.request.delete(`/api/routes/${id}`)
  }
})
