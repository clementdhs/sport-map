import { supabaseAdmin } from '../admin'
import { expect, moveEditorFarAway, openProfileRoutes, routeAction, test, waitForMap } from '../fixtures'

test.use({ role: 'account' })

// The loop panel's Overpass answers are kept for the family (#311), and every test starts at the map's centre:
// each test gets its own OpenStreetMap. Only this file generates loops through places.
test.beforeEach(async () => {
  await supabaseAdmin('/rest/v1/loop_place_searches?key=neq.', { method: 'DELETE' })
})

test('draws, saves, then edits a route', async ({ page }) => {
  await page.goto('/routes/create')
  await waitForMap(page)
  // Visible to the family until it is made private.
  await moveEditorFarAway(page)

  // The sport chosen first decides how segments are routed.
  const sportChips = page.getByRole('group', { name: 'Sport', exact: true })
  await sportChips.getByRole('button', { name: 'VTT', exact: true }).click()
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
  for (const [chip, sport, value] of [['Course', 'Course sur route', 'running'], ['VTT', 'VTT', 'mountain_biking']] as const) {
    await sportChips.getByRole('button', { name: chip, exact: true }).click()
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
  // The points of interest are the route's steps (#233): numbered signs, with the arrival on the yellow.
  const steps = page.getByRole('region', { name: 'Étapes' })
  await expect(steps.getByTestId('route-step')).toHaveCount(2)
  await expect(steps.getByTestId('route-step').first()).toContainText(/Fontaine.*Point d'eau/)
  await expect(steps.getByTestId('route-step').last()).toContainText('Arrivée')
  await expect(page.getByTestId('profile-step')).toHaveText('1')
  await expect(page.locator('[data-poi-marker]')).toHaveCount(1)
  await expect(page.getByRole('img', { name: "Étape 1 · Point d'eau — Fontaine" })).toBeVisible()

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

    // Moving it can be cancelled from the map.
    const moveStart = page.getByRole('status').filter({ hasText: 'Clique sur la carte pour déplacer le départ.' })
    await panel.getByRole('button', { name: 'Déplacer' }).click()
    await expect(moveStart).toBeVisible()
    await moveStart.getByRole('button', { name: 'Annuler' }).click()
    await expect(moveStart).toHaveCount(0)
    await expect(panel.getByText('Départ placé')).toBeVisible()

    const trail = panel.getByRole('group', { name: 'Sport', exact: true }).getByRole('button', { name: 'Trail', exact: true })
    await trail.click()
    await expect(trail).toHaveAttribute('aria-pressed', 'true')
    await panel.getByRole('tab', { name: 'Durée' }).click()
    // Trail is estimated at 8 min/km on the flat, plus 100 m of gain as 1 km: rolling, 27.5 m per km (#214).
    // 60 min by default, in 5 min steps.
    await expect(panel.getByText('Environ 5,88 km avec ~162 m de D+.')).toBeVisible()
    const duration = panel.getByRole('slider', { name: 'Durée (min)' })
    await duration.press('ArrowLeft')
    await duration.press('ArrowLeft')
    await expect(duration).toHaveAttribute('aria-valuenow', '50')
    await expect(panel.getByText('Environ 4,90 km avec ~135 m de D+.')).toBeVisible()

    const requests: { length_m: number, sport_type: string, seed: number }[] = []
    page.on('request', (request) => {
      if (request.url().endsWith('/api/routing/loop')) requests.push(request.postDataJSON())
    })
    await panel.getByRole('button', { name: 'Proposer des boucles' }).click()
    const proposals = panel.getByRole('list', { name: 'Boucles proposées' }).getByRole('listitem')
    await expect(proposals).toHaveCount(3)
    for (const [i, proposal] of (await proposals.all()).entries()) {
      await expect(proposal).toContainText(`Boucle ${i + 1}`)
      await expect(proposal).toContainText(/4,9\d km · \d+ m D\+/)
      await expect(proposal).toContainText(/Durée estimée : \d/)
    }
    expect(requests.map(({ length_m, sport_type }) => ({ length_m, sport_type }))).toEqual(Array(3).fill({ length_m: 4902, sport_type: 'trail' }))
    expect(new Set(requests.map(request => request.seed)).size).toBe(3)
    await expect(panel.getByRole('button', { name: 'Autres propositions' })).toBeEnabled()

    // The chosen loop becomes the editor's track, cut into editable segments.
    // The first one is picked until another one is.
    const picked = panel.getByRole('list', { name: 'Boucles proposées' }).getByRole('button', { pressed: true })
    await expect(picked).toContainText('Boucle 1')
    await panel.getByRole('button', { name: /^Boucle 2/ }).click()
    await expect(picked).toContainText('Boucle 2')
    await panel.getByRole('button', { name: 'Choisir cette boucle' }).click()
    await expect(panel).toHaveCount(0)
    await expect(page.locator('p.text-3xl')).toHaveText(/^4,9\d km$/)
    await expect(page.getByText('Le parcours revient à son point de départ.')).toBeVisible()
    await expect(page.getByText('Profil altimétrique')).toBeVisible()
    await expect(page.getByRole('group', { name: 'Sport', exact: true }).getByRole('button', { pressed: true })).toHaveText('Trail')

    await expect(page).toHaveURL('/routes/create?mode=manual')
    await expect(page.getByRole('tab', { name: 'À la main' })).toHaveAttribute('aria-selected', 'true')

    // Undo brings back the empty editor.
    await page.getByRole('button', { name: 'Annuler la dernière action' }).click()
    await expect(page.locator('p.text-3xl')).toHaveText('0 m')
  })
}

test('generates an out and back of a rough length through the highest peak (#214)', async ({ page }) => {
  // A peak 2 km north of the map's centre, once the start is placed there.
  let peak: [number, number] | null = null
  await page.route('**/api/interpreter', async (route) => {
    const elements = peak ? [{ type: 'node', id: 42, lon: peak[0], lat: peak[1], tags: { natural: 'peak', ele: '1234', name: 'Mont Test' } }] : []
    await route.fulfill({ json: { elements } })
  })
  await page.goto('/routes/create?mode=loop')
  await waitForMap(page)
  const panel = page.getByRole('region', { name: 'Boucle automatique' })
  const map = page.locator('.maplibregl-canvas')
  const box = (await map.boundingBox())!
  await map.click({ position: { x: box.width / 2, y: box.height / 2 } })
  await expect(panel.getByText('Départ placé')).toBeVisible()
  const [lng, lat] = (await page.locator('[data-map-center]').getAttribute('data-map-center'))!.split(',').map(Number)
  peak = [lng!, lat! + 0.018]

  await panel.getByRole('switch', { name: /Aller-retour/ }).click()
  await panel.getByRole('switch', { name: /Longueur approximative/ }).click()
  await panel.getByRole('tab', { name: 'Costaud' }).click()
  await panel.getByRole('combobox', { name: 'Passer par' }).click()
  await page.getByRole('option', { name: 'Le sommet le plus haut à portée' }).click()

  const requests: { shape: string, precision: string, via?: [number, number] }[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/api/routing/loop')) requests.push(request.postDataJSON())
  })
  await panel.getByRole('button', { name: 'Proposer des boucles' }).click()
  await expect(panel.getByText('Passe par Mont Test (1234 m).')).toBeVisible()
  const proposals = panel.getByRole('list', { name: 'Allers-retours proposés' }).getByRole('listitem')
  await expect(proposals).toHaveCount(3)
  await expect(proposals.first()).toContainText('Aller-retour 1')
  // The fixtures' squares climb 50 m: flat for a run of 10 km.
  await expect(proposals.first()).toContainText('Plat')
  expect(requests).toHaveLength(3)
  for (const request of requests) {
    expect(request.shape).toBe('out_and_back')
    expect(request.precision).toBe('range')
    expect(request.via?.[0]).toBeCloseTo(peak[0], 5)
    expect(request.via?.[1]).toBeCloseTo(peak[1], 5)
  }

  await panel.getByRole('button', { name: 'Choisir cet aller-retour' }).click()
  await expect(page.locator('p.text-3xl')).toHaveText(/^10,0\d km$/)
})

