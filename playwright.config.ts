import { execSync } from 'node:child_process'
import { defineConfig, devices } from '@playwright/test'
import { AUTH_FILE } from './test/e2e/fixtures'

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
  const publicKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY
  // The service_role JWT, accepted as a bearer token by every local API.
  const secretKey = status.SERVICE_ROLE_KEY ?? status.SECRET_KEY
  if (!url || !publicKey || !secretKey || !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    throw new Error(`Configuration Supabase locale inattendue : ${url}`)
  }
  return { url, publicKey, secretKey }
}

const supabase = localSupabase()
// Read by the global setup to create the test user and data.
process.env.E2E_SUPABASE_URL = supabase.url
process.env.E2E_SUPABASE_SECRET_KEY = supabase.secretKey

export default defineConfig({
  testDir: 'test/e2e',
  globalSetup: './test/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
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
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'anonymous', testMatch: /anonymous\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    {
      name: 'signed-in',
      testMatch: /signed-in\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE },
    },
  ],
  // The production build, as deployed, pointed at the local Supabase. No map or routing key: the tests
  // mock those requests, so they run offline and never use the free-tier quotas.
  webServer: {
    command: 'npm run build && node .output/server/index.mjs',
    url: baseURL,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      NUXT_PUBLIC_SUPABASE_URL: supabase.url,
      NUXT_PUBLIC_SUPABASE_KEY: supabase.publicKey,
      NUXT_SUPABASE_SECRET_KEY: '',
      NUXT_PUBLIC_MAPTILER_KEY: '',
      NUXT_OPENROUTESERVICE_KEY: '',
    },
  },
})
