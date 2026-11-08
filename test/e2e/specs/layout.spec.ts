import { ACCOUNT_ROUTE_NAME, expect, openProfileRoutes, test, waitForHydration, waitForMap } from '../fixtures'

// A family member moves the bottom sheet and the side panel; the test account goes through the map pages.
test.use({ role: 'family', searchScope: 'all' })

test.describe('as the test account', () => {
  test.use({ role: 'account' })

  // Main navigation (#101): tab bar on phones (map pages keep a floating bar: back, logo, account), the same header
  // on every page from md up; the editor and recording stay full screen.
  for (const device of [{ name: 'phone', width: 375, height: 812 }, { name: 'computer', width: 1280, height: 800 }]) {
    test(`goes through the main navigation, creation, recording and back, on a ${device.name}`, async ({ page }) => {
      const phone = device.name === 'phone'
      await page.setViewportSize({ width: device.width, height: device.height })
      await page.goto('/')
      await waitForMap(page)
      const nav = page.getByRole('navigation', { name: 'Navigation principale' })
      await expect(page.getByRole('banner')).toHaveCount(phone ? 0 : 1)
      await expect(nav.getByRole('link', { name: 'Carte' })).toHaveAttribute('aria-current', 'page')
      // Nothing to go back to from the home page.
      await expect(page.getByRole('button', { name: 'Retour' })).toHaveCount(0)

      // Creating and recording: the tab bar's central button on phones, two header buttons on computers.
      async function openNew(name: string) {
        if (phone) {
          await nav.getByRole('button', { name: 'Créer ou enregistrer' }).click()
          await page.getByRole('menuitem', { name }).click()
        }
        else {
          await page.getByRole('banner').getByRole('link', { name }).click()
        }
      }
      await openNew('Créer un parcours')
      await expect(page).toHaveURL(/\/routes\/create$/)
      await waitForMap(page)
      await expect(nav).toHaveCount(0)
      await page.getByRole('button', { name: 'Retour' }).click()
      await expect(page).toHaveURL(/\/$/)

      await openNew('Enregistrer une sortie')
      await expect(page).toHaveURL(/\/record$/)
      await expect(nav).toHaveCount(0)
      await page.getByRole('link', { name: 'Quitter' }).click()
      await expect(page).toHaveURL(/\/$/)

      await nav.getByRole('link', { name: 'Découvrir' }).click()
      await expect(page).toHaveURL(/\/discover/)
      await expect(nav.getByRole('link', { name: 'Découvrir' })).toHaveAttribute('aria-current', 'page')
      await nav.getByRole('link', { name: 'En direct' }).click()
      await expect(page).toHaveURL(/\/live$/)
      await expect(page.getByRole('heading', { name: 'En direct', level: 1 })).toBeVisible()

      // The account menu keeps the account's own entries.
      await page.getByRole('button', { name: 'Mon compte' }).click()
      await expect(page.getByRole('menuitem', { name: 'Paramètres' })).toBeVisible()
      await expect(page.getByRole('menuitem', { name: 'Mon profil' })).toHaveCount(0)
      await page.keyboard.press('Escape')

      // Opened from the profile, a route goes back to it, the map section current; opened directly, to the home page.
      await nav.getByRole('link', { name: 'Profil' }).click()
      await expect(page).toHaveURL(/\/profile$/)
      await expect(nav.getByRole('link', { name: 'Profil' })).toHaveAttribute('aria-current', 'page')
      await expect(page.getByRole('banner')).toBeVisible()
      await openProfileRoutes(page)
      await page.getByRole('link', { name: new RegExp(ACCOUNT_ROUTE_NAME) }).click()
      await expect(page.getByRole('heading', { name: ACCOUNT_ROUTE_NAME, level: 1 })).toBeVisible()
      await expect(nav.getByRole('link', { name: 'Carte' })).toHaveAttribute('aria-current', 'true')
      const routeUrl = page.url()
      await page.getByRole('button', { name: 'Retour' }).click()
      await expect(page).toHaveURL(/\/profile\?tab=routes$/)
      await expect(page.getByRole('tab', { name: 'Parcours', exact: true })).toHaveAttribute('aria-selected', 'true')

      await page.goto(routeUrl)
      await waitForHydration(page)
      await page.getByRole('button', { name: 'Retour' }).click()
      await expect(page).toHaveURL(/\/$/)
    })
  }

  // A 56 px header (#154), spanning the whole width on the map pages; text pages keep the centred column.
  test('keeps a low header, as wide as the map on the map pages', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 })
    const logo = page.getByRole('banner').getByRole('link', { name: 'sportmap' })
    const account = page.getByRole('banner').getByRole('button', { name: 'Mon compte' })

    await page.goto('/')
    await waitForMap(page)
    expect((await page.getByRole('banner').boundingBox())!.height).toBe(56)
    expect((await logo.boundingBox())!.x).toBeLessThan(40)
    const accountBox = (await account.boundingBox())!
    expect(1600 - accountBox.x - accountBox.width).toBeLessThan(40)
    // Its touch zone is at least 40 px high (the avatar button is 40 px; smaller header buttons reach it with ::after).
    for (const y of [accountBox.y + accountBox.height / 2 - 19.5, accountBox.y + accountBox.height / 2 + 19.5]) {
      expect(await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('button')?.getAttribute('aria-label'),
        [accountBox.x + accountBox.width / 2, y])).toMatch(/^Mon compte/)
    }
    const recordBox = (await page.getByRole('banner').getByRole('link', { name: 'Enregistrer une sortie' }).boundingBox())!
    expect(recordBox.height).toBeLessThan(40)
    for (const y of [recordBox.y + recordBox.height / 2 - 19.5, recordBox.y + recordBox.height / 2 + 19.5]) {
      expect(await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('a')?.getAttribute('href'),
        [recordBox.x + recordBox.width / 2, y])).toBe('/record')
    }

    await page.goto('/profile')
    await waitForHydration(page)
    expect((await page.getByRole('banner').boundingBox())!.height).toBe(56)
    expect((await logo.boundingBox())!.x).toBeGreaterThan(150)
  })

  test('keeps the profile tabs, the route name and the follow bar readable on a small phone', async ({ page, accountRouteId }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await page.goto('/profile')
    await waitForHydration(page)
    // Full labels, none cut off: the three sections, then created and done routes in the Parcours section.
    for (const name of ['Statistiques', 'Parcours', 'Collections', 'Mes parcours', 'Réalisés']) {
      if (name === 'Mes parcours') await page.getByRole('tab', { name: 'Parcours', exact: true }).click()
      const tab = page.getByRole('tab', { name: name === 'Parcours' ? /^Parcours$/ : new RegExp(name) })
      // The count badge has a label slot too, after the tab's own.
      const label = tab.locator('[data-slot="label"]').first()
      await expect(label).toHaveText(name)
      expect(await label.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    }

    // The sheet title shows the name (collapsed sheet), and the big h1 of the topo header (#233) wraps rather
    // than overflowing.
    await page.goto(`/routes/${accountRouteId}`)
    await waitForMap(page)
    await expect(page.locator('aside[data-sheet]')).toContainText(ACCOUNT_ROUTE_NAME)
    const heading = page.getByRole('heading', { name: ACCOUNT_ROUTE_NAME, level: 1 })
    await expect(heading).toBeVisible()
    expect(await heading.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)

    // The follow bar (#235) shows the name on its own line, cut with an ellipsis before the buttons, never under them.
    await page.goto(`/routes/${accountRouteId}/follow`)
    await waitForMap(page)
    await expect(page.getByRole('link', { name: 'Quitter' })).toBeVisible()
    // Exact: the route announcer also holds the name, in the page title.
    const barName = page.getByText(ACCOUNT_ROUTE_NAME, { exact: true })
    await expect(barName).toBeVisible()
    const nameBox = (await barName.boundingBox())!
    const toggleBox = (await page.getByRole('button', { name: 'Lisibilité en extérieur' }).boundingBox())!
    expect(nameBox.x + nameBox.width).toBeLessThanOrEqual(toggleBox.x)
  })
})

