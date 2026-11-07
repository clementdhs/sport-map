import { expect, moveEditorFarAway, openProfileRoutes, routeAction, test, waitForMap } from '../fixtures'

test.use({ role: 'account' })

test('draws, saves, then edits a route', async ({ page }) => {
  await page.goto('/routes/create')
  await waitForMap(page)
  // Visible to the family until it is made private.
  await moveEditorFarAway(page)

  // The sport chosen first decides how segments are routed.
  await page.getByRole('combobox', { name: 'Sport' }).click()
  await page.getByRole('option', { name: 'VTT' }).click()
  await expect(page.getByText('Itinéraire adapté : VTT')).toBeVisible()
  const routing = page.waitForRequest('**/api/routing/segment')

  // Three waypoints across the map; routing is mocked by the fixtures.
  const map = page.locator('.maplibregl-canvas')
  const box = (await map.boundingBox())!
  for (const [x, y] of [[0.3, 0.4], [0.5, 0.6], [0.7, 0.4]] as const) {
    await map.click({ position: { x: box.width * x, y: box.height * y } })
  }
  expect((await routing).postDataJSON()).toMatchObject({ mode: 'snap', sport_type: 'mountain_biking' })

  await expect(page.getByText('Profil altimétrique')).toBeVisible()
  await expect(page.getByText('0 m', { exact: true })).toHaveCount(0)

  // Another sport leaves the drawn track as it is, until it is routed again for it.
  const sports: string[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/api/routing/segment')) sports.push(request.postDataJSON().sport_type)
  })
  const outdated = page.getByText("2 segments suivent les chemins d'un autre sport")
  for (const [sport, value] of [['Course sur route', 'running'], ['VTT', 'mountain_biking']] as const) {
    await page.getByRole('combobox', { name: 'Sport' }).click()
    await page.getByRole('option', { name: sport }).click()
    await expect(outdated).toBeVisible()
    sports.length = 0
    await page.getByRole('button', { name: `Recalculer pour ${sport}` }).click()
    await expect(outdated).toHaveCount(0)
    expect(sports).toEqual([value, value])
  }

  // A point of interest, placed by clicking near the first segment.
  await page.getByRole('button', { name: 'Ajouter' }).click()
  await map.click({ position: { x: box.width * 0.4, y: box.height * 0.5 } })
  await page.getByRole('textbox', { name: "Note du point d'intérêt 1" }).fill('Fontaine')

  await page.getByLabel('Nom').fill('Parcours e2e')
  await page.getByRole('button', { name: 'Enregistrer le parcours' }).click()

  await expect(page).toHaveURL(/\/routes\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: 'Parcours e2e' })).toBeVisible()
  await expect(page.getByText('VTT', { exact: true })).toBeVisible()
  // The ways of the snapped segments, the difficulty on the mountain bike scale.
  await expect(page.getByRole('region', { name: 'Type de surface' })).toContainText(/Goudron\s+50\s%/)
  await expect(page.getByRole('region', { name: 'Type de surface' })).toContainText(/Chemin\s+50\s%/)
  await expect(page.getByRole('region', { name: 'Difficulté VTT (échelle S0 à S6)' })).toContainText('S2 obstacles, marches')
  const pois = page.getByRole('region', { name: "Points d'intérêt" })
  await expect(pois).toContainText("Point d'eau")
  await expect(pois).toContainText('Fontaine')
  await expect(page.locator('[data-poi-marker]')).toHaveCount(1)

  // Editing reopens the same route, and saving updates it in place.
  const detailUrl = page.url()
  const ogImageUrl = `${detailUrl.replace('/routes/', '/api/routes/')}/og.png`
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', new RegExp(`^${ogImageUrl}\\?v=\\d+&lang=fr$`))
  await routeAction(page, 'Modifier le parcours')
  await waitForMap(page)
  await expect(page.getByLabel('Nom')).toHaveValue('Parcours e2e')
  await page.getByRole('switch', { name: "Visible par l'équipe" }).click()
  await page.getByRole('button', { name: 'Enregistrer les modifications' }).click()

  await expect(page).toHaveURL(detailUrl)
  await expect(page.getByText('Privé', { exact: true })).toBeVisible()

  // A private route has no link preview image, not even for its owner (it could end up in a public cache).
  await page.reload()
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(0)
  expect((await page.request.get(ogImageUrl)).status()).toBe(404)

  // The private route stays listed on its owner's profile.
  await page.goto('/profile')
  await openProfileRoutes(page)
  await expect(page.getByRole('link', { name: /Parcours e2e/ })).toBeVisible()
})

