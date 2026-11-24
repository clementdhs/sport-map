import { describe, expect, it } from 'vitest'
import { androidReleaseFromGithub, androidVersionFromTag, isAndroidBrowser, isDebugAndroidBuild, shouldOfferAndroidUpdate } from '#shared/utils/androidRelease'

// Android app distributed through GitHub Releases (#337): the release tag gives the version, the site offers the APK
// to Android browsers and tells the installed app when a newer release exists.
describe('androidVersionFromTag', () => {
  it('reads the version name and a growing version code from an android-v tag', () => {
    expect(androidVersionFromTag('android-v1.2.3')).toEqual({ name: '1.2.3', code: 10203 })
    expect(androidVersionFromTag('android-v2.0.0')).toEqual({ name: '2.0.0', code: 20000 })
  })

  it('takes a missing patch number as 0', () => {
    expect(androidVersionFromTag('android-v1.4')).toEqual({ name: '1.4.0', code: 10400 })
  })

  it('gives a higher code to every later version', () => {
    const codes = ['android-v1.0.0', 'android-v1.0.1', 'android-v1.0.99', 'android-v1.1.0', 'android-v1.99.99', 'android-v2.0.0']
      .map(tag => androidVersionFromTag(tag)!.code)
    expect(codes).toEqual([...codes].sort((a, b) => a - b))
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('starts above the version code of the debug builds installed by hand', () => {
    expect(androidVersionFromTag('android-v1.0.0')!.code).toBeGreaterThan(1)
  })

  it('rejects other tags, a major version 0 and numbers that would overlap the next one', () => {
    for (const tag of ['v1.2.3', 'android-1.2.3', 'android-v1', 'android-v1.2.3-beta', 'android-v0.9.0', 'android-v1.100.0', 'android-v1.2.100', 'android-v01.2.3', '']) {
      expect(androidVersionFromTag(tag), tag).toBeNull()
    }
  })
})

describe('isAndroidBrowser', () => {
  it('recognises Android phones and tablets', () => {
    expect(isAndroidBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36')).toBe(true)
    expect(isAndroidBrowser('Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0')).toBe(true)
  })

  it('leaves out iPhones and computers', () => {
    expect(isAndroidBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe(false)
    expect(isAndroidBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36')).toBe(false)
    expect(isAndroidBrowser('')).toBe(false)
  })
})

describe('shouldOfferAndroidUpdate', () => {
  it('offers a release whose version code is above the installed one', () => {
    expect(shouldOfferAndroidUpdate({ installedCode: 10000, latestCode: 10001, dismissedCode: null })).toBe(true)
  })

  it('offers nothing when the installed version is the latest or newer', () => {
    expect(shouldOfferAndroidUpdate({ installedCode: 10001, latestCode: 10001, dismissedCode: null })).toBe(false)
    expect(shouldOfferAndroidUpdate({ installedCode: 10100, latestCode: 10001, dismissedCode: null })).toBe(false)
  })

  it('offers nothing when the installed or the latest version is unknown', () => {
    expect(shouldOfferAndroidUpdate({ installedCode: null, latestCode: 10001, dismissedCode: null })).toBe(false)
    expect(shouldOfferAndroidUpdate({ installedCode: 10000, latestCode: null, dismissedCode: null })).toBe(false)
  })

  it('stays quiet for a version already dismissed, and comes back for the next one', () => {
    expect(shouldOfferAndroidUpdate({ installedCode: 10000, latestCode: 10001, dismissedCode: 10001 })).toBe(false)
    expect(shouldOfferAndroidUpdate({ installedCode: 10000, latestCode: 10002, dismissedCode: 10001 })).toBe(true)
  })
})

describe('androidReleaseFromGithub', () => {
  const apk = { name: 'sportmap.apk', browser_download_url: 'https://github.com/clementdhs/sport-map/releases/download/android-v1.2.3/sportmap.apk' }
  const release = { tag_name: 'android-v1.2.3', draft: false, prerelease: false, assets: [{ name: 'notes.txt', browser_download_url: 'x' }, apk] }

  it('gives the version and the APK of an Android release', () => {
    expect(androidReleaseFromGithub(release)).toEqual({ versionName: '1.2.3', versionCode: 10203, apkUrl: apk.browser_download_url })
  })

  it('gives nothing for another tag, a release without sportmap.apk, a draft or a pre-release', () => {
    expect(androidReleaseFromGithub({ ...release, tag_name: 'v2.0.0' })).toBeNull()
    expect(androidReleaseFromGithub({ ...release, assets: [] })).toBeNull()
    expect(androidReleaseFromGithub({ ...release, draft: true })).toBeNull()
    expect(androidReleaseFromGithub({ ...release, prerelease: true })).toBeNull()
    expect(androidReleaseFromGithub(null)).toBeNull()
  })
})

describe('isDebugAndroidBuild', () => {
  it('recognises the debug builds installed by hand, signed with another key than the releases', () => {
    expect(isDebugAndroidBuild(1)).toBe(true)
    expect(isDebugAndroidBuild(10000)).toBe(false)
    expect(isDebugAndroidBuild(10203)).toBe(false)
  })
})