test('keeps the peaks found around a start, even while Overpass is down (#311)', async ({ page }) => {
  let start: [number, number] = [0, 0]
  let overpassDown = false
  const overpassQueries: string[] = []
  await page.route('**/api/interpreter', async (route) => {
    overpassQueries.push(route.request().postData() ?? '')
    if (overpassDown) return route.fulfill({ status: 504, body: 'Gateway Timeout' })
    const [lng, lat] = start
    await route.fulfill({ json: { elements: [{ type: 'node', id: 43, lon: lng, lat: lat + 0.018, tags: { natural: 'peak', ele: '1500', name: 'Mont Cache' } }] } })
  })
  const generateThroughPeak = async () => {
    await page.goto('/routes/create?mode=loop')
    await waitForMap(page)
    const panel = page.getByRole('region', { name: 'Boucle automatique' })
    const map = page.locator('.maplibregl-canvas')
    const box = (await map.boundingBox())!
    await map.click({ position: { x: box.width / 2, y: box.height / 2 } })
    await expect(panel.getByText('Départ placé')).toBeVisible()
    start = (await page.locator('[data-map-center]').getAttribute('data-map-center'))!.split(',').map(Number) as [number, number]
    await panel.getByRole('combobox', { name: 'Passer par' }).click()
    await page.getByRole('option', { name: 'Le sommet le plus haut à portée' }).click()
    await panel.getByRole('button', { name: 'Proposer des boucles' }).click()
    await expect(panel.getByText('Passe par Mont Cache (1500 m).')).toBeVisible()
    await expect(panel.getByRole('list', { name: 'Boucles proposées' }).getByRole('listitem')).toHaveCount(3)
  }

  await generateThroughPeak()
  expect(overpassQueries).toHaveLength(1)
  // Kept by the server once Overpass answered.
  await expect.poll(async () => (await supabaseAdmin<unknown[]>('/rest/v1/loop_place_searches?key=like.peak:*&select=key')).length).toBe(1)

  // Another visit from the same start, Overpass down: the kept peak, without asking it.
  overpassDown = true
  await generateThroughPeak()
  expect(overpassQueries).toHaveLength(1)
})