test('moves the editor map to a searched place without touching the track', async ({ page }) => {
  await page.route('https://api.maptiler.com/geocoding/**', route => route.fulfill({
    json: { features: [{ place_name: 'Annecy, Haute-Savoie, France', center: [6.129, 45.899], bbox: [6.10, 45.88, 6.16, 45.93] }] },
  }))
  await page.goto('/routes/create')
  await waitForMap(page)

  const map = page.locator('.maplibregl-canvas')
  const box = (await map.boundingBox())!
  for (const [x, y] of [[0.3, 0.4], [0.5, 0.6]] as const) {
    await map.click({ position: { x: box.width * x, y: box.height * y } })
  }
  const distance = page.locator('p.text-3xl')
  await expect(distance).not.toHaveText('0 m')
  const drawn = await distance.textContent()

  const searchBox = page.getByRole('combobox', { name: 'Rechercher un lieu' })
  await searchBox.fill('Annecy')
  // Places only: no route name search in the editor.
  await expect(page.getByRole('option', { name: 'Annecy, Haute-Savoie, France' })).toBeVisible()
  await expect(page.getByRole('option', { name: /Parcours contenant/ })).toHaveCount(0)
  await page.getByRole('option', { name: 'Annecy, Haute-Savoie, France' }).click()

  await expect.poll(async () => {
    const [lng, lat] = (await page.locator('[data-map-center]').getAttribute('data-map-center'))!.split(',').map(Number)
    return Math.abs(lng! - 6.13) < 0.05 && Math.abs(lat! - 45.905) < 0.05
  }, { timeout: 10_000 }).toBe(true)
  await expect(distance).toHaveText(drawn!)
})

test('imports a GPX file dropped on the editor map', async ({ page }) => {
  await page.goto('/routes/create')
  await waitForMap(page)

  const gpx = `<?xml version="1.0"?><gpx version="1.1" creator="e2e" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Tour déposé</name><trkseg>
    <trkpt lat="45.899" lon="6.129"><ele>450</ele></trkpt><trkpt lat="45.905" lon="6.135"><ele>480</ele></trkpt><trkpt lat="45.910" lon="6.140"><ele>470</ele></trkpt>
  </trkseg></trk></gpx>`
  // Playwright can't drag files from the OS: dispatch the drag events with a DataTransfer built in the page.
  const drop = async (files: { name: string, content: string }[]) => {
    const dataTransfer = await page.evaluateHandle((files) => {
      const transfer = new DataTransfer()
      for (const { name, content } of files) transfer.items.add(new File([content], name, { type: 'application/gpx+xml' }))
      return transfer
    }, files)
    const zone = page.locator('[data-gpx-dropzone]')
    await zone.dispatchEvent('dragenter', { dataTransfer })
    await expect(page.getByText('Dépose ton fichier GPX pour l\'importer')).toBeVisible()
    await zone.dispatchEvent('drop', { dataTransfer })
    await expect(page.getByText('Dépose ton fichier GPX pour l\'importer')).toHaveCount(0)
  }

  await drop([{ name: 'notes.txt', content: 'pas un gpx' }])
  await expect(page.getByText('Seuls les fichiers GPX (.gpx) peuvent être importés.').first()).toBeVisible()
  await drop([{ name: 'a.gpx', content: gpx }, { name: 'b.gpx', content: gpx }])
  await expect(page.getByText('Dépose un seul fichier GPX à la fois.').first()).toBeVisible()
  await expect(page.locator('p.text-3xl')).toHaveText('0 m')

  await drop([{ name: 'tour.gpx', content: gpx }])
  await expect(page.getByText('Trace importée').first()).toBeVisible()
  await expect(page.locator('p.text-3xl')).not.toHaveText('0 m')
  await expect(page.getByText('Profil altimétrique')).toBeVisible()
  await expect(page.getByLabel('Nom')).toHaveValue('Tour déposé')
})