test('moves the bottom sheet over the map on a phone with a tap or a drag on its header', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await waitForMap(page)
  const sheet = page.locator('aside[data-sheet]')
  const title = sheet.getByText('2 parcours ici').first()
  // It opens collapsed (#197): only its title stays; the hidden content leaves the keyboard and screen reader order.
  // Its header has no arrow buttons (#247): the drag handle alone moves it.
  await expect(sheet).toHaveAttribute('data-sheet', 'collapsed')
  await expect(sheet).toContainText('2 parcours ici')
  await expect(sheet.getByRole('button', { name: /panneau/ })).toHaveCount(0)
  await expect(sheet.locator('[inert]')).toHaveCount(1)

  // A tap on the collapsed header opens it at half height; dragging it to the top opens it fully.
  await title.click()
  await expect(sheet).toHaveAttribute('data-sheet', 'half')
  await expect(sheet.locator('[inert]')).toHaveCount(0)
  // Its height animates: the drag starts once its top edge stops moving.
  let top = -1
  await expect(async () => {
    const y = (await sheet.boundingBox())!.y
    const settled = Math.abs(y - top) < 1
    top = y
    expect(settled).toBe(true)
  }).toPass({ intervals: [100] })
  const halfHeader = (await title.boundingBox())!
  await page.mouse.move(halfHeader.x + 40, halfHeader.y + 5)
  await page.mouse.down()
  await page.mouse.move(halfHeader.x + 40, 60, { steps: 10 })
  await page.mouse.up()
  await expect(sheet).toHaveAttribute('data-sheet', 'full')

  // Dragging its header: to the bottom collapses it, then a third of the way up opens it at half height.
  // Once its height animation is over, the full sheet starts right under the floating top bar, still reachable,
  // and ends on the tab bar.
  await expect(async () => expect((await sheet.boundingBox())!.y).toBeLessThan(100)).toPass()
  await expect(page.getByRole('button', { name: 'Mon compte' })).toBeInViewport()
  const tabBar = (await page.getByRole('navigation', { name: 'Navigation principale' }).boundingBox())!
  const sheetBox = (await sheet.boundingBox())!
  expect(sheetBox.y + sheetBox.height).toBeCloseTo(tabBar.y, 0)
  const header = (await sheet.getByText('2 parcours ici').first().boundingBox())!
  const x = header.x + 40
  await page.mouse.move(x, header.y + 5)
  await page.mouse.down()
  await page.mouse.move(x, 805, { steps: 10 })
  await page.mouse.up()
  await expect(sheet).toHaveAttribute('data-sheet', 'collapsed')

  // The collapsed header sits right above the tab bar.
  await page.mouse.move(x, tabBar.y - 30)
  await page.mouse.down()
  await page.mouse.move(x, tabBar.y - 260, { steps: 5 })
  await page.mouse.up()
  await expect(sheet).toHaveAttribute('data-sheet', 'half')

  // A tap on the open header collapses it; from the keyboard, Enter on the header toggles it the same way.
  await title.click()
  await expect(sheet).toHaveAttribute('data-sheet', 'collapsed')
  const headerButton = sheet.getByRole('button', { name: '2 parcours ici' })
  await expect(headerButton).toHaveAttribute('aria-expanded', 'false')
  await headerButton.focus()
  await page.keyboard.press('Enter')
  await expect(sheet).toHaveAttribute('data-sheet', 'half')
  await expect(headerButton).toHaveAttribute('aria-expanded', 'true')
})