test('aims at a gain in metres, the length deduced from it, and says when the terrain is too flat (#294)', async ({ page }) => {
  await page.goto('/routes/create?mode=loop')
  await waitForMap(page)
  const panel = page.getByRole('region', { name: 'Boucle automatique' })
  const map = page.locator('.maplibregl-canvas')
  const box = (await map.boundingBox())!
  await map.click({ position: { x: box.width / 2, y: box.height / 2 } })
  await expect(panel.getByText('Départ placé')).toBeVisible()

  await panel.getByRole('group', { name: 'Sport' }).getByRole('button', { name: 'Vélo', exact: true }).click()
  await panel.getByRole('tab', { name: 'D+' }).click()
  // 600 m on a bike: a hilly ride of 32 km; the climbing levels give way to the gain.
  await expect(panel.getByText(/^Environ 32,00 km et .+ pour ~600 m de D\+\.$/)).toBeVisible()
  await expect(panel.getByRole('tab', { name: 'Costaud' })).toHaveCount(0)

  const requests: { length_m: number }[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/api/routing/loop')) requests.push(request.postDataJSON())
  })
  await panel.getByRole('button', { name: 'Proposer des boucles' }).click()
  const proposals = panel.getByRole('list', { name: 'Boucles proposées' }).getByRole('listitem')
  await expect(proposals).toHaveCount(3)
  // The fixtures' squares climb 50 m only: said rather than forced.
  await expect(panel.getByTestId('loop-gain-missed')).toContainText("Aucune proposition n'approche 600 m de D+ : le terrain est trop plat")
  await expect(proposals.first()).toContainText('m D+')
  expect(requests.map(request => request.length_m)).toEqual([32_000, 32_000, 32_000])

  // The distance kept too: the length is the distance's again.
  await panel.getByRole('switch', { name: /Fixer aussi la distance/ }).click()
  await expect(panel.getByText(/^Environ .+ avec ~600 m de D\+\.$/)).toBeVisible()
})

