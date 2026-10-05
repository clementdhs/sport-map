---
paths:
  - "app/components/MapSheetLayout.vue"
  - "app/composables/useMapPadding.ts"
  - "app/components/map/**"
  - "app/pages/index.vue"
  - "app/pages/routes/[id]/index.vue"
  - "app/pages/collections/[id].vue"
  - "app/components/RouteEditorWorkspace.vue"
  - "app/components/MapTopBar.vue"
  - "app/components/AccountMenu.vue"
  - "app/components/SearchBox.vue"
---

# Map pages: side panel and mobile bottom sheet

- Home, route page, editor and collection page use `MapSheetLayout` (slots `map`, `title`, `actions`, default) and `definePageMeta({ layout: false })`: no app header, the map takes the whole height. Other pages keep `AppHeader` (no border). From md up the panel sits beside the map; below md the map fills the screen under a bottom sheet with three positions (`data-sheet` = `collapsed` / `half` / `full`, which stops under the top bar so that it stays reachable), moved by dragging its header (pointer events), by tapping it, or with the "Réduire / Agrandir le panneau" buttons. The `title` slot is the only thing shown when collapsed, and the hidden content is `inert`.
- From md up the side panel collapses with the tab on its left edge ("Réduire le panneau", `aria-expanded`); the map then takes the whole width and the `title` slot floats at the top right, left of MapLibre's controls, beside "Afficher le panneau". Focus moves to the button that replaces the clicked one. The state is kept in localStorage (`app/utils/sidePanel.ts`, key `sport-map:side-panel`), read on mount (the SSR page shows the panel open), and ignored below md. `aside[data-panel]` = `expanded` / `collapsed`.
- When the map alone changes width (the side panel), `MapView` keeps its left edge in place (`panBy` half the change) instead of its centre, so the map doesn't jump; window resizes keep MapLibre's default (centre kept). Framing needs nothing more: the map's own size already excludes the panel.
- `MapTopBar` floats at the top left of the map (MapLibre's controls are top right, scale and attribution at the bottom): back button when the page passes `back` (its fallback when there is no previous page in the app, read from `history.state.back`), logo, and `AccountMenu compact` (same menu as the header, button "Mon compte"). Its top margin uses `env(safe-area-inset-top)`.
- The optional `search` slot (editor: `SearchBox places-only`) sits under the top bar on phones and tablets, between it and MapLibre's controls, and beside it from lg up. `useMapPadding` counts it in the top inset; the full sheet still stops under the bar alone. A picked place moves the map with `focusOn(map, focus)` from `useMapPadding` (bbox → `fitBounds`, else `flyTo`), never adding a waypoint.
- The `actions` slot (home: Enregistrer / Créer) floats above the sheet on phones, following its edge through `--sheet-height` (set on the layout root) but never lower than the scale and attribution; hidden when the sheet is full or dragged above half. From md up it tops the side panel. Short visible labels, full `aria-label`.
- The map stops above the collapsed sheet (attribution and scale stay visible) and never resizes when the sheet moves. Views framed on a route or place use `useMapPadding()` (`padding(base)` for `fitBounds`, `offset()` for `flyTo`) so they stay under the top bar and above the open sheet. Never pass `padding` to `easeTo` / `flyTo`: MapLibre would keep it for every later move.
- On the home page, the results line under the filters is `max-md:sr-only`: the sheet title shows it on phones, and the `aria-live` announcement stays.
- e2e: the phone test in `family.spec.ts` drives the sheet with buttons, the keyboard and a mouse drag; `signed-in.spec.ts` goes through the top bar and the actions on a phone and a computer; `family.spec.ts` also collapses, reopens (keyboard) and reloads the side panel on a computer.
