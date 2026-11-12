import type { Page } from '@playwright/test'
import { expect, test, waitForHydration, waitForMap } from '../fixtures'

// The coach's review after an outing (#267): the session of the day done, how it felt, and the form changing.
test.use({ role: 'account' })

const DAY = 86_400_000
const START = { latitude: 45.9, longitude: 6.12, accuracy: 5 }
const PARIS_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' })

// When the page's fake clock starts (#313). The recorder times fixes with Date.now(): half an hour ago, so the
// 25 min outing ends before now. The coach counts an outing on the day it ends and keeps the duration chosen on
// /coach for the day it was chosen on (French dates), so the choice, the outing and its review must share a
// day: an hour and a half ago when half an hour ago is too close to midnight in Paris.
function clockStart(now: number) {
  const start = now - 30 * 60_000
  return PARIS_DATE.format(start) === PARIS_DATE.format(start + 45 * 60_000) ? start : now - 90 * 60_000
}

async function addOuting(page: Page, routeId: string, start: number, daysAgo: number) {
  const response = await page.request.post(`/api/routes/${routeId}/outings`, {
    data: { started_at: new Date(start - daysAgo * DAY - 3_600_000).toISOString(), duration_s: 3000, moving_s: 3000, distance_m: 50_000 },
  })
  expect(response.ok()).toBe(true)
}

test.use({ permissions: ['geolocation'], geolocation: START })

test('a recorded outing is the session of the day, its feeling weighs on the form', async ({ page, context }) => {
  test.slow()
  // Steady outings on a private ~50 km route over 5 weeks, like coach-session.spec.ts: the coach judges the form.
  const { id: routeId } = await (await page.request.post('/api/routes', {
    data: { name: 'Bilan du coach e2e', sport_type: 'running', is_public: false, coordinates: [[6.1, 45.9], [6.1, 46.35]] },
  })).json() as { id: string }
  const recorded: string[] = []
  const start = clockStart(Date.now())

  try {
    // All before the week's Monday, so the week's volume (#284) leaves the whole time chosen whatever the day:
    // counted from the fake clock in Paris time, not from the machine's (UTC on CI).
    const sinceMonday = (new Date(PARIS_DATE.format(start)).getUTCDay() + 6) % 7
    for (const daysAgo of [8, 12, 15, 19, 22, 26, 29, 33, 1, 3]) await addOuting(page, routeId, start, daysAgo + sinceMonday)
    // No goal set: coach-session.spec.ts, run after this one on the same account on CI, starts without any.

    await page.clock.install({ time: new Date(start) })
    page.on('dialog', dialog => dialog.accept())

    // 30 min chosen on the coach page: the review looks for that session.
    await page.goto('/coach')
    await waitForHydration(page)
    await page.getByTestId('coach-session-durations').getByRole('button', { name: '30 min' }).click()
    await expect(page.getByTestId('coach-session')).toHaveAttribute('data-minutes', '30')

    // 25 min of walking, 100 m a minute.
    await page.goto('/record')
    await waitForMap(page)
    await page.getByRole('button', { name: 'Démarrer' }).click()
    for (let i = 1; i <= 25; i++) {
      await page.clock.fastForward(60_000)
      await context.setGeolocation({ ...START, latitude: START.latitude + (i * 100) / 111_194.93 })
    }
    await expect(page.getByTestId('distance')).toHaveText('2,50 km')
    await page.getByRole('button', { name: 'Terminer' }).click()
    await page.getByRole('dialog', { name: 'Terminer la sortie' }).getByRole('button', { name: 'Enregistrer' }).click()

    await expect(page).toHaveURL(/\/coach\/bilan\/[0-9a-f-]{36}$/)
    await waitForHydration(page)
    const review = page.getByTestId('coach-review')
    await expect(page.getByTestId('coach-review-stamp')).toHaveText(/Séance\s*faite/)
    await expect(review).toHaveAttribute('data-session', /.+/)
    await expect(page.getByTestId('coach-review-ratio')).toHaveText(/^× \d,\d\d → × \d,\d\d$/)
    await expect(page.getByTestId('coach-review-tomorrow')).toContainText('Demain :')
    const form = page.getByTestId('coach-review-form')
    const ratio = async () => Number(await form.getAttribute('data-ratio'))

    // The feeling weighs the outing's load: very hard counts more than easy.
    const feelings = page.getByTestId('coach-review-feelings')
    await feelings.getByRole('button', { name: 'Facile' }).click()
    await expect(feelings.getByRole('button', { name: 'Facile' })).toHaveAttribute('aria-pressed', 'true')
    const easy = await ratio()
    await feelings.getByRole('button', { name: 'Très dur' }).click()
    await expect(feelings.getByRole('button', { name: 'Très dur' })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(ratio).toBeGreaterThan(easy)
    const veryHard = await ratio()

    // Saved on the outing: still there after a reload.
    await page.reload()
    await waitForHydration(page)
    await expect(feelings.getByRole('button', { name: 'Très dur' })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(ratio).toBeCloseTo(veryHard, 5)

    // It wasn't the session of the day after all: detached, also after a reload.
    await expect(page.getByTestId('coach-review-stamp')).toBeVisible()
    await page.getByTestId('coach-review-detach').click()
    await expect(page.getByTestId('coach-review-stamp')).toBeHidden()
    await expect(page.getByTestId('coach-review-detach')).toHaveText("C'était la séance du jour")
    await page.reload()
    await waitForHydration(page)
    await expect(page.getByTestId('coach-review-detach')).toHaveText("C'était la séance du jour")
    await expect(page.getByTestId('coach-review-stamp')).toBeHidden()

    await page.getByRole('link', { name: 'Terminer' }).click()
    await expect(page).toHaveURL(/\/routes\/[0-9a-f-]{36}\?tab=outings$/)
    recorded.push(new URL(page.url()).pathname.split('/').pop()!)
  }
  finally {
    for (const id of [routeId, ...recorded]) expect((await page.request.delete(`/api/routes/${id}`)).ok()).toBe(true)
  }
})
