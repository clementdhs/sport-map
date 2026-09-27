// `npm run dev:local`: the dev server on the local Supabase (Docker, `npm run db:start`) instead of the
// hosted project, to try migrations and features before pushing them. MapTiler and OpenRouteService keys
// still come from .env: process variables take precedence over .env, so only Supabase is overridden.
import { execSync, spawn } from 'node:child_process'

let status
try {
  status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
}
catch {
  console.error('Supabase local ne répond pas : lance Docker Desktop, puis `npm run db:start`.')
  process.exit(1)
}

const url = status.API_URL
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url ?? '')) {
  console.error(`Configuration Supabase locale inattendue : ${url}`)
  process.exit(1)
}

console.log(`Supabase local : ${url} (studio désactivé, comptes sans e-mail de confirmation)`)
const child = spawn('npx', ['nuxt', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    NUXT_PUBLIC_SUPABASE_URL: url,
    NUXT_PUBLIC_SUPABASE_KEY: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
    // The hosted secret key must not be used against the local database.
    NUXT_SUPABASE_SECRET_KEY: '',
  },
})
child.on('exit', code => process.exit(code ?? 0))