// Loops are mocked by the fixtures: a square of the asked length, turned by the seed.
for (const device of [{ name: 'phone', width: 375, height: 812 }, { name: 'computer', width: 1280, height: 800 }]) {
  test(`generates loops from a start and a distance, then edits the chosen one, on a ${device.name}`, async ({ page }) => {
    await page.setViewportSize({ width: device.width, height: device.height })
    await page.goto('/routes/create')
    await waitForMap(page)
    // Without a track, the sheet's title (shown on phones) names the page rather than a distance of 0 m.
    if (device.name === 'phone') await expect(page.getByText('Nouveau parcours', { exact: true })).toBeVisible()

    // One panel, one mode bar (#215); the instruction to place the start floats over the map.
    const placeStart = page.getByRole('status').filter({ hasText: 'Clique sur la carte pour placer le départ.' })
    await expect(placeStart).toBeVisible()
    await page.getByRole('tab', { name: 'Boucle' }).click()
    await expect(page).toHaveURL('/routes/create?mode=loop')
    const panel = page.getByRole('region', { name: 'Boucle automatique' })
    await expect(panel.getByText('Pas encore de départ.')).toBeVisible()
    await expect(placeStart).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Proposer des boucles' })).toBeDisabled()

    // The start, in the part of the map above the bottom sheet on a phone.
    const map = page.locator('.maplibregl-canvas')
    const box = (await map.boundingBox())!
    await map.click({ position: { x: box.width * 0.6, y: box.height * 0.3 } })
    await expect(panel.getByText('Départ placé')).toBeVisible()
    await expect(placeStart).toHaveCount(0)

    // Picking it again can be cancelled from the map.
    await panel.getByRole('button', { name: 'Choisir sur la carte' }).click()
    await expect(placeStart).toBeVisible()
    await placeStart.getByRole('button', { name: 'Annuler' }).click()
    await expect(placeStart).toHaveCount(0)
    await expect(panel.getByText('Départ placé')).toBeVisible()

    await panel.getByRole('combobox', { name: 'Sport' }).click()
    await page.getByRole('option', { name: 'Trail' }).click()
    await panel.getByRole('tab', { name: 'Durée' }).click()
    // Trail is estimated at 8 min/km on the flat.
    const duration = panel.getByLabel('Durée (min)')
    await duration.fill('64')
    await duration.press('Tab')
    await expect(panel.getByText('Environ 8,00 km sur le plat.')).toBeVisible()

    const requests: { length_m: number, sport_type: string, seed: number }[] = []
    page.on('request', (request) => {
      if (request.url().endsWith('/api/routing/loop')) requests.push(request.postDataJSON())
    })
    await panel.getByRole('button', { name: 'Proposer des boucles' }).click()
    const proposals = panel.getByRole('list', { name: 'Boucles proposées' }).getByRole('listitem')
    await expect(proposals).toHaveCount(3)
    for (const [i, proposal] of (await proposals.all()).entries()) {
      await expect(proposal).toContainText(`Boucle ${i + 1}`)
      await expect(proposal).toContainText(/8,0\d km · D\+ \d+ m · ~1 h \d\d/)
    }
    expect(requests.map(({ length_m, sport_type }) => ({ length_m, sport_type }))).toEqual(Array(3).fill({ length_m: 8000, sport_type: 'trail' }))
    expect(new Set(requests.map(request => request.seed)).size).toBe(3)
    await expect(panel.getByRole('button', { name: 'Autres propositions' })).toBeEnabled()

    // The chosen loop becomes the editor's track, cut into editable segments.
    await panel.getByRole('button', { name: 'Choisir la boucle 2' }).click()
    await expect(panel).toHaveCount(0)
    await expect(page.locator('p.text-3xl')).toHaveText(/^8,0\d km$/)
    await expect(page.getByText('Le parcours revient à son point de départ.')).toBeVisible()
    await expect(page.getByText('Profil altimétrique')).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Sport' })).toContainText('Trail')

    await expect(page).toHaveURL('/routes/create?mode=manual')
    await expect(page.getByRole('tab', { name: 'À la main' })).toHaveAttribute('aria-selected', 'true')

    // Undo brings back the empty editor.
    await page.getByRole('button', { name: 'Annuler la dernière action' }).click()
    await expect(page.locator('p.text-3xl')).toHaveText('0 m')
  })
}

