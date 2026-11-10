import type { Browser, Page } from '@playwright/test'
import { Secret, TOTP } from 'otpauth'
import { supabaseAdmin } from '../admin'
import { expect, SEED_OWNER, test, waitForHydration } from '../fixtures'

// Two-factor authentication (#253), on a throwaway account: turned on in the settings, then asked at each new
// sign-in (e-mail or username), enforced by RLS on an aal1 session, and turned off again.

async function signIn(page: Page, identifier: string, password: string) {
  await page.goto('/login')
  await waitForHydration(page)
  await page.locator('input[name="identifier"]').fill(identifier)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
}

// The app's codes, as an authenticator app would show them. A code may only be used once: when the current
// 30 s period's code was already typed, the next period's one, which Supabase also accepts (one period of skew).
function authenticator(secret: string) {
  const totp = new TOTP({ secret: Secret.fromBase32(secret), algorithm: 'SHA1', digits: 6, period: 30 })
  let lastCounter = -1
  return () => {
    const counter = Math.max(totp.counter(), lastCounter + 1)
    lastCounter = counter
    return totp.generate({ timestamp: counter * 30_000 })
  }
}

async function newPage(browser: Browser) {
  const context = await browser.newContext()
  return context.newPage()
}

test('asks members who turned it on for a code from their app', async ({ page, browser }) => {
  const suffix = Date.now().toString(36)
  const account = { email: `jetable-2fa-${suffix}@sport-map.test`, username: `deuxfa_${suffix}`, password: `jetable-${suffix}-local` }
  const { id } = await supabaseAdmin<{ id: string }>('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email: account.email, password: account.password, email_confirm: true, user_metadata: { username: account.username } }),
  })
  try {
    // Turned on in the settings: QR code and key, then a first code.
    await signIn(page, account.username, account.password)
    await expect(page.getByRole('button', { name: 'Mon compte' })).toBeVisible()
    await page.goto('/settings#security')
    await waitForHydration(page)
    const security = page.getByTestId('two-factor-settings')
    await expect(security.getByText('Désactivée')).toBeVisible()
    await security.getByRole('button', { name: 'Activer la double authentification' }).click()
    await expect(security.getByRole('img', { name: 'QR code à scanner avec l\'appli d\'authentification' })).toBeVisible()
    const nextCode = authenticator((await security.getByTestId('totp-secret').innerText()).replace(/\s/g, ''))
    await security.getByLabel('Code affiché par l\'appli').fill(nextCode())
    await security.getByRole('button', { name: 'Confirmer' }).click()
    await expect(page.getByText('Double authentification activée').first()).toBeVisible()
    await expect(security.getByText('Activée', { exact: true })).toBeVisible()
    // Still signed in here: confirming the app made this session aal2.
    expect((await page.request.get('/api/profile/me/info')).status()).toBe(200)

    // A new sign-in with the e-mail: the password alone opens nothing.
    const other = await newPage(browser)
    await signIn(other, account.email, account.password)
    await expect(other.getByText('Code de vérification', { exact: true })).toBeVisible()
    // RLS shows an aal1 session nothing, even through the API, and service role routes refuse it too.
    expect((await other.request.get('/api/profile/me/info')).status()).toBe(500)
    expect((await other.request.get(`/api/profile/${SEED_OWNER.username}`)).status()).toBe(404)
    expect((await other.request.get('/api/live')).status()).toBe(403)
    // The pages send it back to the code.
    await other.goto('/settings')
    await expect(other).toHaveURL('/login?redirect=/settings')
    await waitForHydration(other)
    await expect(other.getByText('Code de vérification', { exact: true })).toBeVisible()

    // A wrong code is refused, the right one goes on to the page asked for.
    const code = other.locator('input[name="code"]')
    const right = nextCode()
    await code.fill(right === '000000' ? '111111' : '000000')
    await other.getByRole('button', { name: 'Vérifier' }).click()
    await expect(other.getByText('Code incorrect ou expiré')).toBeVisible()
    await code.fill(right.replace(/(\d{3})/, '$1 '))
    await other.getByRole('button', { name: 'Vérifier' }).click()
    await expect(other).toHaveURL(/\/settings$/)
    await expect(other.getByTestId('two-factor-settings').getByText('Activée', { exact: true })).toBeVisible()
    expect((await other.request.get(`/api/profile/${SEED_OWNER.username}`)).status()).toBe(200)

    // Same with the username; another account can be used instead.
    const third = await newPage(browser)
    await signIn(third, account.username, account.password)
    await expect(third.getByText('Code de vérification', { exact: true })).toBeVisible()
    await third.getByRole('button', { name: 'Changer de compte' }).click()
    await expect(third.locator('input[name="identifier"]')).toBeVisible()
    await third.goto('/')
    await expect(third).toHaveURL(/\/login$/)

    // Turned off from an aal2 session: the password is enough again.
    await page.reload()
    await waitForHydration(page)
    await security.getByRole('button', { name: 'Retirer' }).click()
    await security.getByRole('button', { name: 'Retirer' }).last().click()
    await expect(page.getByText('Double authentification désactivée').first()).toBeVisible()
    await expect(security.getByText('Désactivée')).toBeVisible()
    await signIn(third, account.email, account.password)
    await expect(third.getByRole('button', { name: 'Mon compte' })).toBeVisible()
  }
  finally {
    await supabaseAdmin(`/auth/v1/admin/users/${id}`, { method: 'DELETE' })
  }
})
