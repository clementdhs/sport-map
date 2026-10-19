import type { MyPreferences } from '#shared/types/account'
import { ACCOUNT_PREFERENCES, type AccountPreferenceKey } from '#shared/utils/preferences'
import { parseSportPaces, type SportPaces } from '#shared/utils/pace'
import type { SearchScope, SportType } from '#shared/utils/routes'
import { parseBasemap, type Basemap } from '~/utils/basemaps'
import { parseDefaultSport } from '~/utils/defaultSport'
import { parseLiveDataPrefs, type LiveDataPrefs } from '~/utils/liveStats'
import { parseMapOrientation, type MapOrientation } from '~/utils/mapOrientation'
import { parseMapStyleChoice, type MapStyleChoice } from '~/utils/mapStyle'
import { parseSearchScope } from '~/utils/searchScope'
import { parseStartArea, type StartArea } from '~/utils/startArea'
import { parseVoicePrefs, type VoicePrefs } from '~/utils/voiceGuide'

// The preferences that follow the member's account (#145), with how the device keeps them: each one's
// localStorage key holds the last value known, used offline and until the account is loaded. The store
// (app/stores/preferences.ts) loads the account and saves changes; the functions here are pure or touch
// localStorage only. The width of the side panel, prepared offline routes and the outing being recorded
// stay on the device: they depend on the screen, or are data rather than preferences.
export interface Preferences {
  basemap: Basemap
  map3d: boolean
  mapOrientation: MapOrientation
  searchScope: SearchScope
  liveData: LiveDataPrefs
  voice: VoicePrefs
  paces: SportPaces
  startArea: StartArea | null
  // Preselected wherever a sport is chosen (#148); null: none.
  defaultSport: SportType | null
  // Light or dark MapTiler style, or the theme's (#151).
  mapStyle: MapStyleChoice
}

interface PreferenceEntry<T> {
  // Never renamed: the devices' values from before #145 are read there, and fill an empty account.
  storageKey: string
  // A saved value (from the account, or decoded from the device), or the default for anything unknown,
  // undefined included: an older or damaged value, or none.
  parse: (value: unknown) => T
  // How the device writes it: JSON unless said otherwise.
  encode?: (value: T) => string
  decode?: (raw: string) => unknown
}

const AS_TEXT = { encode: (value: string) => value, decode: (raw: string) => raw }

export const PREFERENCES: { [K in AccountPreferenceKey]: PreferenceEntry<Preferences[K]> } = {
  basemap: { storageKey: 'sport-map:basemap', parse: parseBasemap, ...AS_TEXT },
  map3d: { storageKey: 'sport-map:map-3d', parse: value => value === true, encode: on => (on ? '1' : '0'), decode: raw => raw === '1' },
  mapOrientation: { storageKey: 'sport-map:map-orientation', parse: parseMapOrientation, ...AS_TEXT },
  searchScope: { storageKey: 'sport-map:search-scope', parse: parseSearchScope, ...AS_TEXT },
  liveData: { storageKey: 'sport-map:live-data', parse: parseLiveDataPrefs },
  voice: { storageKey: 'sport-map:voice', parse: parseVoicePrefs },
  paces: { storageKey: 'sport-map:paces', parse: parseSportPaces },
  startArea: { storageKey: 'sport-map:start-area', parse: parseStartArea },
  defaultSport: { storageKey: 'sport-map:default-sport', parse: parseDefaultSport },
  mapStyle: { storageKey: 'sport-map:map-style', parse: parseMapStyleChoice, ...AS_TEXT },
}

export const PREFERENCE_DEFAULTS = Object.fromEntries(
  ACCOUNT_PREFERENCES.map(key => [key, PREFERENCES[key].parse(undefined)]),
) as unknown as Preferences

// Who the device's values belong to, and the keys changed on it that the account doesn't have yet.
export interface PreferencesSync {
  // The member whose account they were last merged with; null for values kept before #145.
  owner: string | null
  pending: AccountPreferenceKey[]
}