test('prefers paths, ranking the loops by their share of path, and keeps road rides on the road (#295)', async ({ page }) => {
  await page.goto('/routes/create?mode=loop')
  await waitForMap(page)
  const panel = page.getByRole('region', { name: 'Boucle automatique' })
  const map = page.locator('.maplibregl-canvas')
  const box = (await map.boundingBox())!
  await map.click({ position: { x: box.width / 2, y: box.height / 2 } })
  await expect(panel.getByText('Départ placé')).toBeVisible()

  const requests: { prefer_paths?: boolean }[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/api/routing/loop')) requests.push(request.postDataJSON())
  })
  await panel.getByRole('switch', { name: /Préférer les chemins/ }).click()
  await panel.getByRole('button', { name: 'Proposer des boucles' }).click()
  const proposals = panel.getByRole('list', { name: 'Boucles proposées' }).getByRole('listitem')
  await expect(proposals).toHaveCount(3)
  // The fixtures give 25, 50 and 75 % of path by seed: the most first.
  await expect(proposals.nth(0)).toContainText('75 % de chemin')
  await expect(proposals.nth(1)).toContainText('50 % de chemin')
  await expect(proposals.nth(2)).toContainText('25 % de chemin')
  expect(requests).toHaveLength(3)
  expect(requests.every(request => request.prefer_paths === true)).toBe(true)

  // Road cycling has no paths to prefer.
  await panel.getByRole('group', { name: 'Sport', exact: true }).getByRole('button', { name: 'Vélo route', exact: true }).click()
  await expect(panel.getByRole('switch', { name: /Préférer les chemins/ })).toHaveCount(0)
})

