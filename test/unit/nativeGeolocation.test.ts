import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CallbackError, Location } from '@capacitor-community/background-geolocation'
import { isNativeApp, locationToFix, nativeErrorKey, watchNativePosition } from '~/utils/nativeGeolocation'

const plugin = vi.hoisted(() => ({
  addWatcher: vi.fn(),
  removeWatcher: vi.fn(),
}))
const requestPermissions = vi.hoisted(() => vi.fn())

vi.mock('@capacitor/core', async importOriginal => ({
  ...await importOriginal<typeof import('@capacitor/core')>(),
  registerPlugin: () => plugin,
}))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: { requestPermissions } }))

const location: Location = {
  latitude: 45.9,
  longitude: 6.12,
  accuracy: 8,
  altitude: 450,
  altitudeAccuracy: 4,
  simulated: false,
  bearing: null,
  speed: 2.5,
  time: 1_760_000_000_000,
}

describe('native geolocation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    plugin.addWatcher.mockResolvedValue('watcher-1')
  })

  it('is off in a browser', () => {
    expect(isNativeApp()).toBe(false)
  })

  it('turns a plugin location into a fix', () => {
    expect(locationToFix(location)).toEqual({ position: [6.12, 45.9], accuracyM: 8, altitudeM: 450 })
    expect(locationToFix({ ...location, altitude: null }).altitudeM).toBeNull()
  })

  it('explains a refused permission', () => {
    expect(nativeErrorKey(Object.assign(new Error('denied'), { code: 'NOT_AUTHORIZED' }) as CallbackError)).toBe('gps.deniedApp')
    expect(nativeErrorKey(new Error('other'))).toBe('gps.unavailable')
  })

  it('watches in the background with a notification, then stops', async () => {
    const onFix = vi.fn()
    const onError = vi.fn()
    const stop = await watchNativePosition({ title: 'Title', message: 'Message' }, onFix, onError)

    expect(requestPermissions).toHaveBeenCalled()
    const [options, callback] = plugin.addWatcher.mock.calls[0]!
    expect(options).toMatchObject({ backgroundTitle: 'Title', backgroundMessage: 'Message', requestPermissions: true, stale: false })

    callback(location)
    expect(onFix).toHaveBeenCalledWith({ position: [6.12, 45.9], accuracyM: 8, altitudeM: 450 })
    callback(undefined, Object.assign(new Error('denied'), { code: 'NOT_AUTHORIZED' }))
    expect(onError).toHaveBeenCalledWith('gps.deniedApp')

    stop()
    expect(plugin.removeWatcher).toHaveBeenCalledWith({ id: 'watcher-1' })
  })

  it('still watches when the notification permission request fails', async () => {
    requestPermissions.mockRejectedValueOnce(new Error('not implemented'))
    await watchNativePosition({ title: 'Title', message: 'Message' }, vi.fn(), vi.fn())
    expect(plugin.addWatcher).toHaveBeenCalled()
  })
})
