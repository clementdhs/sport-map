import { supabaseAdmin } from '../admin'
import type { LiveShareDetail, LiveShareStarted, LiveShareSummary } from '../../../shared/types/live'
import { expect, SEEDED_ROUTE_NAME, test, waitForMap } from '../fixtures'

// Every member sees every position shared in the family: all the tests that share one are in this file, so they
// never run at the same time. The test account shares, a family member follows.
test.use({ role: 'account' })

// A test that fails (or a page closed before it could stop sharing) leaves its share behind, and the next test, or
// its retry, would see it: none is left before or after each test (#211).
const deleteShares = async (userIds: string[]) =>
  await supabaseAdmin(`/rest/v1/live_shares?user_id=in.(${userIds.join(',')})`, { method: 'DELETE' })
test.beforeEach(async ({ userIds }) => await deleteShares(userIds))
test.afterEach(async ({ userIds }) => await deleteShares(userIds))

test('shares the location with the family during an outing, then deletes it', async ({ request, requestAs, users }) => {
  const member = await requestAs('family')
  const point = (minute: number) => ({ fixed_at: `2026-10-04T08:0${minute}:00Z`, lng: 6.12, lat: 45.9 + minute / 1000, accuracy_m: 5 })

  const started = await request.post('/api/live', { data: { route_id: process.env.E2E_ROUTE_ID } })
  expect(started.status()).toBe(201)
  const { id } = await started.json() as LiveShareStarted

  // Points out of order, then one sent again with an older one arriving late: nothing is lost or doubled, and
  // the latest position stays the latest fix.
  expect((await request.post(`/api/live/${id}/points`, { data: { points: [point(2), point(1)] } })).status()).toBe(204)
  expect((await request.post(`/api/live/${id}/points`, { data: { points: [point(1), point(0)] } })).status()).toBe(204)

  // The family sees the share, its route and its track; ?after= only brings the newer points.
  const list = await (await member.get('/api/live')).json() as LiveShareSummary[]
  expect(list).toEqual([expect.objectContaining({
    id, user_name: users.account.displayName, is_mine: false, route: { id: process.env.E2E_ROUTE_ID, name: SEEDED_ROUTE_NAME },
    last_fixed_at: expect.stringMatching(/^2026-10-04T08:02:00/),
  })])
  const detail = await (await member.get(`/api/live/${id}`)).json() as LiveShareDetail
  expect(detail.points.map(p => p.lat)).toEqual([45.9, 45.901, 45.902])
  expect(detail.route_geometry?.type).toBe('LineString')
  const newer = await (await member.get(`/api/live/${id}?after=${encodeURIComponent(point(1).fixed_at)}`)).json() as LiveShareDetail
  expect(newer).toMatchObject({ points: [{ lat: 45.902 }], route_geometry: null })

  // Other members can neither add points nor stop it.
  expect((await member.post(`/api/live/${id}/points`, { data: { points: [point(3)] } })).status()).toBe(404)
  expect((await member.delete(`/api/live/${id}`)).status()).toBe(204)
  expect((await member.get(`/api/live/${id}`)).ok()).toBe(true)

  // Starting again replaces the share whose end never reached the server.
  const { id: second } = await (await request.post('/api/live', { data: {} })).json() as LiveShareStarted
  expect((await member.get(`/api/live/${id}`)).status()).toBe(404)
  expect((await member.get(`/api/live/${second}`)).ok()).toBe(true)

  // Expired after 12 hours: hidden from the family and closed to new points, until the cron job removes it.
  await supabaseAdmin(`/rest/v1/live_shares?id=eq.${second}`, {
    method: 'PATCH',
    body: JSON.stringify({ expires_at: new Date(Date.now() - 60_000).toISOString() }),
  })
  expect((await member.get(`/api/live/${second}`)).status()).toBe(404)
  expect(await (await member.get('/api/live')).json()).toEqual([])
  expect((await request.post(`/api/live/${second}/points`, { data: { points: [point(4)] } })).status()).toBe(404)

  // Stopped: the share and its track are deleted.
  expect((await request.delete(`/api/live/${second}`)).status()).toBe(204)
  expect(await supabaseAdmin(`/rest/v1/live_shares?id=eq.${second}&select=id`)).toEqual([])
  expect(await supabaseAdmin(`/rest/v1/live_positions?share_id=in.(${id},${second})&select=fixed_at`)).toEqual([])
})

