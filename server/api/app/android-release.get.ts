import type { AndroidRelease } from '#shared/types/androidRelease'
import type { GithubRelease } from '#shared/utils/androidRelease'

// The latest GitHub Release of the Android app (#337, .github/workflows/android-release.yml), read by the installed
// app to offer an update. Cached for an hour, a failure too (the app then offers nothing until the next read): GitHub
// allows 60 requests an hour per IP without a token, and Vercel's IPs are shared. NUXT_GITHUB_TOKEN (optional, no
// scope needed on a public repository) raises that limit.
const latestAndroidRelease = defineCachedFunction(
  async (): Promise<AndroidRelease | null> => {
    const { githubToken } = useRuntimeConfig()
    const release = await $fetch<GithubRelease>('https://api.github.com/repos/clementdhs/sport-map/releases/latest', {
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'sportmap',
        ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
      },
      timeout: 8000,
    }).catch(() => null)
    return androidReleaseFromGithub(release)
  },
  { name: 'android-release', maxAge: 3600, swr: true, getKey: () => 'latest' },
)

export default defineEventHandler(async (): Promise<AndroidRelease | null> => {
  return await latestAndroidRelease()
})