// #142: the collapsed sheet's emptied content area kept its padding and drew the search field over the tab bar.
test('keeps the tab bar uncovered under the collapsed sheet on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await waitForMap(page)
  const sheet = page.locator('aside[data-sheet]')
  await expect(sheet).toHaveAttribute('data-sheet', 'collapsed')
  await expect(async () => expect((await sheet.boundingBox())!.height).toBeCloseTo(64, 0)).toPass()

  // The top and centre of each tab's icon and of the "+" button belong to the tab bar. The content is inert while
  // collapsed, and hit testing skips inert elements: it is made hit-testable during the check.
  const hits = await page.getByRole('navigation', { name: 'Navigation principale' }).evaluate((nav) => {
    const content = document.querySelector('aside[data-sheet] [inert]')!
    content.removeAttribute('inert')
    const targets = [...nav.querySelectorAll('a [aria-hidden="true"], button')]
    const result = targets.flatMap((target) => {
      const box = target.getBoundingClientRect()
      const x = box.left + box.width / 2
      return [box.top + 2, box.top + box.height / 2].map(y => nav.contains(document.elementFromPoint(x, y)))
    })
    content.setAttribute('inert', '')
    return result
  })
  expect(hits).toHaveLength(10)
  expect(hits.every(Boolean)).toBe(true)
})

