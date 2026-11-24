import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

// `npm run screenshots`: the README screenshots (docs/screenshots), taken from the production build on the local
// Supabase with fictitious demo data (test/screenshots/seed.ts). Unlike the e2e tests, the map is real: the
// MapTiler key comes from .env (a few hundred tile requests per run). Never the hosted Supabase. Not at the same
// time as the e2e tests: their global setup deletes every @sport-map.test user, the demo members included.
if (existsSync('.env')) process.loadEnvFile('.env')
const mapTilerKey = process.env.NUXT_PUBLIC_MAPTILER_KEY
if (!mapTilerKey) throw new Error('NUXT_PUBLIC_MAPTILER_KEY manquante : les captures ont besoin des vraies tuiles.')

let status: Record<string, string>
try {
  status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
}
catch {
  throw new Error('Supabase local ne répond pas : lance `npm run db:start` avant `npm run screenshots`.')
}
const url = status.API_URL
const secretKey = status.SERVICE_ROLE_KEY ?? status.SECRET_KEY
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url ?? '') || !secretKey) {
  throw new Error(`Configuration Supabase locale inattendue : ${url}`)
}
// Read by the seed, through the e2e admin helpers.
process.env.E2E_SUPABASE_URL = url
process.env.E2E_SUPABASE_SECRET_KEY = secretKey

const PORT = 3200

export default defineConfig({
  testDir: 'test/screenshots',
  globalSetup: './test/screenshots/seed.ts',
  workers: 1,
  reporter: 'list',
  timeout: 120_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}`,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    serviceWorkers: 'block',
  },
  webServer: {
    // SCREENSHOTS_SKIP_BUILD=1 reuses the existing .output.
    command: process.env.SCREENSHOTS_SKIP_BUILD ? 'node .output/server/index.mjs' : 'npm run build && node .output/server/index.mjs',
    url: `http://localhost:${PORT}`,
    timeout: 600_000,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      NUXT_PUBLIC_SUPABASE_URL: url!,
      NUXT_PUBLIC_SUPABASE_KEY: status.PUBLISHABLE_KEY ?? status.ANON_KEY!,
      NUXT_SUPABASE_SECRET_KEY: secretKey,
      NUXT_PUBLIC_MAPTILER_KEY: mapTilerKey,
      // No routing: the demo routes are already traced.
      NUXT_OPENROUTESERVICE_KEY: '',
    },
  },
})
