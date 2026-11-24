import { type Page, expect, test } from '@playwright/test'
import { DEMO_OWNER } from './seed'

// The README screenshots, written to docs/screenshots. Not part of the e2e suite: run by `npm run screenshots`.
const OUT = 'docs/screenshots'
const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 390, height: 844 }

function routeId(index: number) {
  return process.env.DEMO_ROUTE_IDS!.split(',')[index]!
}

// The map draws its tiles after its style: wait for both, then for the network to calm down.
async function settle(page: Page) {
  await expect(page.locator('[data-map-loaded]').first()).toBeVisible({ timeout: 30_000 })
  // Real tiles can keep the network busy on a slow connection: give up waiting rather than fail the screenshot.
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  await page.waitForTimeout(1500)
}

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 82 })
}

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('html[data-hydrated]')).toBeAttached({ timeout: 15_000 })
  await page.locator('input[name="identifier"]').fill(DEMO_OWNER.email)
  await page.locator('input[name="password"]').fill(DEMO_OWNER.password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('button', { name: 'Mon compte' })).toBeVisible()
})

test.describe('desktop', () => {
  test.use({ viewport: DESKTOP })

  test('home', async ({ page }) => {
    await settle(page)
    await shoot(page, 'accueil')
  })

  test('route page', async ({ page }) => {
    await page.goto(`/routes/${routeId(0)}`)
    await settle(page)
    await shoot(page, 'parcours')
  })

  test('editor', async ({ page }) => {
    await page.goto(`/routes/${routeId(1)}/edit`)
    await settle(page)
    await shoot(page, 'editeur')
  })

  test('profile', async ({ page }) => {
    await page.goto('/profile')
    await expect(page.locator('html[data-hydrated]')).toBeAttached()
    await page.waitForLoadState('networkidle')
    await shoot(page, 'profil')
  })
})

test.describe('mobile', () => {
  test.use({ viewport: MOBILE, deviceScaleFactor: 2, isMobile: true, hasTouch: true })

  test('route page', async ({ page }) => {
    await page.goto(`/routes/${routeId(1)}`)
    await settle(page)
    await shoot(page, 'mobile-parcours')
  })
})
