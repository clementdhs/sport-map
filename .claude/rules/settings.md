---
paths:
  - "app/pages/settings.vue"
  - "app/components/SettingsNav.vue"
  - "app/components/AccountData.vue"
  - "app/components/VoiceGuideForm.vue"
---

# Settings page (#111)

- One page in sections, each a `<section id>` with an English id whatever the language, since links are shared: `/settings#profile`, `#account` (password, data and deletion), `#appearance` (language, theme, map style #151, outdoor readability: `readability.md`), `#sport` (default sport, #148), `#paces` (pace per sport, `paces.md`), `#start-area` (start area of the maps, `maps.md`), `#voice`. A new setting goes in one of them; a new section needs an entry in the page's `sections` list (label key `settings.sections.*`).
- `SettingsNav`: a sticky strip of chips under the header on phones (horizontal scroll, the active chip kept in sight), a sticky left column from `md`. The highlighted link follows the scroll (last section whose top is above a third of the screen; at the bottom of the page, the last one). A click, the URL hash or a hash change keeps its section highlighted (`pinned`) until the reader scrolls on their own (wheel, touch, key), because the last sections can't reach the top. The hash is only read once mounted: the server never gets it, and reading it in setup broke hydration.
- Sections carry `scroll-mt` for the header plus the phone strip; the default layout already leaves room for the bottom tab bar.
- The voice section is in `<ClientOnly>`: speech support and the saved choices only exist in the browser.
