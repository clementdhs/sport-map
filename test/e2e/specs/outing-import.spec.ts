import type { APIRequestContext, Page } from '@playwright/test'
import type { MyProfile } from '../../../shared/types/routes'
import { fitActivity } from '../../fixtures/outings/fit'
import { expect, FAR_AWAY, test, waitForHydration } from '../fixtures'

// Importing outings from GPX, FIT and TCX files (#268): each file becomes an outing on a private route of its own,
// counted in the statistics and the coach's form, and a file imported again is skipped. Tracks go to New Zealand,
// whose search the other specs don't count.

const DAY = 86_400_000
const [LNG, LAT] = FAR_AWAY.center as [number, number]

// A start a few days ago, at a second no other spec uses: duplicates are found by start time on any route.
function startDaysAgo(days: number): Date {
  return new Date(Math.floor((Date.now() - days * DAY) / 1000) * 1000 + 17_000)
}

// Points every 30 s, about 110 m apart northwards, climbing 2 m each.
function points(count: number) {
  return Array.from({ length: count }, (_, i) => ({ lng: LNG, lat: LAT + i * 0.001, alt: 300 + i * 2, s: i * 30 }))
}

function gpxFile(name: string, start: Date) {
  const trkpts = points(6).map(p =>
    `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng}"><ele>${p.alt}</ele><time>${new Date(start.getTime() + p.s * 1000).toISOString()}</time></trkpt>`).join('')
  const xml = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${name}</name><type>running</type><trkseg>${trkpts}</trkseg></trk></gpx>`
  return { name: 'footing.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(xml) }
}

function fitFile(start: Date) {
  const bytes = fitActivity({ start, points: points(5), sport: 17, elapsedS: 120, timerS: 120, distanceM: 440 })
  return { name: 'rando.fit', mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) }
}

function tcxFile(start: Date) {
  const trackpoints = points(4).map(p => `<Trackpoint><Time>${new Date(start.getTime() + p.s * 1000).toISOString()}</Time>`
    + `<Position><LatitudeDegrees>${p.lat}</LatitudeDegrees><LongitudeDegrees>${p.lng}</LongitudeDegrees></Position>`
    + `<AltitudeMeters>${p.alt}</AltitudeMeters></Trackpoint>`).join('')
  const xml = `<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">`
    + `<Activities><Activity Sport="Running"><Lap StartTime="${start.toISOString()}"><Track>${trackpoints}</Track></Lap></Activity></Activities></TrainingCenterDatabase>`
  return { name: 'seance.tcx', mimeType: 'application/vnd.garmin.tcx+xml', buffer: Buffer.from(xml) }
}

// Through the button's file picker, as a member does.
async function importFiles(page: Page, button: string, files: ReturnType<typeof gpxFile>[]) {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: button }).click()
  await (await chooser).setFiles(files)
  const dialog = page.getByRole('dialog', { name: 'Import des sorties' })
  await expect(dialog.getByTestId('outing-import-summary')).toBeVisible()
  return dialog
}

// The routes of the outings starting at these times, deleted after each test.
async function deleteOutingRoutes(request: APIRequestContext, starts: Date[]) {
  const profile = await (await request.get('/api/profile/me')).json() as MyProfile
  const ids = new Set(profile.outings
    // completed_at is the start plus the 2 or 3 min of these outings.
    .filter(outing => outing.outing_id && starts.some(start => Math.abs(Date.parse(outing.completed_at) - start.getTime()) < 5 * 60_000))
    .map(outing => outing.route_id))
  for (const id of ids) expect((await request.delete(`/api/routes/${id}`)).ok()).toBe(true)
}

test.describe('from the profile', () => {
  test.use({ role: 'account' })

  test('a member imports a GPX and a FIT file, sees them in their outings, and nothing twice', async ({ page }) => {
    const gpxStart = startDaysAgo(3)
    const fitStart = startDaysAgo(2)
    const files = [gpxFile('Footing montre e2e', gpxStart), fitFile(fitStart)]
    try {
      await page.goto('/profile')
      await waitForHydration(page)
      const dialog = await importFiles(page, 'Importer des sorties', files)
      await expect(dialog.getByTestId('outing-import-summary')).toHaveText('2 sorties importées.')
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()

      // Both among the routes done, the FIT one named after its day, with its elapsed time.
      await page.getByRole('tab', { name: /Parcours/ }).click()
      await page.getByRole('tab', { name: /Réalisés/ }).click()
      const done = page.getByRole('listitem')
      await expect(done.filter({ hasText: 'Footing montre e2e' })).toHaveCount(1)
      const date = (start: Date) => start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })
      await expect(done.filter({ hasText: `Sortie du ${date(fitStart)}` }).filter({ hasText: `Fait le ${date(fitStart)} · 2 min` })).toHaveCount(1)

      // The same files again: both already there.
      const again = await importFiles(page, 'Importer des sorties', files)
      await expect(again.getByTestId('outing-import-summary')).toHaveText('0 sortie importée, 2 déjà présentes.')
    }
    finally {
      await deleteOutingRoutes(page.request, [gpxStart, fitStart])
    }
  })
})