test.describe('sharing the location during an outing', () => {
  // At the start of the seeded route.
  const START = { latitude: 45.899, longitude: 6.129, accuracy: 5 }
  test.use({ permissions: ['geolocation'], geolocation: START })

  test('shares the position while following, fills in a network gap, and stops when leaving', async ({ page, context, requestAs, users }) => {
    test.slow()
    // Fake clock: one point is kept every 30 s of Date.now().
    await page.clock.install({ time: new Date('2026-10-04T08:00:00Z') })
    const member = await requestAs('family')
    const shares = async () => await (await member.get('/api/live')).json() as LiveShareSummary[]
    const status = page.getByTestId('live-status')
    // `meters` south of the start, 30 simulated seconds later, while offline. The page gets the new position a bit
    // later: it must have kept it before the clock moves on, or that point would be dated 30 s later and the next
    // one skipped, too close to it (#211).
    const moveTo = async (meters: number, waiting: number) => {
      await page.clock.fastForward(30_000)
      await context.setGeolocation({ ...START, latitude: START.latitude - meters / 111_194.93 })
      await expect(status).toHaveAttribute('data-waiting', String(waiting))
    }

    await page.goto(`/routes/${process.env.E2E_ROUTE_ID}/follow`)
    await waitForMap(page)
    await expect(page.getByText(/Précision GPS/)).toBeVisible()
    // Never shared without asking.
    expect(await shares()).toEqual([])

    await page.getByRole('button', { name: 'Partager ma position' }).click()
    await page.getByRole('dialog', { name: "Partager ta position avec l'équipe ?" }).getByRole('button', { name: 'Partager', exact: true }).click()
    await expect(page.getByText("Position partagée avec l'équipe")).toBeVisible()
    await expect(status).toHaveText('Envoyée il y a 0 s')
    const [share] = await shares()
    expect(share).toMatchObject({ user_name: users.account.displayName, route: { name: SEEDED_ROUTE_NAME } })

    // No network for a minute: the points wait, then all arrive in order.
    await context.setOffline(true)
    await moveTo(100, 1)
    await moveTo(200, 2)
    await expect(status).toHaveText('Pas de réseau : 2 positions en attente')
    await context.setOffline(false)
    // The next try, 30 s after the last one.
    await page.clock.fastForward(30_000)
    await expect(status).toHaveText('Envoyée il y a 0 s')
    const { points } = await (await member.get(`/api/live/${share!.id}`)).json() as LiveShareDetail
    expect(points.map(point => Math.round((START.latitude - point.lat) * 111_194.93))).toEqual([0, 100, 200])

    // Leaving follow mode stops sharing. The request only leaves once the next page has replaced this one, which
    // takes a few seconds on a slow runner.
    await page.getByRole('link', { name: 'Quitter' }).click()
    await expect(page).toHaveURL(new RegExp(`/routes/${process.env.E2E_ROUTE_ID}$`))
    await expect.poll(shares, { timeout: 15_000 }).toEqual([])
  })

  // Reached from "Partager ma position" (#262): the recording asks at once when the outing starts.
  test('shares the position while recording, and stops when the outing is discarded', async ({ page, context, requestAs }) => {
    test.slow()
    await page.clock.install({ time: new Date('2026-10-04T08:00:00Z') })
    page.on('dialog', dialog => dialog.accept()) // "discard the outing?"
    const member = await requestAs('family')
    const shares = async () => await (await member.get('/api/live')).json() as LiveShareSummary[]

    await page.goto('/record?share=1')
    await waitForMap(page)
    await expect(page.getByText(/Précision GPS/)).toBeVisible()
    // Offered once the outing has started.
    await expect(page.getByRole('button', { name: 'Partager ma position' })).toHaveCount(0)
    const confirm = page.getByRole('dialog', { name: "Partager ta position avec l'équipe ?" })
    await expect(confirm).toHaveCount(0)
    await page.getByRole('button', { name: 'Démarrer' }).click()
    await confirm.getByRole('button', { name: 'Partager', exact: true }).click()
    await expect(page.getByText("Position partagée avec l'équipe")).toBeVisible()
    await expect.poll(shares).toEqual([expect.objectContaining({ route: null })])

    for (const meters of [100, 200]) {
      await page.clock.fastForward(60_000)
      await context.setGeolocation({ ...START, latitude: START.latitude + meters / 111_194.93 })
      await expect(page.getByTestId('distance')).toHaveText(`${meters} m`)
    }
    await page.getByRole('button', { name: 'Terminer' }).click()
    await page.getByRole('dialog', { name: 'Terminer la sortie' }).getByRole('button', { name: 'Abandonner la sortie' }).click()
    await expect(page.getByRole('button', { name: 'Démarrer' })).toBeVisible()
    await expect.poll(shares).toEqual([])
  })
})