test('shares the start between the modes and remembers the last one', async ({ page }) => {
  await page.goto('/routes/create')
  await waitForMap(page)
  const loopTab = page.getByRole('tab', { name: 'Boucle' })
  const manualTab = page.getByRole('tab', { name: 'À la main' })
  const importGpx = page.getByRole('button', { name: 'Importer un fichier GPX' })
  await expect(manualTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('Déjà un tracé ?')).toBeVisible()
  await expect(importGpx).toBeVisible()

  await loopTab.click()
  await expect(importGpx).toBeVisible()
  const map = page.locator('.maplibregl-canvas')
  const box = (await map.boundingBox())!
  await map.click({ position: { x: box.width * 0.5, y: box.height * 0.5 } })
  const panel = page.getByRole('region', { name: 'Boucle automatique' })
  await expect(panel.getByText('Départ placé')).toBeVisible()

  // Drawing by hand goes on from the loop's start, and back again.
  await manualTab.click()
  await expect(page.getByText('Clique sur la carte pour placer le point suivant.')).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'placer le départ' })).toHaveCount(0)
  await loopTab.click()
  await expect(panel.getByText('Départ placé')).toBeVisible()

  // The mode picked last opens the next blank route, and a link can ask for one.
  await page.goto('/routes/create')
  await waitForMap(page)
  await expect(loopTab).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL('/routes/create?mode=loop')
  await page.goto('/routes/create?mode=manual')
  await waitForMap(page)
  await expect(manualTab).toHaveAttribute('aria-selected', 'true')
})

// Last: it uses up the test account's routing quota for the day (the other tests mock routing).
test('caps routing requests per user and per day', async ({ page, requestAs }) => {
  const segment = { from: [6.1, 45.9], to: [6.2, 45.95], mode: 'snap', sport_type: 'running' }
  const loop = { start: [6.1, 45.9], length_m: 10_000, sport_type: 'running', seed: 1 }
  // The e2e server allows 3 a day and has no OpenRouteService key: counted requests then answer 503. Automatic
  // loops count too; straight segments, which only ask the elevation services (#176), don't.
  for (let i = 0; i < 2; i++) {
    expect((await page.request.post('/api/routing/segment', { data: segment })).status()).toBe(503)
  }
  expect((await page.request.post('/api/routing/loop', { data: loop })).status()).toBe(503)
  const refused = await page.request.post('/api/routing/segment', { data: segment })
  expect(refused.status()).toBe(429)
  expect(await refused.json()).toMatchObject({
    statusMessage: "Limite de 3 calculs d'itinéraire par jour atteinte",
    data: { reason: 'daily_quota' },
  })
  expect((await page.request.post('/api/routing/loop', { data: loop })).status()).toBe(429)
  const straight = await page.request.post('/api/routing/segment', { data: { ...segment, mode: 'straight' } })
  expect(straight.status()).toBe(200)
  const line = await straight.json()
  expect(line).toMatchObject({ snapped: false })
  expect(line.elevations).toHaveLength(line.coordinates.length)
  expect(line).not.toHaveProperty('quota_remaining')

  // Signed-out visitors can't use routing at all.
  const visitor = await requestAs(null)
  expect((await visitor.post('/api/routing/segment', { data: segment })).status()).toBe(401)
  expect((await visitor.post('/api/routing/loop', { data: loop })).status()).toBe(401)
})

test('keeps the editing hints behind a help button', async ({ page }) => {
  await page.goto('/routes/create?mode=manual')
  await waitForMap(page)
  const hint = page.getByText('Glisse la ligne pour ajouter un point.')
  await expect(hint).toHaveCount(0)

  // Opened on click, so it works on phones too.
  const help = page.getByRole('button', { name: 'Comment modifier le tracé ?' })
  await help.click()
  await expect(hint).toBeVisible()
  await expect(page.getByText('Clic droit (appui long sur mobile) sur un point pour le supprimer.')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(hint).toBeHidden()
  await expect(help).toBeFocused()
})