test('goes through a named river, heads for a named massif and goes without an unknown place (#293)', async ({ page }) => {
  // OpenStreetMap around the start: a river about 1.2 km east, a massif's centre 20 km north, nothing else.
  let start: [number, number] = [0, 0]
  await page.route('**/api/interpreter', async (route) => {
    const query = new URLSearchParams(route.request().postData() ?? '').get('data') ?? ''
    const [lng, lat] = start
    const elements = query.includes('(e|é|è|ê|ë|E|É|È|Ê|Ë)r') && query.includes('waterway')
      ? [{ type: 'way', id: 7, tags: { waterway: 'river', name: 'L\'Isère' }, geometry: [{ lat: lat - 0.05, lon: lng + 0.015 }, { lat: lat + 0.05, lon: lng + 0.015 }] }]
      : query.includes('h(a|à|â|ä|A|À|Â|Ä)rtr')
        ? [{ type: 'relation', id: 3, center: { lat: lat + 0.18, lon: lng }, tags: { boundary: 'natural', place: 'region', name: 'Massif de la Chartreuse' } }]
        : []
    await route.fulfill({ json: { elements } })
  })
  await page.goto('/routes/create?mode=loop')
  await waitForMap(page)
  const panel = page.getByRole('region', { name: 'Boucle automatique' })
  const map = page.locator('.maplibregl-canvas')
  const box = (await map.boundingBox())!
  await map.click({ position: { x: box.width / 2, y: box.height / 2 } })
  await expect(panel.getByText('Départ placé')).toBeVisible()
  start = (await page.locator('[data-map-center]').getAttribute('data-map-center'))!.split(',').map(Number) as [number, number]

  const requests: { via?: [number, number], heading?: number }[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/api/routing/loop')) requests.push(request.postDataJSON())
  })
  await panel.getByRole('combobox', { name: 'Passer par' }).click()
  await page.getByRole('option', { name: 'Un lieu que je nomme' }).click()
  const place = panel.getByRole('textbox', { name: 'Lieu à traverser ou à viser' })
  await place.fill('l\'Isère')
  await panel.getByRole('button', { name: 'Proposer des boucles' }).click()
  await expect(panel.getByText(/^Passage : L'Isère, à 1,\d+ km\.$/)).toBeVisible()
  await expect(panel.getByRole('list', { name: 'Boucles proposées' }).getByRole('listitem')).toHaveCount(3)
  expect(requests).toHaveLength(3)
  for (const request of requests) {
    expect(request.via?.[0]).toBeCloseTo(start[0] + 0.015, 4)
    expect(request.heading).toBeUndefined()
  }

  // Changing the place clears the proposals.
  requests.length = 0
  await place.fill('la Chartreuse')
  await panel.getByRole('button', { name: 'Proposer des boucles' }).click()
  await expect(panel.getByText(/^Direction : Massif de la Chartreuse, à 20(,\d+)? km\./)).toBeVisible()
  await expect(panel.getByRole('list', { name: 'Boucles proposées' }).getByRole('listitem')).toHaveCount(3)
  expect(requests).toHaveLength(3)
  for (const request of requests) {
    expect(request.via).toBeUndefined()
    expect(Math.abs(request.heading!)).toBeLessThan(1)
  }

  requests.length = 0
  await place.fill('Atlantide')
  await panel.getByRole('button', { name: 'Proposer des boucles' }).click()
  await expect(panel.getByText(/^« Atlantide » introuvable à moins de 30 km du départ/)).toBeVisible()
  await expect(panel.getByRole('list', { name: 'Boucles proposées' }).getByRole('listitem')).toHaveCount(3)
  expect(requests.every(request => !request.via && request.heading === undefined)).toBe(true)
})

test('finds a named village with MapTiler and a peak with Nominatim when Overpass is down (#310)', async ({ page }) => {
  let start: [number, number] = [0, 0]
  const overpassQueries: string[] = []
  await page.route('**/api/interpreter', (route) => {
    overpassQueries.push(route.request().postData() ?? '')
    return route.fulfill({ status: 504, body: 'Gateway Timeout' })
  })
  // MapTiler knows a commune 2 km south of the start, Nominatim a peak 3 km east.
  await page.route('https://api.maptiler.com/geocoding/**', (route) => {
    const [lng, lat] = start
    const features = decodeURIComponent(route.request().url()).includes('/Seyssinet.json')
      ? [{ id: 'municipality.46973', text: 'Seyssinet-Pariset', place_type: ['municipality'], center: [lng, lat - 0.018], properties: { ref: 'osm:r191039' } }]
      : []
    return route.fulfill({ json: { features } })
  })
  const nominatimQueries: string[] = []
  await page.route('https://nominatim.openstreetmap.org/**', (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') ?? ''
    nominatimQueries.push(q)
    const [lng, lat] = start
    // Like the real one: nothing for « le mont Moucherotte », the peak for « moucherotte ».
    const results = q === 'moucherotte'
      ? [{ osm_type: 'node', osm_id: 1508804918, lat: String(lat), lon: String(lng + 0.038), category: 'natural', type: 'peak', addresstype: 'peak', name: 'Moucherotte' }]
      : []
    return route.fulfill({ json: results })
  })
  await page.goto('/routes/create?mode=loop')
  await waitForMap(page)
  const panel = page.getByRole('region', { name: 'Boucle automatique' })
  const map = page.locator('.maplibregl-canvas')
  const box = (await map.boundingBox())!
  await map.click({ position: { x: box.width / 2, y: box.height / 2 } })
  await expect(panel.getByText('Départ placé')).toBeVisible()
  start = (await page.locator('[data-map-center]').getAttribute('data-map-center'))!.split(',').map(Number) as [number, number]

  const requests: { via?: [number, number], heading?: number }[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/api/routing/loop')) requests.push(request.postDataJSON())
  })
  await panel.getByRole('combobox', { name: 'Passer par' }).click()
  await page.getByRole('option', { name: 'Un lieu que je nomme' }).click()
  const place = panel.getByRole('textbox', { name: 'Lieu à traverser ou à viser' })
  await place.fill('Seyssinet')
  await panel.getByRole('button', { name: 'Proposer des boucles' }).click()
  await expect(panel.getByText(/^Passage : Seyssinet-Pariset, à \d(,\d+)? km\.$/)).toBeVisible()
  await expect(panel.getByRole('list', { name: 'Boucles proposées' }).getByRole('listitem')).toHaveCount(3)
  expect(requests).toHaveLength(3)
  for (const request of requests) expect(request.via?.[1]).toBeCloseTo(start[1] - 0.018, 4)

  // A peak isn't asked to MapTiler: Overpass first, then Nominatim, with the name as said then its core.
  requests.length = 0
  nominatimQueries.length = 0
  await place.fill('le mont Moucherotte')
  await panel.getByRole('button', { name: 'Proposer des boucles' }).click()
  await expect(panel.getByText(/^Passage : Moucherotte, à \d(,\d+)? km\.$/)).toBeVisible()
  await expect(panel.getByRole('list', { name: 'Boucles proposées' }).getByRole('listitem')).toHaveCount(3)
  expect(nominatimQueries).toEqual(['le mont Moucherotte', 'moucherotte'])
  expect(overpassQueries.length).toBeGreaterThan(0)
  for (const request of requests) expect(request.via?.[0]).toBeCloseTo(start[0] + 0.038, 4)

  // Found nowhere: the proposals go without it, as before.
  requests.length = 0
  await place.fill('Atlantide')
  await panel.getByRole('button', { name: 'Proposer des boucles' }).click()
  await expect(panel.getByText(/^« Atlantide » introuvable à moins de 30 km du départ/)).toBeVisible()
  await expect(panel.getByRole('list', { name: 'Boucles proposées' }).getByRole('listitem')).toHaveCount(3)
  expect(requests.every(request => !request.via && request.heading === undefined)).toBe(true)
})

