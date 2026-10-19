---
paths:
  - "app/utils/preferences.ts"
  - "app/stores/preferences.ts"
  - "app/plugins/preferences.client.ts"
  - "app/composables/usePreference.ts"
  - "shared/utils/preferences.ts"
  - "server/api/profile/me/preferences*"
  - "test/e2e/specs/preferences.spec.ts"
---

# Preferences kept in the account (#145)

- What follows the account: basemap, 3D view, map orientation, home filter (`searchScope`), "Données" screen (`liveData`), voice guidance, pace per sport (`paces`, `paces.md`), start area (`startArea`, `maps.md`). What stays on the device: side panel width and state (depends on the screen), prepared offline routes and the outing being recorded (data, not preferences), theme and accent (cookies, so the server renders them).
- Storage: one row per member in `user_preferences` (`preferences` jsonb, key → value), read and written by the member alone (RLS). `PATCH /api/profile/me/preferences` sends only the changed keys; `update_my_preferences` merges them with `||` in one statement, so keys another device changed meanwhile stay. A value is replaced as a whole (no deep merge).
- Format: the server only checks the key list (`ACCOUNT_PREFERENCES`) and the size. Each value is parsed by the app (`PREFERENCES[key].parse`), which returns the default for anything unknown or damaged (the account can hold a value saved by an older version) and for `undefined`: `PREFERENCE_DEFAULTS` comes from it.
- A new setting (#147 start area, #148 default sport, #149 readability, #151 map style…): its key in `ACCOUNT_PREFERENCES` (shared), its type in `Preferences` and an entry in `PREFERENCES` (`app/utils/preferences.ts`) with a new `sport-map:` storage key, its parse function and, for a non-JSON format, `encode`/`decode`. No migration. Components read it with `usePreference(key)`.
- localStorage keys are never renamed: they hold the last known value (offline, and until the account is loaded), and the values from before #145 that fill the account. `sport-map:preferences-sync` keeps the owner (member whose account the values came from; null before #145) and the keys changed but not saved yet.
- Merge on loading the account (`mergePreferences`, unit-tested): a pending change wins, then the account, then the device's value for a key the account lacks (that is the gentle migration). Values of another member who used the device are neither sent nor kept, except the changes the new member made before their account arrived.
- Loading: once per visit, when `useSupabaseUser()` gives a member (`plugins/preferences.client.ts`). Saving: 500 ms after a change; a failure (offline, expired session) stays pending, sent again on the `online` event or the next visit; a 400 (key or value the server refuses) is dropped from pending, so it never blocks later changes. Changes made on another device show after a reload; the map follows a late account (`MapView` watches the 3D preference, the basemap goes through `shown`).
- Hydration: the store reads localStorage when created in the browser (`skipHydrate`), so a component must not render a preference before it is mounted. `usePreference()` returns the default until then; `routeSearch` does the same with `restoreScope()`.
- Export and deletion: `reglages.json` in the archive; the row goes with the account (cascade from `profiles`).
- e2e: the worker's users are shared by its tests, so the auto fixture `freshPreferences` deletes their rows before each test. `newDevice(role, localStorage?)` opens another device of the same member (own browser context); `preferences.spec.ts` uses it for the two-device, offline and migration tests.
