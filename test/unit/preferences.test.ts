import { describe, expect, it } from 'vitest'
import { preferencesPatchSchema } from '#shared/utils/preferences'
import { DEFAULT_VOICE_PREFS } from '~/utils/voiceGuide'
import { mergePreferences, parsePreferencesSync, PREFERENCE_DEFAULTS, PREFERENCES } from '~/utils/preferences'

const ME = 'member-1'

describe('PREFERENCES', () => {
  it('falls back to the defaults for nothing or anything unknown', () => {
    expect(PREFERENCE_DEFAULTS).toEqual({
      basemap: 'maptiler',
      map3d: false,
      mapOrientation: 'north',
      searchScope: 'mine',
      liveData: {},
      voice: DEFAULT_VOICE_PREFS,
      paces: {},
      startArea: null,
      defaultSport: null,
      mapStyle: 'theme',
      outdoorReadability: false,
      osmPlaces: true,
    })
    expect(PREFERENCES.basemap.parse('scan25')).toBe('maptiler')
    expect(PREFERENCES.map3d.parse('1')).toBe(false)
    expect(PREFERENCES.liveData.parse({ follow: ['time', 'nope'] })).toEqual({ follow: ['time'] })
    expect(PREFERENCES.paces.parse({ running: 5, swimming: 2, hiking: 'fast' })).toEqual({ running: 5 })
    expect(PREFERENCES.defaultSport.parse('swimming')).toBeNull()
    expect(PREFERENCES.mapStyle.parse('sepia')).toBe('theme')
    expect(PREFERENCES.mapStyle.parse('dark')).toBe('dark')
    expect(PREFERENCES.outdoorReadability.parse('true')).toBe(false)
    expect(PREFERENCES.outdoorReadability.decode!('1')).toBe(true)
    // Shown unless turned off.
    expect(PREFERENCES.osmPlaces.parse('0')).toBe(true)
    expect(PREFERENCES.osmPlaces.parse(false)).toBe(false)
    expect(PREFERENCES.osmPlaces.decode!('0')).toBe(false)
  })

  it('keeps the storage format of the devices from before #145', () => {
    expect(PREFERENCES.map3d.encode!(true)).toBe('1')
    expect(PREFERENCES.map3d.decode!('1')).toBe(true)
    expect(PREFERENCES.basemap.encode!('ignPlan')).toBe('ignPlan')
    expect(PREFERENCES.voice.encode).toBeUndefined()
  })
})

describe('parsePreferencesSync', () => {
  it('reads the owner and the known pending keys', () => {
    expect(parsePreferencesSync({ owner: ME, pending: ['basemap', 'nope', 'voice'] })).toEqual({ owner: ME, pending: ['basemap', 'voice'] })
  })

  it('treats a missing or damaged value as kept before #145', () => {
    expect(parsePreferencesSync(null)).toEqual({ owner: null, pending: [] })
    expect(parsePreferencesSync({ owner: 3, pending: 'basemap' })).toEqual({ owner: null, pending: [] })
  })
})

describe('mergePreferences', () => {
  it('fills an empty account with the values kept on the device before #145', () => {
    const device = { basemap: 'ignPlan' as const, voice: { enabled: true, announcements: ['track' as const] } }
    expect(mergePreferences(device, { owner: null, pending: [] }, {}, ME)).toEqual({
      chosen: device,
      pending: ['basemap', 'voice'],
    })
  })

  it('takes the account\'s values over the device\'s cache', () => {
    const merged = mergePreferences({ basemap: 'ignPlan', map3d: true }, { owner: ME, pending: [] }, { basemap: 'maptiler', map3d: true }, ME)
    expect(merged).toEqual({ chosen: { basemap: 'maptiler', map3d: true }, pending: [] })
  })

  it('sends a change made offline, which wins over the account', () => {
    const merged = mergePreferences(
      { mapOrientation: 'heading', searchScope: 'all' },
      { owner: ME, pending: ['mapOrientation'] },
      { mapOrientation: 'north', searchScope: 'mine' },
      ME,
    )
    expect(merged).toEqual({ chosen: { mapOrientation: 'heading', searchScope: 'mine' }, pending: ['mapOrientation'] })
  })

  it('adds the device\'s value for a key the account doesn\'t have yet', () => {
    const merged = mergePreferences({ basemap: 'ignPlan', map3d: true }, { owner: null, pending: [] }, { basemap: 'maptiler' }, ME)
    expect(merged).toEqual({ chosen: { basemap: 'maptiler', map3d: true }, pending: ['map3d'] })
  })

  it('neither sends nor keeps the values of another member who used the device', () => {
    const merged = mergePreferences(
      { basemap: 'ignPlan', map3d: true },
      { owner: 'member-2', pending: ['map3d'] },
      { searchScope: 'all' },
      ME,
    )
    expect(merged).toEqual({ chosen: { searchScope: 'all' }, pending: [] })
  })

  it('parses what the account holds, ignoring unknown or damaged values', () => {
    const merged = mergePreferences({}, { owner: ME, pending: [] }, { basemap: 'scan25', liveData: { pace: true, record: 'oops' } }, ME)
    expect(merged.chosen).toEqual({ basemap: 'maptiler', liveData: { pace: true } })
  })
})

describe('preferencesPatchSchema', () => {
  it('accepts known keys with any JSON value', () => {
    expect(preferencesPatchSchema.parse({ basemap: 'ignPlan', voice: { enabled: true, announcements: [] } }))
      .toEqual({ basemap: 'ignPlan', voice: { enabled: true, announcements: [] } })
  })

  it('refuses unknown keys, other shapes and oversized changes', () => {
    expect(preferencesPatchSchema.safeParse({ theme: 'dark' }).success).toBe(false)
    expect(preferencesPatchSchema.safeParse(['basemap']).success).toBe(false)
    expect(preferencesPatchSchema.safeParse({ liveData: 'x'.repeat(5000) }).success).toBe(false)
  })
})