test('fills the loop settings from a sentence, then generates (#216)', async ({ page }) => {
  // The LLM is the server's: its reading is simulated here, as the routing is.
  const sentences: string[] = []
  let answer: { status: number, json: object } = {
    status: 200,
    json: {
      settings: {
        sport: 'hiking',
        target: { kind: 'distance', km: 6 },
        precision: null,
        shape: 'out_and_back',
        climb: 'hilly',
        start: { kind: 'my_point' },
        place: { name: 'Isère', text: 'le long de l\'Isère' },
        paths: true,
        gain: null,
        ignored: [],
      },
      quota_remaining: 29,
    },
  }
  // No river of that name around the test start: the proposals go without it.
  await page.route('**/api/interpreter', route => route.fulfill({ json: { elements: [] } }))
  await page.route('**/api/loops/understand', async (route) => {
    sentences.push((route.request().postDataJSON() as { sentence: string }).sentence)
    await route.fulfill(answer)
  })
  await page.goto('/routes/create?mode=loop')
  await waitForMap(page)
  const panel = page.getByRole('region', { name: 'Boucle automatique' })
  const map = page.locator('.maplibregl-canvas')
  const box = (await map.boundingBox())!
  await map.click({ position: { x: box.width / 2, y: box.height / 2 } })
  await expect(panel.getByText('Départ placé')).toBeVisible()

  const requests: { length_m: number, sport_type: string, shape: string }[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/api/routing/loop')) requests.push(request.postDataJSON())
  })
  const field = panel.getByRole('textbox', { name: 'Décris ta sortie' })
  await field.fill('Rando costaud de 6 km en aller-retour depuis mon point sur du chemin')
  await field.press('Enter')

  const understood = panel.getByTestId('loop-sentence-understood')
  await expect(understood).toContainText('Compris')
  for (const chip of ['Rando', '6 km', 'Aller-retour', 'Costaud', 'Lieu : Isère', 'Sur du chemin', 'Départ : point posé']) {
    await expect(understood.getByRole('button', { name: chip })).toBeVisible()
  }
  // Paths are a setting since #295.
  await expect(panel.getByRole('switch', { name: /Préférer les chemins/ })).toBeChecked()
  // The named place fills « Passer par » (#293); OpenStreetMap (simulated as empty here) decides its role.
  await expect(panel.getByRole('textbox', { name: 'Lieu à traverser ou à viser' })).toHaveValue('Isère')
  const proposals = panel.getByRole('list', { name: 'Allers-retours proposés' }).getByRole('listitem')
  await expect(proposals).toHaveCount(3)
  expect(sentences).toEqual(['Rando costaud de 6 km en aller-retour depuis mon point sur du chemin'])
  expect(requests).toHaveLength(3)
  for (const request of requests) expect(request).toMatchObject({ length_m: 6000, sport_type: 'hiking', shape: 'out_and_back' })
  // The sentence stays, and the settings it filled stay the member's to change.
  await expect(field).toHaveValue(/^Rando costaud/)
  await expect(panel.getByRole('tab', { name: 'Costaud' })).toHaveAttribute('aria-selected', 'true')
  await panel.getByRole('tab', { name: 'Plat' }).click()
  await expect(panel.getByRole('tab', { name: 'Plat' })).toHaveAttribute('aria-selected', 'true')
  await panel.getByRole('switch', { name: /Aller-retour/ }).click()
  await expect(panel.getByRole('button', { name: 'Proposer des boucles' })).toBeEnabled()

  // Not understood: said, and the panel stays as it is.
  answer = { status: 422, json: { statusCode: 422, statusMessage: 'Je n\'ai pas compris ta phrase' } }
  await field.fill('Un truc sympa pas trop loin')
  await panel.getByRole('button', { name: 'Comprendre ma phrase' }).click()
  await expect(panel.getByRole('alert')).toContainText('Je n\'ai pas compris ta phrase.')
  await expect(understood).toBeHidden()
  await expect(panel.getByRole('tab', { name: 'Plat' })).toHaveAttribute('aria-selected', 'true')
  await expect(panel.getByRole('button', { name: 'Proposer des boucles' })).toBeEnabled()
})

