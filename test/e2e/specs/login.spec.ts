import type { Page } from '@playwright/test'
import { supabaseAdmin } from '../admin'
import { expect, SEED_OWNER, test, waitForHydration } from '../fixtures'

// Signing in with a username or an e-mail, in the same field. Every test signs in from the same IP: the whole
// suite must stay under the limit per IP (server/utils/loginAttempts.ts), which the global setup resets.

const LOGIN_ERROR = 'Pseudo, email ou mot de passe incorrect.'

async function signIn(page: Page, identifier: string, password: string) {
  await page.goto('/login')
  await waitForHydration(page)
  await page.locator('input[name="identifier"]').fill(identifier)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
}

test('welcomes visitors over the relief background', async ({ page, request }) => {
  // Served as is: a public/ folder named like the page would redirect /login to /login/.
  expect((await page.goto('/login'))?.url()).toMatch(/\/login$/)
  await expect(page.getByRole('heading', { name: 'sportmap', level: 1 })).toBeVisible()
  await expect(page.getByText('Tes parcours de course, de rando et de vélo, à partager en équipe.')).toBeVisible()
  // The logo only once: the header leaves it to the page (#126).
  await expect(page.getByRole('banner').getByRole('link', { name: 'sportmap' })).toHaveCount(0)
  await expect(page.locator('input[name="identifier"]')).toHaveAttribute('placeholder', 'Ton pseudo ou ton email')
  // The Licence Ouverte requires the source and its date.
  await expect(page.getByText(/relief IGN RGE ALTI® \(octobre 2026\)/)).toBeVisible()
  for (const file of ['/img/login-relief.webp', '/img/login-contours.svg']) {
    expect((await request.get(file)).status(), file).toBe(200)
  }
})

test('signs in with the username, whatever its case', async ({ page, users }) => {
  await signIn(page, users.family.username.toUpperCase(), users.family.password)
  await expect(page.getByRole('button', { name: 'Mon compte' })).toBeVisible()
  // The usual session, kept in cookies: the server knows the member after a reload.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Mon compte' })).toBeVisible()
  const me = await (await page.request.get('/api/profile/me/info')).json() as { username: string }
  expect(me.username).toBe(users.family.username)
})

test('gives the same answer for an unknown username and a wrong password, without the e-mail', async ({ page, request, users }) => {
  const unknown = await request.post('/api/auth/login', { data: { username: 'personne_ici', password: users.family.password } })
  const wrongPassword = await request.post('/api/auth/login', { data: { username: users.family.username, password: 'pas-le-bon' } })
  expect(unknown.status()).toBe(401)
  expect(wrongPassword.status()).toBe(401)
  const [unknownBody, wrongBody] = [await unknown.json(), await wrongPassword.json()] as { message: string }[]
  expect(wrongBody!.message).toBe(unknownBody!.message)
  expect(await wrongPassword.text()).not.toContain('@')

  // The page says the same as for a wrong e-mail or password.
  await signIn(page, 'personne_ici', users.family.password)
  await expect(page.getByText(LOGIN_ERROR)).toBeVisible()
  await signIn(page, users.family.email, 'pas-le-bon')
  await expect(page.getByText(LOGIN_ERROR)).toBeVisible()
})

test('limits repeated attempts on a username', async ({ page, request }) => {
  const username = `essais_${Date.now().toString(36)}`
  for (let i = 0; i < 5; i++) {
    expect((await request.post('/api/auth/login', { data: { username, password: 'pas-le-bon' } })).status()).toBe(401)
  }
  expect((await request.post('/api/auth/login', { data: { username: username.toUpperCase(), password: 'pas-le-bon' } })).status()).toBe(429)
  await signIn(page, username, 'pas-le-bon')
  await expect(page.getByText("Trop d'essais de connexion")).toBeVisible()
})

test('signs in with the new username once changed in the settings, no longer with the old one', async ({ page, request }) => {
  const suffix = Date.now().toString(36)
  const account = { email: `jetable-pseudo-${suffix}@sport-map.test`, username: `jetable_${suffix}`, password: `jetable-${suffix}-local` }
  const { id } = await supabaseAdmin<{ id: string }>('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email: account.email, password: account.password, email_confirm: true, user_metadata: { username: account.username } }),
  })
  try {
    await signIn(page, account.username, account.password)
    await expect(page.getByRole('button', { name: 'Mon compte' })).toBeVisible()
    await page.goto('/settings')
    await waitForHydration(page)
    const field = page.getByLabel('Pseudo', { exact: true })
    const save = page.getByRole('button', { name: 'Enregistrer le profil' })

    // Taken by another member, with another case.
    await field.fill(SEED_OWNER.username.toUpperCase())
    await expect(page.getByText(/^Après l'enregistrement, connecte-toi avec/)).toBeVisible()
    await save.click()
    await expect(page.getByText('Ce pseudo est déjà pris').first()).toBeVisible()

    const renamed = `Renomme_${suffix}`
    await field.fill(renamed)
    await save.click()
    await expect(page.getByText('Profil mis à jour').first()).toBeVisible()
    await expect(page.getByText(/^Après l'enregistrement/)).toBeHidden()
    await expect(page.getByRole('link', { name: 'ton profil' })).toHaveAttribute('href', `/profile/${renamed}`)
    // The account menu shows the username, not the e-mail, and follows the change without a reload.
    await expect(page.getByRole('button', { name: renamed })).toBeVisible()
    await expect(page.getByRole('button', { name: account.email })).toHaveCount(0)

    const login = (username: string) => request.post('/api/auth/login', { data: { username, password: account.password } })
    expect((await login(account.username)).status()).toBe(401)
    expect((await login(renamed.toLowerCase())).status()).toBe(200)
  }
  finally {
    await supabaseAdmin(`/auth/v1/admin/users/${id}`, { method: 'DELETE' })
  }
})
