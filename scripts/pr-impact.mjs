// `npm run pr:impact [-- <base>]`: what the current branch touches, to fill the impact sections of the pull
// request template (.github/pull_request_template.md, see the ship-issue skill). Compares the working tree,
// uncommitted and untracked files included, with its merge base on <base> (origin/main by default).
// It only lists facts: the analysis itself (RLS, quotas, regressions) stays to be written in the PR.
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { posix } from 'node:path'

const base = process.argv[2] ?? 'origin/main'
const git = args => execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
const lines = text => text.split('\n').filter(Boolean)
const contents = new Map()
const read = (file) => {
  if (!contents.has(file)) contents.set(file, existsSync(file) ? readFileSync(file, 'utf8') : '')
  return contents.get(file)
}
// Literal match first: rule paths such as `app/pages/routes/[id]/index.vue` aren't meant as globs.
const matches = (file, globs) => globs.some(glob => file === glob || posix.matchesGlob(file, glob))
const isTest = file => file.startsWith('test/')
const isAppCode = file => /^(app|server|shared|service-worker)\/.*\.(ts|vue)$/.test(file)
const sample = (items, max = 3) => items.slice(0, max).join(', ') + (items.length > max ? ` (+${items.length - max})` : '')

// Areas where the code review runs at `high` rather than `medium` (ship-issue skill).
const HIGH_REVIEW = {
  'auth et accès équipe': ['app/middleware/**', 'server/middleware/**', 'app/pages/{login,register,confirm,forgot-password,reset-password}.vue', 'app/plugins/account-locale.client.ts', 'supabase/config.toml', 'supabase/templates/**'],
  'routes API': ['server/api/**', 'server/routes/**'],
  'service worker et hors ligne': ['service-worker/**', 'app/utils/offlineRoute.ts', 'shared/utils/offlineMaps.ts', 'app/plugins/offline-routes.client.ts', 'nuxt.config.ts'],
  'GPS et enregistrement': ['app/pages/record.vue', 'app/pages/routes/*/follow.vue', 'app/utils/{recorder,trackFollower,heading,nativeGeolocation,liveShare}.ts', 'app/composables/{useWatchPosition,useScreenWakeLock,useLiveShare}.ts', 'server/api/recordings.post.ts', 'android/**', 'capacitor/**'],
}

// Free-tier services: a changed file counts when it names the service or calls one of its client module's
// exports (Nuxt auto-imports hide the import line).
const SERVICES = {
  'MapTiler': { pattern: /maptiler/i, modules: ['app/utils/mapStyle.ts', 'app/utils/basemaps.ts'] },
  'OpenRouteService': { pattern: /openrouteservice/i, modules: ['server/utils/openrouteservice.ts'] },
  'IGN': { pattern: /\bIGN\b|geopf/, modules: ['server/utils/elevation.ts', 'app/utils/basemaps.ts'] },
  'Open-Meteo': { pattern: /open-?meteo/i, modules: ['server/utils/elevation.ts'] },
  'Overpass': { pattern: /overpass/i, modules: ['app/utils/overpass.ts'] },
}

// Files that two parallel sessions often both change (.claude/skills/ship-issue/worktrees.md).
const CONFLICT_PRONE = ['i18n/locales/*.json', 'test/e2e/signed-in.spec.ts', 'shared/types/database.types.ts']

const mergeBase = git(`merge-base ${base} HEAD`)
const files = [...new Set([
  ...lines(git(`diff --name-only ${mergeBase}`)),
  ...lines(git('ls-files --others --exclude-standard')),
])].sort()

const onBase = (file) => {
  try {
    execSync(`git cat-file -e "${mergeBase}:${file}"`, { stdio: 'ignore' })
    return true
  }
  catch {
    return false
  }
}

const out = [`Base : ${base} (${mergeBase.slice(0, 7)}), ${files.length} fichier(s)`, '']
const section = (title, items) => out.push(`${title} :`, ...(items.length ? items.map(item => `- ${item}`) : ['- rien']), '')

// Review level
const highAreas = Object.entries(HIGH_REVIEW)
  .map(([area, globs]) => [area, files.filter(file => !isTest(file) && matches(file, globs))])
  .filter(([, hits]) => hits.length)
if (highAreas.length) {
  section('Revue de code : /code-review high', highAreas.map(([area, hits]) => `${area} : ${sample(hits)}`))
}
else if (files.every(file => file.endsWith('.md') || file.startsWith('.github/'))) {
  out.push('Revue de code : documentation seule, revue facultative', '')
}
else {
  out.push('Revue de code : /code-review medium', '')
}

const rules = readdirSync('.claude/rules').filter(name => name.endsWith('.md')).map((name) => {
  const front = read(`.claude/rules/${name}`).match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? ''
  // `- "glob"`, `- 'glob'` or `- glob`
  return { name, paths: [...front.matchAll(/^\s*-\s*["']?([^"'\r\n]+?)["']?\s*$/gm)].map(match => match[1]) }
})
section('Rules concernées', rules
  .map(rule => [rule.name, files.filter(file => matches(file, rule.paths))])
  .filter(([, hits]) => hits.length)
  .map(([name, hits]) => `${name} : ${sample(hits)}`))

section('Pages', files.filter(file => file.startsWith('app/pages/')))
section('Routes API et middlewares serveur', files.filter(file => /^server\/(api|routes|middleware)\//.test(file)))
section('Migrations', files.filter(file => file.startsWith('supabase/migrations/')).map((file) => {
  if (!existsSync(file)) return `${file} (supprimée : interdit si elle est déjà appliquée)`
  return onBase(file) ? `${file} (déjà présente au départ de la branche : interdit de la modifier, en créer une nouvelle)` : `${file} (nouvelle)`
}))

const codeFiles = files.filter(file => isAppCode(file) && existsSync(file))
section('Services externes (fichiers qui les nomment ou appellent leur client)', Object.entries(SERVICES).flatMap(([name, { pattern, modules }]) => {
  const names = modules.flatMap(module => [...read(module).matchAll(/^export (?:async )?(?:function|const|class) (\w+)/gm)].map(match => match[1]))
  const calls = names.length ? new RegExp(`\\b(${names.join('|')})\\b`) : null
  const hits = codeFiles.filter(file => modules.includes(file) || pattern.test(read(file)) || calls?.test(read(file)))
  return hits.length ? [`${name} : ${sample(hits)}`] : []
}))

section('Fichiers souvent en conflit entre sessions parallèles', files.filter(file => matches(file, CONFLICT_PRONE)))

console.log(out.join('\n').trimEnd())
