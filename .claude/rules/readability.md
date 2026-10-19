---
paths:
  - "app/composables/useOutdoorReadability.ts"
  - "app/plugins/readability.ts"
  - "app/components/OutdoorReadability*.vue"
  - "app/assets/css/main.css"
  - "test/e2e/specs/readability.spec.ts"
---

# Outdoor readability (#149)

- One switch, « Lisibilité en extérieur »: in the settings (`#appearance`, `OutdoorReadabilitySetting`) and as an icon button in the top bar of follow mode and recording (`OutdoorReadabilityToggle`, `aria-pressed`). It sets `data-readability="outdoor"` on `<html>`; `main.css` then raises the root font size to 112.5 % (18 px: text, spacing and every rem-sized box grow with it) and redefines Nuxt UI's text and border variables two or three shades stronger (no `neutral-400` text, borders `neutral-400/500` in light mode, the mirror in dark mode). Grey text must go through `text-muted` / `text-dimmed` / `text-toned` and borders through `border-default` / `border-muted` / `border-accented`, never a fixed palette, so that it follows.
- Two stores, on purpose: the account (`outdoorReadability` preference, `preferences.md`) is the reference, found again on every device; the `sport-map-readability` cookie (boolean, a year) mirrors it so that the server renders `<html data-readability>` without a flash, as the accent does (`theme.md`). An account preference alone is only known after mounting (localStorage, then the account), too late for the first paint.
- `useOutdoorReadability()` reads the cookie through `useState`, so its value is right from the server render: unlike `usePreference()`, components may show it before mounting. `setOutdoor(on)` writes state, cookie and preference. `plugins/readability.ts` sets the attribute (`useHead`) and, once hydration is over (`onNuxtReady`: with `app:mounted`, an account loaded while the settings page still hydrated left its switch unchecked), follows the preference store (`setOutdoor(on, false)`): the device's value at once, the account's once loaded, so another device or a lost cookie catches up after one paint.
- Layout at 360 px with the option (`readability.spec.ts`): the tab bar's 5 columns (72 px), the home sheet and route cards, the top bars of follow mode and recording, and the « Données » grid fit without horizontal scroll. Those top bars lose 56 px on the right to the map controls (`pr-14`): on phones the recording badge is icon only, and with the option the « Données / Carte » button too (`outdoor:max-sm:sr-only` on its label; the `outdoor:` variant is defined in `main.css`). A new element in a phone bar, or a fixed width (`w-80`, `min-w-*`), grows by 12.5 % with the option: check it at 360 px.