test('dictates the sentence into the field, to be read before sending (#296)', async ({ page }) => {
  // The browser's speech recognition is simulated: it hears `window.heard`, or fails with `window.dictationError`.
  await page.addInitScript(() => {
    const scope = window as unknown as Record<string, unknown>
    delete scope.SpeechRecognition
    scope.webkitSpeechRecognition = class {
      lang = ''
      onresult: ((event: object) => void) | null = null
      onerror: ((event: object) => void) | null = null
      onend: (() => void) | null = null
      start() {
        scope.dictationLang = this.lang
        setTimeout(() => {
          const error = scope.dictationError as string | undefined
          if (error) this.onerror?.({ error })
          else this.onresult?.({ results: [[{ transcript: scope.heard as string }]] })
          this.onend?.()
        }, 50)
      }

      stop() {}
      abort() {}
    }
  })
  const sentences: string[] = []
  await page.route('**/api/loops/understand', async (route) => {
    sentences.push((route.request().postDataJSON() as { sentence: string }).sentence)
    await route.fulfill({ status: 422, json: { statusCode: 422, statusMessage: 'Je n\'ai pas compris ta phrase' } })
  })
  await page.goto('/routes/create?mode=loop')
  await waitForMap(page)
  const panel = page.getByRole('region', { name: 'Boucle automatique' })
  const field = panel.getByRole('textbox', { name: 'Décris ta sortie' })
  const mic = panel.getByRole('button', { name: 'Dicter ma phrase' })

  await page.evaluate(() => { (window as unknown as Record<string, unknown>).heard = 'boucle de 10 km' })
  await mic.click()
  await expect(field).toHaveValue('boucle de 10 km')
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).dictationLang)).toBe('fr-FR')
  // Never sent on its own: the member reads it, corrects it, then sends.
  expect(sentences).toEqual([])
  await page.evaluate(() => { (window as unknown as Record<string, unknown>).heard = 'depuis mon point' })
  await mic.click()
  await expect(field).toHaveValue('boucle de 10 km depuis mon point')
  await field.press('Enter')
  await expect.poll(() => sentences).toEqual(['boucle de 10 km depuis mon point'])

  // A refused microphone is said next to the field, which stays as it was.
  await page.evaluate(() => { (window as unknown as Record<string, unknown>).dictationError = 'not-allowed' })
  await mic.click()
  await expect(panel.getByTestId('loop-sentence-dictation-error')).toContainText('Micro refusé')
  await expect(field).toHaveValue('boucle de 10 km depuis mon point')

  // No speech recognition (Firefox): no button.
  await page.addInitScript(() => {
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition
  })
  await page.reload()
  await waitForMap(page)
  await expect(panel.getByRole('textbox', { name: 'Décris ta sortie' })).toBeVisible()
  await expect(panel.getByTestId('loop-sentence-mic')).toHaveCount(0)
})

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