test.describe('as another member', () => {
  test.use({ role: 'family' })

  test('follows the outing of another member sharing their position, until it ends', async ({ page, requestAs, users }) => {
    test.slow()
    // The test account shares its position (its phone, through the API).
    const sharer = await requestAs('account')
    const { id } = await (await sharer.post('/api/live', { data: { route_id: process.env.E2E_ROUTE_ID } })).json() as LiveShareStarted
    const sendPoint = async (minutesAgo: number, lat: number) => {
      const fixedAt = new Date(Date.now() - minutesAgo * 60_000).toISOString()
      expect((await sharer.post(`/api/live/${id}/points`, { data: { points: [{ fixed_at: fixedAt, lng: 6.13, lat, accuracy_m: 8 }] } })).status()).toBe(204)
    }
    await sendPoint(11, 45.899)
    await sendPoint(10, 45.896)
    // Fake clock from now on, to run the 20 s refreshes at once.
    await page.clock.install()

    // Announced on the home page, listed among the outings in progress.
    await page.goto('/')
    // One member out: no "Voir tout", the banner itself leads to the share.
    await expect(page.getByRole('link', { name: `${users.account.displayName} est en sortie` })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Voir tout' })).toHaveCount(0)
    await page.getByRole('link', { name: `${users.account.displayName} est en sortie` }).click()
    await expect(page).toHaveURL(`/live/${id}`)
    await page.getByRole('link', { name: 'Sorties en cours' }).click()
    await expect(page.getByRole('heading', { name: 'Sorties en cours · 1' })).toBeVisible()
    // Not sharing: the way to start, through a recording.
    await expect(page.getByRole('region', { name: 'Partager ma position' }).getByRole('link', { name: 'Enregistrer' })).toHaveAttribute('href', '/record?share=1')
    // The card's mini-map draws the route followed and the track covered (~330 m), ending on the position.
    const card = page.getByRole('link', { name: new RegExp(`Sortie de ${users.account.displayName}`) })
    await expect(card.getByTestId('live-thumbnail').locator('path[d^="M"]')).toHaveCount(4) // 2 contour lines
    await expect(card.getByTestId('live-thumbnail').locator('circle')).toHaveCount(2)
    await expect(card).toContainText(/33\d m/)
    await card.click()

    // The map of the outing, with the route followed and how old the latest position is.
    await waitForMap(page)
    await expect(page.getByRole('heading', { name: `Sortie de ${users.account.displayName}` })).toBeVisible()
    await expect(page.getByRole('link', { name: SEEDED_ROUTE_NAME })).toBeVisible()
    const lastPosition = page.getByTestId('live-last-position')
    await expect(lastPosition).toHaveText(/^Dernière position à \d\d:\d\d \(il y a 10 min\)$/)
    await expect(lastPosition).toHaveClass(/text-warning/)

    // A new point shows at the next refresh.
    await sendPoint(0, 45.893)
    await page.clock.fastForward(20_000)
    await expect(lastPosition).toHaveText(/\(il y a \d+ s\)$/)
    await expect(lastPosition).not.toHaveClass(/text-warning/)

    // Stopped on the phone: the page says so at the next refresh.
    expect((await sharer.delete(`/api/live/${id}`)).status()).toBe(204)
    await page.clock.fastForward(20_000)
    await expect(page.getByText('Ce partage de position est terminé')).toBeVisible()
    await expect(page.getByText(`${users.account.displayName} ne partage plus sa position.`)).toBeVisible()

    // Nothing in progress any more.
    await page.goto('/live')
    await expect(page.getByText('Personne ne partage sa position en ce moment.')).toBeVisible()
  })

  // The list has no tab of its own any more (#262): with several members out, the home banner leads to it. Their
  // shares are made up (only the banner's request), so that no real one runs beside the other tests.
  test('leads from the home banner to the list when several members share their position', async ({ page }) => {
    const share = (id: string, name: string): LiveShareSummary => ({
      id,
      user_name: name,
      user_avatar_path: null,
      is_mine: false,
      route: null,
      follows_route: false,
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      last_fixed_at: null,
    })
    await page.route('**/api/live', route => route.fulfill({
      json: [share('6f1c1a52-6a8e-4c3e-9f1d-2b1f6f4b7a01', 'Alice'), share('6f1c1a52-6a8e-4c3e-9f1d-2b1f6f4b7a02', 'Bob')],
    }))
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Alice est en sortie' })).toHaveAttribute('href', '/live/6f1c1a52-6a8e-4c3e-9f1d-2b1f6f4b7a01')
    await expect(page.getByRole('link', { name: 'Bob est en sortie' })).toBeVisible()
    await page.getByRole('link', { name: 'Voir tout' }).click()
    await expect(page).toHaveURL(/\/live$/)
    await expect(page.getByRole('heading', { name: 'En direct', level: 1 })).toBeVisible()
  })
})
