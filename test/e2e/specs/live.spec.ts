import { supabaseAdmin } from '../admin'
import type { LiveShareDetail, LiveShareStarted, LiveShareSummary } from '../../../shared/types/live'
import { expect, SEEDED_ROUTE_NAME, test, waitForMap } from '../fixtures'

// Every member sees every position shared in the family: all the tests that share one are in this file, so they
// never run at the same time. The test account shares, a family member follows.
test.use({ role: 'account' })

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
    // `meters` south of the start, 30 simulated seconds later.
    const moveTo = async (meters: number) => {
      await page.clock.fastForward(30_000)
      await context.setGeolocation({ ...START, latitude: START.latitude - meters / 111_194.93 })
    }
    const status = page.getByTestId('live-status')

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
    await moveTo(100)
    await moveTo(200)
    await expect(status).toHaveText('Pas de réseau : 2 positions en attente')
    await context.setOffline(false)
    // The next try, 30 s after the last one.
    await page.clock.fastForward(30_000)
    await expect(status).toHaveText('Envoyée il y a 0 s')
    const { points } = await (await member.get(`/api/live/${share!.id}`)).json() as LiveShareDetail
    expect(points.map(point => Math.round((START.latitude - point.lat) * 111_194.93))).toEqual([0, 100, 200])

    // Leaving follow mode stops sharing.
    await page.getByRole('link', { name: 'Quitter' }).click()
    await expect(page).toHaveURL(new RegExp(`/routes/${process.env.E2E_ROUTE_ID}$`))
    await expect.poll(shares).toEqual([])
  })

  test('shares the position while recording, and stops when the outing is discarded', async ({ page, context, requestAs }) => {
    test.slow()
    await page.clock.install({ time: new Date('2026-10-04T08:00:00Z') })
    page.on('dialog', dialog => dialog.accept()) // "discard the outing?"
    const member = await requestAs('family')
    const shares = async () => await (await member.get('/api/live')).json() as LiveShareSummary[]

    await page.goto('/record')
    await waitForMap(page)
    await expect(page.getByText(/Précision GPS/)).toBeVisible()
    // Offered once the outing has started.
    await expect(page.getByRole('button', { name: 'Partager ma position' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Démarrer' }).click()
    await page.getByRole('button', { name: 'Partager ma position' }).click()
    await page.getByRole('dialog', { name: "Partager ta position avec l'équipe ?" }).getByRole('button', { name: 'Partager', exact: true }).click()
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
    await page.getByRole('link', { name: `${users.account.displayName} est en sortie` }).click()
    await expect(page).toHaveURL(`/live/${id}`)
    await page.getByRole('link', { name: 'Sorties en cours' }).click()
    await expect(page.getByRole('heading', { name: 'Sorties en cours' })).toBeVisible()
    await page.getByRole('link', { name: new RegExp(`Sortie de ${users.account.displayName}`) }).click()

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
})
