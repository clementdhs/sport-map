import { execSync } from 'node:child_process'
import { defineConfig, devices } from '@playwright/test'
import { FAKE_WEATHER_PORT } from './test/e2e/fake-weather'

const PORT = 3100
const baseURL = `http://localhost:${PORT}`

// Always the local Supabase started with `npm run db:start`, never the hosted project.
function localSupabase() {
  let status: Record<string, string>
  try {
    status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
  }
  catch {
    throw new Error('Supabase local ne répond pas : lance `npm run db:start` avant `npm run test:e2e`.')
  }
  const url = status.API_URL
  const mailUrl = status.MAILPIT_URL ?? status.INBUCKET_URL
  const publicKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY
  // The service_role JWT, accepted as a bearer token by every local API.
  const secretKey = status.SERVICE_ROLE_KEY ?? status.SECRET_KEY
  const isLocal = (address?: string) => !!address && /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(address)
  if (!isLocal(url) || !isLocal(mailUrl) || !publicKey || !secretKey) {
    throw new Error(`Configuration Supabase locale inattendue : ${url}, ${mailUrl}`)
  }
  return { url, mailUrl, publicKey, secretKey }
}

const supabase = localSupabase()
// Read by the global setup to create the test user and data.
process.env.E2E_SUPABASE_URL = supabase.url
process.env.E2E_SUPABASE_SECRET_KEY = supabase.secretKey
// Used by the tests that act as a visitor straight on the Supabase APIs.
process.env.E2E_SUPABASE_PUBLIC_KEY = supabase.publicKey
// Local mailbox (Mailpit) where Supabase delivers its emails, e.g. password reset links.
process.env.E2E_MAILPIT_URL = supabase.mailUrl

export default defineConfig({
  testDir: 'test/e2e',
  globalSetup: './test/e2e/global-setup.ts',
  // Spec files run in parallel, the tests of a file in order. Each worker has its own users (global setup). The
  // CI runners have 2 cores, already busy with the server, Supabase and maps drawn without a GPU: measured slower
  // there with 2 workers (6 min 50 s against 5 min 42 s) and 3 (7 min 38 s), with timeouts.
  fullyParallel: false,
  workers: process.env.CI ? 1 : 2,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    // The PWA service worker would hide requests from page.route().
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    // Every feature, in French. A spec signs its pages in as the worker's test account or family member with
    // test.use({ role }); without it, they have no session.
    { name: 'fr', testMatch: /specs\/.*\.spec\.ts$/, testIgnore: /\.en\.spec\.ts$/, use: { ...devices['Desktop Chrome'] } },
    // The main flows again (search, route page, creation) in a browser set to English, the detected language.
    { name: 'en', testMatch: /specs\/.*\.en\.spec\.ts$/, use: { ...devices['Desktop Chrome'], locale: 'en-GB' } },
  ],
  // The production build, as deployed, pointed at the local Supabase. No map or routing key: the tests
  // mock those requests, so they run offline and never use the free-tier quotas.
  webServer: {
    // E2E_SKIP_BUILD=1 reuses the existing .output: Playwright's own build can exceed the timeout on a busy machine.
    command: process.env.E2E_SKIP_BUILD ? 'node .output/server/index.mjs' : 'npm run build && node .output/server/index.mjs',
    url: baseURL,
    // The production build alone takes about 5 minutes on a local machine.
    timeout: 600_000,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      NUXT_PUBLIC_SUPABASE_URL: supabase.url,
      NUXT_PUBLIC_SUPABASE_KEY: supabase.publicKey,
      // The local one, for account deletion.
      NUXT_SUPABASE_SECRET_KEY: supabase.secretKey,
      // Fake: the MapTiler style and geocoding are mocked by the fixtures.
      NUXT_PUBLIC_MAPTILER_KEY: 'e2e-fake-key',
      NUXT_OPENROUTESERVICE_KEY: '',
      // Small, so a test reaches the per-user routing quota quickly.
      NUXT_ROUTING_DAILY_LIMIT: '3',
      // Fake Open-Meteo, started by the global setup.
      NUXT_OPEN_METEO_URL: `http://127.0.0.1:${FAKE_WEATHER_PORT}/v1/forecast`,
      NUXT_IGN_ALTIMETRY_URL: `http://127.0.0.1:${FAKE_WEATHER_PORT}/altimetrie/1.0/calcul/alti/rest/elevation.json`,
      NUXT_OPEN_METEO_ELEVATION_URL: `http://127.0.0.1:${FAKE_WEATHER_PORT}/v1/elevation`,
    },
  },
})