test('collapses the side panel on a computer and remembers it after a reload', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)
  const panel = page.locator('aside[data-panel]')
  const map = page.locator('[data-map-loaded]')
  const collapse = page.getByRole('button', { name: 'Réduire le panneau' })
  const show = page.getByRole('button', { name: 'Afficher le panneau' })
  const title = page.getByText('2 parcours ici').filter({ visible: true })
  const width = (await map.boundingBox())!.width
  await expect(collapse).toHaveAttribute('aria-expanded', 'true')

  // The map takes the whole width; the panel's title floats over it, beside the button reopening it.
  await collapse.click()
  await expect(panel).toBeHidden()
  await expect(panel).toHaveAttribute('data-panel', 'collapsed')
  await expect(show).toBeFocused()
  await expect(show).toHaveAttribute('aria-expanded', 'false')
  await expect(title).toBeVisible()
  await expect(async () => expect((await map.boundingBox())!.width).toBeGreaterThan(width + 300)).toPass()

  await page.reload()
  await waitForMap(page)
  await expect(panel).toHaveAttribute('data-panel', 'collapsed')
  await expect(panel).toBeHidden()

  await show.focus()
  await page.keyboard.press('Enter')
  await expect(panel).toBeVisible()
  await expect(collapse).toBeFocused()
  await expect(show).toHaveCount(0)
  await page.reload()
  await waitForMap(page)
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('2 parcours ici')
})

test('resizes the side panel with the mouse or the keyboard and remembers its width', async ({ page }) => {
  await page.goto('/')
  await waitForMap(page)
  const panel = page.locator('aside[data-panel]')
  const edge = page.getByRole('separator', { name: 'Redimensionner le panneau' })
  await expect(edge).toHaveAttribute('aria-valuenow', '440')
  await expect(edge).toHaveAttribute('aria-valuemin', '320')
  await expect(edge).toHaveAttribute('aria-valuemax', '720')

  // Dragging its edge 200 px to the left widens it as much; far to the right stops at the narrowest panel.
  const box = (await edge.boundingBox())!
  const x = box.x + box.width / 2
  await page.mouse.move(x, 300)
  await page.mouse.down()
  await page.mouse.move(x - 200, 300, { steps: 10 })
  await page.mouse.up()
  await expect(edge).toHaveAttribute('aria-valuenow', '640')
  expect((await panel.boundingBox())!.width).toBeCloseTo(640, 0)
  await page.mouse.move(x - 200, 300)
  await page.mouse.down()
  await page.mouse.move(x + 300, 300, { steps: 5 })
  await page.mouse.up()
  await expect(edge).toHaveAttribute('aria-valuenow', '320')

  await edge.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(edge).toHaveAttribute('aria-valuenow', '336')
  await page.keyboard.press('End')
  await expect(edge).toHaveAttribute('aria-valuenow', '720')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(edge).toHaveAttribute('aria-valuenow', '656')

  await page.reload()
  await waitForMap(page)
  await expect(edge).toHaveAttribute('aria-valuenow', '656')
  expect((await panel.boundingBox())!.width).toBeCloseTo(656, 0)
})
