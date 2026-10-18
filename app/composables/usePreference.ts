import type { WritableComputedRef } from 'vue'
import type { AccountPreferenceKey } from '#shared/utils/preferences'
import type { Preferences } from '~/utils/preferences'

// One of the member's preferences (#145) for a component: the default until it is mounted, as the server
// rendered it (hydration must find the same page), then the member's value, following the account once loaded.
// Setting it saves it on the device and in the account.
export function usePreference<K extends AccountPreferenceKey>(key: K): WritableComputedRef<Preferences[K]> {
  const preferences = usePreferencesStore()
  const mounted = ref(false)
  onMounted(() => {
    mounted.value = true
  })
  return computed({
    get: () => (mounted.value ? preferences.values[key] : PREFERENCE_DEFAULTS[key]),
    set: value => preferences.set(key, value),
  })
}
