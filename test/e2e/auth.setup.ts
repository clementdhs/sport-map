import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { AUTH_FILE, E2E_USER, expect, test } from './fixtures'

test('sign in with the test account', async ({ page }) => {
  await page.goto('/login')
  // By name: the password label also matches the "Afficher le mot de passe" toggle.
  await page.locator('input[name="email"]').fill(E2E_USER.email)
  await page.locator('input[name="password"]').fill(E2E_USER.password)
  await page.getByRole('button', { name: 'Se connecter' }).click()

  await expect(page.getByRole('button', { name: E2E_USER.email })).toBeVisible()
  mkdirSync(dirname(AUTH_FILE), { recursive: true })
  await page.context().storageState({ path: AUTH_FILE })
})