const SYNC_KEY = 'sport-map:preferences-sync'
const NO_SYNC: PreferencesSync = { owner: null, pending: [] }

export function parsePreferencesSync(value: unknown): PreferencesSync {
  if (!value || typeof value !== 'object') return NO_SYNC
  const saved = value as Record<string, unknown>
  return {
    owner: typeof saved.owner === 'string' ? saved.owner : null,
    pending: Array.isArray(saved.pending) ? ACCOUNT_PREFERENCES.filter(key => (saved.pending as unknown[]).includes(key)) : [],
  }
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  }
  catch {
    return null
  }
}

function writeStorage(key: string, raw: string | null) {
  try {
    if (raw === null) localStorage.removeItem(key)
    else localStorage.setItem(key, raw)
  }
  catch { /* storage full or blocked: kept until the page closes */ }
}

function decodePreference<K extends AccountPreferenceKey>(key: K, raw: string): Preferences[K] | undefined {
  const entry: PreferenceEntry<Preferences[K]> = PREFERENCES[key]
  try {
    return entry.parse(entry.decode ? entry.decode(raw) : JSON.parse(raw))
  }
  catch {
    return undefined
  }
}

// The values the device has, by key: none for a key it never saved (or saved damaged).
export function readDevicePreferences(): Partial<Preferences> {
  const values: Partial<Record<AccountPreferenceKey, unknown>> = {}
  for (const key of ACCOUNT_PREFERENCES) {
    const raw = readStorage(PREFERENCES[key].storageKey)
    const value = raw === null ? undefined : decodePreference(key, raw)
    if (value !== undefined) values[key] = value
  }
  return values as Partial<Preferences>
}

// Undefined removes the key: the default applies.
export function writeDevicePreference<K extends AccountPreferenceKey>(key: K, value: Preferences[K] | undefined) {
  const entry: PreferenceEntry<Preferences[K]> = PREFERENCES[key]
  if (value === undefined) writeStorage(entry.storageKey, null)
  else writeStorage(entry.storageKey, entry.encode ? entry.encode(value) : JSON.stringify(value))
}

export function readPreferencesSync(): PreferencesSync {
  try {
    return parsePreferencesSync(JSON.parse(readStorage(SYNC_KEY) ?? 'null'))
  }
  catch {
    return NO_SYNC
  }
}

export function writePreferencesSync(sync: PreferencesSync) {
  writeStorage(SYNC_KEY, JSON.stringify(sync))
}

// The values of these keys only.
export function pickPreferences(values: Partial<Preferences>, keys: AccountPreferenceKey[]): Partial<Preferences> {
  return Object.fromEntries(keys.filter(key => values[key] !== undefined).map(key => [key, values[key]]))
}

export interface PreferencesMerge {
  // The member's values, by key; the defaults for the others.
  chosen: Partial<Preferences>
  // Keys whose value goes to the account.
  pending: AccountPreferenceKey[]
}

// What the device keeps and sends once the account of `member` is loaded. A change made on the device and not
// saved yet wins, then the account; a key the account doesn't have takes the device's value (this is how the
// preferences kept before #145 fill an empty account). Values of another member who used the device are
// neither sent nor kept.
export function mergePreferences(
  device: Partial<Preferences>,
  sync: PreferencesSync,
  account: MyPreferences,
  member: string,
): PreferencesMerge {
  const mine = sync.owner === null || sync.owner === member
  const chosen: Partial<Record<AccountPreferenceKey, unknown>> = {}
  const pending: AccountPreferenceKey[] = []
  for (const key of ACCOUNT_PREFERENCES) {
    const local = mine ? device[key] : undefined
    const saved = account[key]
    if (local !== undefined && (saved === undefined || sync.pending.includes(key))) {
      chosen[key] = local
      pending.push(key)
    }
    else if (saved !== undefined) {
      chosen[key] = PREFERENCES[key].parse(saved)
    }
  }
  return { chosen: chosen as Partial<Preferences>, pending }
}
