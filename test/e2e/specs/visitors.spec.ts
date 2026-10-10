import { expect, RESET_USER, SEED_OWNER, test, waitForHydration } from '../fixtures'
import { passwordResetLink } from '../mail'

// The app is for the family only: without a session, every page leads to the sign-in page and the API refuses
// everything, except link previews of shared routes.

const ROUTE_ID = () => process.env.E2E_ROUTE_ID!
const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000'

test('sends visitors to the sign-in page, whatever the page, then back to it once signed in', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  for (const path of [`/routes/${ROUTE_ID()}`, `/routes/${ROUTE_ID()}/follow`, '/routes/create', `/profile/${SEED_OWNER.username}`, `/collections/${UNKNOWN_ID}`]) {
    await page.goto(path)
    await expect(page, path).toHaveURL(`/login?redirect=${path}`)
  }

  // No sign-up: accounts are made by the administrator.
  await expect(page.getByText("L'accès est réservé à la famille")).toBeVisible()
  await expect(page.getByRole('link', { name: /Inscri/ })).toHaveCount(0)
  await page.goto('/register')
  await expect(page).toHaveURL(/\/login\?redirect=/)

  await page.goto(`/routes/${ROUTE_ID()}`)
  await waitForHydration(page)
  await page.locator('input[name="email"]').fill(SEED_OWNER.email)
  await page.locator('input[name="password"]').fill(SEED_OWNER.password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(`/routes/${ROUTE_ID()}`)
})

test('refuses API requests without a session, reads included', async ({ request }) => {
  const view = 'minLng=6&minLat=45.8&maxLng=6.4&maxLat=46'
  for (const path of [
    `/api/routes?${view}`,
    `/api/routes/${ROUTE_ID()}`,
    `/api/routes/${ROUTE_ID()}/gpx`,
    `/api/routes/${ROUTE_ID()}/reviews`,
    `/api/routes/${ROUTE_ID()}/weather`,
    `/api/profile/${SEED_OWNER.username}`,
    `/api/collections/${UNKNOWN_ID}`,
  ]) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(401)
    expect((await response.json()).statusMessage, path).toBe('Connexion requise')
  }
})

test('gives nothing to visitors who go straight to Supabase, and refuses sign-ups', async () => {
  const supabase = process.env.E2E_SUPABASE_URL!
  const headers = { 'apikey': process.env.E2E_SUPABASE_PUBLIC_KEY!, 'Content-Type': 'application/json' }
  for (const table of ['routes', 'profiles', 'route_reviews', 'route_photos', 'collections', 'collection_routes']) {
    const response = await fetch(`${supabase}/rest/v1/${table}?select=*`, { headers })
    expect(await response.json(), table).toEqual([])
  }
  const search = await fetch(`${supabase}/rest/v1/rpc/search_routes`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ min_lng: 6, min_lat: 45.8, max_lng: 6.4, max_lat: 46 }),
  })
  expect(search.ok).toBe(false)

  const signUp = await fetch(`${supabase}/auth/v1/signup`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email: 'intrus@sport-map.test', password: 'mot-de-passe-intrus' }),
  })
  expect(signUp.ok).toBe(false)
})

test('keeps the link preview of a shared route', async ({ page, request }) => {
  // Chat apps fetch the link without a session: they land on the sign-in page, which points to the image.
  await page.goto(`/routes/${ROUTE_ID()}`)
  const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content')
  expect(ogImage).toMatch(new RegExp(`/api/routes/${ROUTE_ID()}/og\\.png\\?lang=fr$`))
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')

  const response = await request.get(new URL(ogImage!).pathname + new URL(ogImage!).search)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('image/png')
  // Unknown or private routes have none.
  expect((await request.get(`/api/routes/${UNKNOWN_ID}/og.png`)).status()).toBe(404)
})

test('keeps the app out of search engines', async ({ page, request }) => {
  expect(await (await request.get('/robots.txt')).text()).toMatch(/^Disallow: \/$/m)
  await page.goto('/login')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
})

test('lets visitors pick the light or dark mode and an accent color, kept after a reload', async ({ page }) => {
  await page.goto('/login')
  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-accent', 'indigo')

  await page.getByRole('button', { name: 'Apparence' }).click()
  await page.getByRole('button', { name: 'Sombre' }).click()
  await expect(html).toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Clair' }).click()
  await expect(html).toHaveClass(/light/)
  await page.getByRole('button', { name: 'Violet' }).click()
  await expect(page.getByRole('button', { name: 'Violet' })).toHaveAttribute('aria-pressed', 'true')
  await expect(html).toHaveAttribute('data-accent', 'violet')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#7c3aed')

  // Rendered by the server with the chosen accent (cookie), the mode restored from localStorage.
  const response = await page.reload()
  expect(await response!.text()).toContain('data-accent="violet"')
  await expect(html).toHaveClass(/light/)
  // Light mode uses the 600 shade, for readable white text on buttons.
  const [primary, shade600] = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    return [style.getPropertyValue('--ui-primary'), style.getPropertyValue('--ui-color-primary-600')]
  })
  expect(primary).toBe(shade600)
})

