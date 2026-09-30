---
paths:
  - "app/components/MapSheetLayout.vue"
  - "app/composables/useMapPadding.ts"
  - "app/components/map/**"
  - "app/pages/index.vue"
  - "app/pages/routes/[id]/index.vue"
  - "app/pages/collections/[id].vue"
  - "app/components/RouteEditorWorkspace.vue"
---

# Map pages: side panel and mobile bottom sheet

- Home, route page, editor and collection page use `MapSheetLayout` (slots `map`, `title`, default). From md up the panel sits beside the map; below md the map fills the screen under a bottom sheet with three positions (`data-sheet` = `collapsed` / `half` / `full`), moved by dragging its header (pointer events), by tapping it, or with the "Réduire / Agrandir le panneau" buttons. The `title` slot is the only thing shown when collapsed, and the hidden content is `inert`.
- The map stops above the collapsed sheet (attribution and scale stay visible) and never resizes when the sheet moves. Views framed on a route or place use `useMapPadding()` (`padding(base)` for `fitBounds`, `offset()` for `flyTo`) so they stay above the open sheet. Never pass `padding` to `easeTo` / `flyTo`: MapLibre would keep it for every later move.
- On the home page, the results line under the filters is `max-md:sr-only`: the sheet title shows it on phones, and the `aria-live` announcement stays.
- e2e: the phone test in `anonymous.spec.ts` drives the sheet with buttons, the keyboard and a mouse drag.
