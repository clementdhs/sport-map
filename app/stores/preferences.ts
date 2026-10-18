import type { FetchError } from 'ofetch'
import { skipHydrate } from 'pinia'
import type { MyPreferences } from '#shared/types/account'
import type { AccountPreferenceKey } from '#shared/utils/preferences'
import type { Preferences, PreferencesSync } from '~/utils/preferences'

// Several checkboxes ticked in a row go in one request.
const SAVE_DELAY_MS = 500

// The member's preferences (#145): the device's values at once, then the account's, loaded once per visit
// when a session is known (plugins/preferences.client.ts). A change applies at once, is written on the device
// and sent to the account; without network it stays pending on the device, and is sent back online or on the
// next visit. Components read them through usePreference(), which waits for hydration.
export const usePreferencesStore = defineStore('preferences', () => {
  // Read from the device when the store is created in the browser; the server has none (skipHydrate: its
  // empty state mustn't replace them).
  const chosen = skipHydrate(ref<Partial<Preferences>>(import.meta.client ? readDevicePreferences() : {}))
  const values = computed(() => ({ ...PREFERENCE_DEFAULTS, ...chosen.value }) as Preferences)

  let sync: PreferencesSync = import.meta.client ? readPreferencesSync() : { owner: null, pending: [] }
  // The session's member, whether their account was loaded during this visit, and the keys they changed since
  // they were known.
  let member: string | null = null
  let loaded = false
  let changedByMember: AccountPreferenceKey[] = []
  let saving: Promise<void> | undefined
  let saveAgain = false
  let saveTimer: ReturnType<typeof setTimeout> | undefined

  function updateSync(next: PreferencesSync) {
    sync = next
    writePreferencesSync(next)
  }

  function set<K extends AccountPreferenceKey>(key: K, value: Preferences[K]) {
    chosen.value = { ...chosen.value, [key]: value }
    writeDevicePreference(key, value)
    if (!sync.pending.includes(key)) updateSync({ ...sync, pending: [...sync.pending, key] })
    if (member && !changedByMember.includes(key)) changedByMember = [...changedByMember, key]
    clearTimeout(saveTimer)
    saveTimer = setTimeout(save, SAVE_DELAY_MS)
  }

  // The session's member (null once signed out). A new one gets their account loaded.
  function setMember(id: string | null) {
    if (id === member) return
    member = id
    loaded = false
    changedByMember = []
    if (id) void save()
  }

  async function saveOnce() {
    const id = member
    if (!id) return
    if (!loaded) {
      const account = await $fetch<MyPreferences>('/api/profile/me/preferences')
      if (id !== member) return
      // After the request: a change made meanwhile is pending, and wins. On a device another member used, only
      // this member's own changes are theirs.
      const theirs = sync.owner !== null && sync.owner !== id
      const merged = theirs
        ? mergePreferences(pickPreferences(chosen.value, changedByMember), { owner: id, pending: changedByMember }, account, id)
        : mergePreferences(chosen.value, sync, account, id)
      for (const key of ACCOUNT_PREFERENCES) writeDevicePreference(key, merged.chosen[key])
      chosen.value = merged.chosen
      updateSync({ owner: id, pending: merged.pending })
      loaded = true
    }
    if (!sync.pending.length) return
    const sent = Object.fromEntries(sync.pending.map(key => [key, chosen.value[key]])) as Partial<Preferences>
    try {
      await $fetch('/api/profile/me/preferences', { method: 'PATCH', body: sent })
    }
    catch (error) {
      // Refused (a key or value this server doesn't take): sent again, it would block every later change. The
      // device keeps the value.
      if ((error as FetchError).statusCode === 400) updateSync({ ...sync, pending: sync.pending.filter(key => !(key in sent)) })
      throw error
    }
    if (id !== member) return
    // A key changed again during the request stays pending (values are replaced, never mutated).
    updateSync({ ...sync, pending: sync.pending.filter(key => chosen.value[key] !== sent[key]) })
  }

  // Loads the account if needed, then sends the pending changes; one run at a time, a call during a run asks for
  // another. Failures are quiet (offline, session expired): the changes stay pending for the next try.
  function save(): Promise<void> {
    clearTimeout(saveTimer)
    if (saving) {
      saveAgain = true
      return saving
    }
    saving = (async () => {
      try {
        do {
          saveAgain = false
          await saveOnce()
        } while (saveAgain)
      }
      catch { /* tried again back online, or on the next visit */ }
      finally {
        saving = undefined
      }
    })()
    return saving
  }

  return { values, set, setMember, save }
})