test.describe('from the coach', () => {
  // The team member records nothing elsewhere: their coach is still learning.
  test.use({ role: 'family' })

  test('a member still unknown to the coach imports a TCX file and a bad one', async ({ page }) => {
    const start = startDaysAgo(1)
    try {
      await page.goto('/coach')
      await waitForHydration(page)
      const encart = page.getByTestId('coach-import')
      await expect(encart).toContainText('Aller plus vite : importe tes sorties')
      const before = await page.locator('[data-day="outing"]').count()

      const dialog = await importFiles(page, 'Choisir des fichiers', [tcxFile(start), { name: 'notes.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from('pas du xml <') }])
      await expect(dialog.getByTestId('outing-import-summary')).toHaveText('1 sortie importée, 1 fichier non importé.')
      await expect(dialog.getByTestId('outing-import-failures')).toContainText('notes.gpx : Ce fichier est illisible ou abîmé.')
      await page.keyboard.press('Escape')

      // The start card counts the day of the imported outing (other specs may add one of today meanwhile).
      await expect.poll(() => page.locator('[data-day="outing"]').count()).toBeGreaterThan(before)
    }
    finally {
      await deleteOutingRoutes(page.request, [start])
    }
  })
})

test.describe('on a route', () => {
  test.use({ role: 'account' })

  // A route along the points of `gpxFile`, 550 m northwards.
  async function createRoute(request: APIRequestContext) {
    const response = await request.post('/api/routes', {
      data: { name: 'Import sur parcours e2e', sport_type: 'running', is_public: false, coordinates: [[LNG, LAT], [LNG, LAT + 0.005]] },
    })
    return (await response.json() as { id: string }).id
  }

  // The same GPX moved `east` degrees of longitude east (0.05°: about 4 km at New Zealand's latitude).
  function movedGpx(start: Date, east: number) {
    const file = gpxFile('Footing ailleurs e2e', start)
    const xml = file.buffer.toString().replace(/lon="([-\d.]+)"/g, (_, lng: string) => `lon="${(Number(lng) + east).toFixed(6)}"`)
    return { ...file, name: 'ailleurs.gpx', buffer: Buffer.from(xml) }
  }

  test('a member imports a watch outing on the route, which counts as done; one done elsewhere is refused', async ({ page }) => {
    const routeId = await createRoute(page.request)
    const start = startDaysAgo(4)
    const elsewhere = startDaysAgo(5)
    try {
      await page.goto(`/routes/${routeId}`)
      await waitForHydration(page)

      const chooser = page.waitForEvent('filechooser')
      await page.getByRole('button', { name: "Plus d'actions" }).click()
      await page.getByRole('menuitem', { name: /Importer une sortie/ }).click()
      await (await chooser).setFiles([gpxFile('Footing montre e2e', start), movedGpx(elsewhere, 0.05)])
      const dialog = page.getByRole('dialog', { name: 'Import des sorties' })
      await expect(dialog.getByTestId('outing-import-summary')).toHaveText('1 sortie importée, 1 fichier non importé.')
      await expect(dialog.getByTestId('outing-import-failures')).toContainText('ailleurs.gpx : Cette sortie ne suit pas ce parcours.')
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()

      // Listed among the route's outings, which is marked as done.
      await expect(page.getByRole('tab', { name: /Passages/ })).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByRole('tab', { name: /Passages/ })).toContainText('1')
      await expect(page.getByRole('button', { name: /Fait le/ })).toBeVisible()
    }
    finally {
      await page.request.delete(`/api/routes/${routeId}`)
    }
  })

  test('a file dropped on the route page is imported on it, and not twice', async ({ page }) => {
    const routeId = await createRoute(page.request)
    const start = startDaysAgo(6)
    const file = gpxFile('Footing déposé e2e', start)
    try {
      await page.goto(`/routes/${routeId}`)
      await waitForHydration(page)

      // Playwright can't drag files from the OS: the drag events carry a DataTransfer built in the page.
      const drop = async () => {
        const dataTransfer = await page.evaluateHandle(({ name, content }) => {
          const transfer = new DataTransfer()
          transfer.items.add(new File([content], name, { type: 'application/gpx+xml' }))
          return transfer
        }, { name: file.name, content: file.buffer.toString() })
        await page.locator('body').dispatchEvent('dragenter', { dataTransfer })
        await expect(page.getByTestId('outing-drop-overlay')).toContainText('ajouter ta sortie à ce parcours')
        await page.locator('body').dispatchEvent('drop', { dataTransfer })
        await expect(page.getByTestId('outing-drop-overlay')).toBeHidden()
        return page.getByRole('dialog', { name: 'Import des sorties' })
      }

      const dialog = await drop()
      await expect(dialog.getByTestId('outing-import-summary')).toHaveText('1 sortie importée.')
      await page.keyboard.press('Escape')
      await expect(page.getByRole('tab', { name: /Passages/ })).toContainText('1')

      const again = await drop()
      await expect(again.getByTestId('outing-import-summary')).toHaveText('0 sortie importée, 1 déjà présente.')
    }
    finally {
      await page.request.delete(`/api/routes/${routeId}`)
    }
  })
})