// Members pick the language from the account menu: visitors from the header.
test.describe('in a browser set to English', () => {
  test.use({ locale: 'en-GB' })

  test('detects the browser language, and keeps the one a visitor picks', async ({ page, context }) => {
    await page.goto('/login')
    await waitForHydration(page)
    const html = page.locator('html')
    await expect(html).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()

    await page.getByRole('button', { name: 'Language' }).click()
    await page.getByRole('menuitemcheckbox', { name: 'Français' }).click()
    await expect(html).toHaveAttribute('lang', 'fr')
    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible()

    // Kept in a cookie, and rendered by the server in that language despite the browser's.
    const cookies = await context.cookies()
    expect(cookies.find(cookie => cookie.name === 'sport-map-locale')?.value).toBe('fr')
    const response = await page.reload()
    expect(await response!.text()).toContain('lang="fr"')
    await expect(page.getByRole('button', { name: 'Langue' })).toBeVisible()
  })
})

test('serves every icon of the PWA manifest', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json() as { icons: { src: string, sizes: string, purpose?: string }[] }
  expect(manifest.icons.map(icon => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']))
  expect(manifest.icons.some(icon => icon.purpose === 'maskable')).toBe(true)
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src)
    expect(response.status(), icon.src).toBe(200)
    expect(response.headers()['content-type'], icon.src).toBe('image/png')
  }
  expect((await request.get('/apple-touch-icon-180x180.png')).status()).toBe(200)
})

test('resets a forgotten password from the email link, opened in another browser', async ({ page, browser }) => {
  await page.goto('/login')
  await waitForHydration(page)
  const origin = new URL(page.url()).origin
  await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click()
  await expect(page).toHaveURL(/\/forgot-password$/)

  // Same answer for an unknown address: the page doesn't tell which accounts exist.
  await page.locator('input[name="email"]').fill('personne@sport-map.test')
  await page.getByRole('button', { name: 'Recevoir un lien' }).click()
  const sent = page.getByText('Vérifie ta boîte mail')
  await expect(sent).toBeVisible()
  await page.reload()
  await waitForHydration(page)
  await page.locator('input[name="email"]').fill(RESET_USER.email)
  await page.getByRole('button', { name: 'Recevoir un lien' }).click()
  await expect(sent).toBeVisible()

  // The link works in another browser, without the session or storage of the one that asked for it.
  const link = await passwordResetLink(RESET_USER.email, origin)
  const phone = await browser.newContext({ baseURL: origin })
  const phonePage = await phone.newPage()
  await phonePage.goto(link)
  await waitForHydration(phonePage)
  await phonePage.getByLabel('Nouveau mot de passe').fill('nouveau-mot-de-passe')
  await phonePage.getByLabel('Confirme le mot de passe').fill('pas-le-meme')
  await phonePage.getByRole('button', { name: 'Enregistrer le mot de passe' }).click()
  await expect(phonePage.getByText('Les deux mots de passe sont différents')).toBeVisible()
  await phonePage.getByLabel('Confirme le mot de passe').fill('nouveau-mot-de-passe')
  // The error clears while typing: clicking while it shows would move the button under the pointer.
  await expect(phonePage.getByText('Les deux mots de passe sont différents')).toBeHidden()
  await phonePage.getByRole('button', { name: 'Enregistrer le mot de passe' }).click()
  await expect(phonePage).toHaveURL(`${origin}/`)
  await expect(phonePage.getByRole('button', { name: 'Mon compte' })).toBeVisible()

  // The link only works once.
  await phonePage.goto(link)
  await expect(phonePage.getByText('Lien invalide ou expiré')).toBeVisible()

  // Changed again from the settings, then used to sign in.
  await phonePage.goto('/settings')
  await waitForHydration(phonePage)
  await phonePage.getByLabel('Nouveau mot de passe').fill('encore-un-autre')
  await phonePage.getByLabel('Confirme le mot de passe').fill('encore-un-autre')
  await phonePage.getByRole('button', { name: 'Changer le mot de passe' }).click()
  // The toast, and its copy for screen readers.
  await expect(phonePage.getByText('Mot de passe modifié').first()).toBeVisible()
  await phone.close()

  await page.goto('/login')
  await waitForHydration(page)
  await page.locator('input[name="email"]').fill(RESET_USER.email)
  await page.locator('input[name="password"]').fill('encore-un-autre')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('button', { name: 'Mon compte' })).toBeVisible()
})
