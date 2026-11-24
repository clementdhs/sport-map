// Android app distributed through GitHub Releases (#337). Type imports only: scripts/android-version.ts runs this file
// with Node's type stripping in the release workflow, so the APK and the site agree on version codes.
import type { AndroidRelease } from '../types/androidRelease'

// Always the APK of the latest release: the workflow publishes it under this fixed name.
export const ANDROID_APK_URL = 'https://github.com/clementdhs/sport-map/releases/latest/download/sportmap.apk'

export interface AndroidVersion {
  // Shown in Android's settings, e.g. 1.2.3.
  name: string
  // Android's versionCode, which must grow with every release for an update to install.
  code: number
}

const TAG = /^android-v([1-9]\d*)\.(0|[1-9]\d?)(?:\.(0|[1-9]\d?))?$/

// Version of a release tag `android-vX.Y[.Z]`: code X·10000 + Y·100 + Z, so minor and patch stay under 100 and
// every later version gets a higher code. Null for any other tag. Major starts at 1: the debug builds installed
// by hand before #337 have code 1.
export function androidVersionFromTag(tag: string): AndroidVersion | null {
  const match = TAG.exec(tag)
  if (!match) return null
  const [major, minor, patch] = [match[1], match[2], match[3] ?? '0'].map(Number) as [number, number, number]
  return { name: `${major}.${minor}.${patch}`, code: major * 10000 + minor * 100 + patch }
}

// The download button is for Android browsers only: the APK means nothing on an iPhone or a computer.
export function isAndroidBrowser(userAgent: string): boolean {
  return /\bAndroid\b/i.test(userAgent)
}

export interface AndroidUpdateCheck {
  // versionCode of the installed app (App.getInfo().build), null when unknown.
  installedCode: number | null
  // versionCode of the latest release, null when it couldn't be read.
  latestCode: number | null
  // versionCode whose notice the member closed.
  dismissedCode: number | null
}

// The installed app offers an update when a release is newer, until the member closes the notice of that version.
export function shouldOfferAndroidUpdate({ installedCode, latestCode, dismissedCode }: AndroidUpdateCheck): boolean {
  if (installedCode === null || latestCode === null) return false
  return latestCode > installedCode && latestCode !== dismissedCode
}

// Versions below the first release's code (android-v1.0.0) are the debug builds installed by hand before #337: they
// are signed with each PC's debug key, so a release can only replace them once uninstalled.
export function isDebugAndroidBuild(code: number): boolean {
  return code < 10000
}

// The part of GitHub's release JSON (GET /repos/…/releases/latest) the site reads.
export interface GithubRelease {
  tag_name: string
  draft: boolean
  prerelease: boolean
  assets: { name: string, browser_download_url: string }[]
}

// The Android version and APK of a GitHub release (published by .github/workflows/android-release.yml); null for
// anything else: another tag, no sportmap.apk, a draft or a pre-release.
export function androidReleaseFromGithub(release: GithubRelease | null): AndroidRelease | null {
  if (!release || release.draft || release.prerelease) return null
  const version = androidVersionFromTag(release.tag_name)
  const apk = release.assets.find(asset => asset.name === 'sportmap.apk')
  if (!version || !apk) return null
  return { versionName: version.name, versionCode: version.code, apkUrl: apk.browser_download_url }
}