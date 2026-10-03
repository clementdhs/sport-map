import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { AUTH_FILE, E2E_USER, expect, FAMILY_AUTH_FILE, FAMILY_USER, test, waitForHydration } from './fixtures'

for (const [name, user, file] of [['test account', E2E_USER, AUTH_FILE], ['family member', FAMILY_USER, FAMILY_AUTH_FILE]] as const) {
  test(`sign in with the ${name}`, async ({ page }) => {
    await page.goto('/login')
    await waitForHydration(page)
    // By name: the password label also matches the "Afficher le mot de passe" toggle.
    await page.locator('input[name="email"]').fill(user.email)
    await page.locator('input[name="password"]').fill(user.password)
    await page.getByRole('button', { name: 'Se connecter' }).click()

    // Signed in, on the home page: its floating map bar has the account menu.
    await expect(page.getByRole('button', { name: 'Mon compte' })).toBeVisible()
    mkdirSync(dirname(file), { recursive: true })
    await page.context().storageState({ path: file })
  })
}
