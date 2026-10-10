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
- From md up the side panel collapses with the tab on its left edge ("Réduire le panneau", `aria-expanded`); the map then takes the whole width and the `title` slot floats at the top right, left of MapLibre's controls, beside "Afficher le panneau". Focus moves to the button that replaces the clicked one. `aside[data-panel]` = `expanded` / `collapsed`.
- Its left edge is a `role="separator"` ("Redimensionner le panneau", `aria-valuenow` = width in px): dragged with the pointer (pointer capture), or Left / Right arrows (16 px, ×4 with Shift), Home / End for the narrowest / widest panel. Width between 320 and 720 px, and at most the window minus 360 px for the map (`sidePanelWidth`, recomputed on window resize; the saved width is kept as dragged). The layout sets `--panel-width` on its root, used by the aside from md up.
- Collapsed state and width are kept in localStorage (`app/utils/sidePanel.ts`, key `sport-map:side-panel`), read on mount (the SSR page shows the panel open at 384 px), and ignored below md.
- When the map alone changes width (the side panel collapsed, expanded or resized), `MapView` keeps its left edge in place (`panBy` half the change) instead of its centre, so the map doesn't jump; window resizes keep MapLibre's default (centre kept). Framing needs nothing more: the map's own size already excludes the panel.
- `MapTopBar` floats at the top left of the map (MapLibre's controls are top right, scale and attribution at the bottom): back button when the page passes `back` (its fallback when there is no previous page in the app, read from `history.state.back`), logo, and `AccountMenu compact` (same menu as the header, button "Mon compte"). Its top margin uses `env(safe-area-inset-top)`.
- The optional `search` slot (editor: `SearchBox places-only`) sits under the top bar on phones and tablets, between it and MapLibre's controls, and beside it from lg up. `useMapPadding` counts it in the top inset; the full sheet still stops under the bar alone. A picked place moves the map with `focusOn(map, focus)` from `useMapPadding` (bbox → `fitBounds`, else `flyTo`), never adding a waypoint.
- The `actions` slot (home: Enregistrer / Créer) floats above the sheet on phones, following its edge through `--sheet-height` (set on the layout root) but never lower than the scale and attribution; hidden when the sheet is full or dragged above half. From md up it tops the side panel. Short visible labels, full `aria-label`.
- The map stops above the collapsed sheet (attribution and scale stay visible) and never resizes when the sheet moves. Views framed on a route or place use `useMapPadding()` (`padding(base)` for `fitBounds`, `offset()` for `flyTo`) so they stay under the top bar and above the open sheet. Never pass `padding` to `easeTo` / `flyTo`: MapLibre would keep it for every later move.
- The page may bind `v-model:snap` (the route page collapses the sheet during a flyover). The optional `overlay` slot (flyover controls) floats at the bottom of the map: above the sheet's edge on phones like the actions (hidden when the sheet is full), centred above the scale and attribution from md up; the map container is `md:relative` for it.
- On the home page, the results line under the filters is `max-md:sr-only`: the sheet title shows it on phones, and the `aria-live` announcement stays.
- e2e (`specs/layout.spec.ts`): the phone test drives the sheet with buttons, the keyboard and a mouse drag; the test account goes through the top bar and the actions on a phone and a computer; other tests collapse, reopen (keyboard), resize (mouse, keyboard) and reload the side panel on a computer.
