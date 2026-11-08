---
paths:
  - "shared/utils/theme.ts"
  - "test/unit/accentContrast.test.ts"
  - "test/unit/themeContrast.test.ts"
  - "test/unit/contrast.ts"
  - "app/composables/useAccent.ts"
  - "app/plugins/accent.ts"
  - "app/components/ThemePicker.vue"
  - "app/components/ThemeSettings.vue"
  - "app/components/AppLogo.vue"
  - "app/assets/css/main.css"
  - "app/components/SportBadge.vue"
  - "app/components/RouteCard.vue"
  - "app/components/RouteCardSkeleton.vue"
  - "app/components/SportChips.vue"
  - "app/pages/discover.vue"
  - "server/utils/routeList.ts"
  - "app/components/SportMark.vue"
  - "app/components/DurationSign.vue"
  - "app/components/KeyFigures.vue"
  - "app/components/DoneStamp.vue"
  - "app/components/HerePlate.vue"
  - "app/components/ContourTexture.vue"
  - "app/utils/keyFigures.ts"
  - "test/nuxt/signage.test.ts"
  - "app/composables/useSportItems.ts"
  - "app/app.config.ts"
  - "public/icon.svg"
  - "pwa-assets.config.ts"
  - "scripts/android-icons.mjs"
---

# Topo design tokens (#226, #227)

The visual direction is "Topo + balisage" (mockups on the Claude Design canvas linked from #226). Tokens only live in `main.css`, `app.config.ts` and `nuxt.config.ts`; components keep using Nuxt UI's semantic classes.

- **Neutrals**: Nuxt UI's `neutral` is the custom `topo` palette (`@theme static` in `main.css`, read at runtime by Nuxt UI): 50 `#fbf8f1` light surface, 100 `#f3eee3` light paper, 200 `#e3d9c6` sand border, 600 `#5b6158` light secondary text, 900 `#1d2520` ink, 950 `#141815` dark paper. `main.css` maps Nuxt UI's `--ui-text-*`, `--ui-bg-*` and `--ui-border-*` onto it in `:root` (light) and `.dark` ("nuit topo": surface `#1b201c`, cream text 100/200, secondary 400), with a few raw tones between two steps (light muted `#efe9dc`, elevated `#ebe4d3`, accented border `#d9cdb6`; dark muted `#232923`, elevated `#262c27`).
- **Paper and surfaces** (cream everywhere, Clem's choice): `body` and `bg-paper` (`--ui-bg-paper`) are the page; `bg-default` (`--ui-bg`) is the lighter surface of cards, sheets, bars, menus, modals and inputs. Hover and soft tones are `bg-elevated` / `bg-muted`, darker than the surface in light mode.
- **Contrast** (`test/unit/themeContrast.test.ts`, helpers and the main.css reader in `test/unit/contrast.ts`): muted, toned, default and highlighted text 4.5:1 on paper, surface, muted and elevated in light, dark and both outdoor modes; `dimmed` (placeholders, leading icons) 3:1, 4.5:1 outdoors; outdoor never weaker than the normal mode; sport icons 3:1 and sport badges 4.5:1 on every surface. A new tone or background goes through that test.
- **Fonts** (`@nuxt/fonts`, latin, normal style only, ~125 kB of woff2 in the precache): Barlow 400–700 for text (`--font-sans`), Barlow Condensed 600/700 for `h1`–`h3` (`--font-display`, base layer in `main.css`; `font-display` class elsewhere), Barlow Semi Condensed 500/600 for figures (`font-numbers`). Italics are synthesized.
- **Radii**: `--ui-radius: 0.5rem`, so cards `rounded-lg` 16px, buttons, inputs and thumbnails `rounded-md` 12px (one radius for the field groups that join an input and a button), small marks `rounded-sm` 8px.
- **Shadows**: Tailwind's scale redefined in `@theme`, tinted with the ink (`rgb(29 37 32 / 0.08)`), lighter than the default black.
- Map popups follow the surface (`--popup-bg`: `bg-default` in light mode, `bg-elevated` in dark mode), MapLibre's control groups the surface with an accented border (#230, map block of `main.css`; the topo basemap itself is in `maps.md`). The manifest's `background_color` is the light paper.

# Trail signage components (#229)

The signs of the direction, shared by every screen (looks from the canvas's "Final" Carte / Découvrir / Fiche boards). Their colors are the signage tokens of `main.css` (`:root` and `.dark`, checked by `themeContrast.test.ts`): `--sign` yellow (`#f4c430`, dark `#e3b53c`) with `--sign-text` ink in both modes and an ink `--sign-edge` (invisible on the dark paper, where the yellow itself stands out), `--mark-top` / `--mark-edge` (white ringed with ink; cream in dark mode), `--stamp` rust (`#b8461f`, dark `#e8875c`), `--contour`. The yellow is never the only information: each one also writes its text, and `test/nuxt/signage.test.ts` covers the empty cases.

- `SportMark`: the sport as a two-bar blaze (white ringed with ink, then `--sport`), `aria-hidden`, always next to the sport's name. `SportBadge` leads with it instead of the sport's icon (route cards, route page); the sport selects keep their icons until their screens are redone.
- `DurationSign`: `minutes` (nothing when `null`) on a yellow arrow (`clip-path`, an outer ink shape 1.5px larger for the outline), `size` `sm` (cards) or `md`; screen readers hear "Durée estimée : 2 h 35" (`signage.duration`). No `~`: the label says it is an estimate. Route cards show it in place of their clock badge.
- `KeyFigures`: the cartouche, a `<dl>` with one ruled column per `KeyFigure` (`app/utils/keyFigures.ts`: label, value, unit set apart with `splitUnit`, `highlight` on the yellow, `hint` in an info tooltip). Labels wrap and units go under the figure rather than truncating (4 columns at 360 px with outdoor readability). The route page's distance / duration / D+ / D− row uses it, the duration highlighted with the pace tooltip (`useDurationMethod`, shared with `DurationEstimate`).
- `DoneStamp`: "Fait ×N" tilted rust stamp from `count`, nothing at 0, "Fait 3 fois" / "Fait une fois" for screen readers. The parent places it (`absolute`); its inner ring is cut out of `--stamp-bg` (default the surface `--ui-bg`; set it to the paper when it lies on the page). On the route page, N is the member's outings there (`is_mine`), a route only marked as done counting once. On route cards, N is `RouteListItem.done_count` (#232, same rule, computed in SQL by `route_done_count`).
- `HerePlate`: "Vous êtes ici · place · alt. 22 m" under a yellow band, altitude left out when unknown. On /discover (#232) the place is `placeAt` (`app/utils/startArea.ts`): the member's start area (when it has a name), while the map's centre is inside it; no plate elsewhere, nor for a place picked in the search box (where the map looks, not where the member is) (no reverse geocoding: MapTiler's quota), and no altitude yet. The list's heading then says "Près de chez toi" (start area) or "Dans cette zone".
- `ContourTexture`: faint contour lines (`--contour`) at the top of a `relative` header, `aria-hidden`, the header's content `relative` above it. Used by /discover's header.
- `SportChips` (#232): a one-choice filter as pill buttons (`aria-pressed`, in a labelled `role="group"`), led by `SportMark`, the chosen one in ink (`bg-inverted`), scrolled sideways; `toggle` sends a click on the chosen chip back to that value. Home: "Tous" + the six sports with short names (`sportChips.*`), the member's default sport (#148) first, bound to the search's sport (the filters' select shows the same value). /discover: the OSM kinds.

# Route cards (#232)

`RouteCard` from the canvas's "Final — Découvrir" board: a 72 px thumbnail (`bg-elevated`, three `--contour` lines, the outline in `--map-track` over a surface casing, an ink start dot; the sport's icon when the track can't be drawn), then the sport in small capitals in `--sport-text` with its mark and "· Boucle", the name in Barlow Condensed (2 lines), the quote in italics, distance and D+ in `font-numbers` with their units muted and the `DurationSign` on the right, then rating and owner in small text. The card is the surface on the paper, sand border, `border-primary` when highlighted from the map. `DoneStamp` hangs over its top right corner (`-top-2.5`), so lists keep 14 px between cards and the sport and name lines keep `pe-12` for it.

- **Quote**: `RouteListItem.quote`, the latest review with a comment that isn't hidden (`route_quote` in SQL, cut to 200 characters, author's display name else username), none without one (Clem's choice: no fallback on the description). `--sport-text` written straight on the surfaces is checked at 4.5:1 too.
- Both come with the card's data, never one request per card: computed fields `route_quote` / `route_done_count` in `ROUTE_LIST_COLUMNS` (`server/utils/routeList.ts`, `toRouteListItem` / `toRouteQuote`) and the `quote` / `done_count` columns of `search_routes`. Endpoints building `RouteListItem` by hand must fill both.

# Theme: mode and accent color

- Visitors pick the light / dark / system mode (Nuxt UI color mode, localStorage) and an accent among the 5 terrain `ACCENTS` (#228: forest green by default, ochre, lake blue, heather, slate) in `ThemeSettings`, shown in the header's `ThemePicker` popover to visitors only and on `/settings` (Apparence) to signed-in users. The accent lives in the `sport-map-accent` cookie (per device, not an account preference nor in the export) so the server renders `<html data-accent>`, Nuxt UI's primary color (set on app config by `plugins/accent.ts`) and the theme-color meta without a flash. The ten Tailwind accents offered before #228 stay readable: `toAccent` maps them through `LEGACY_ACCENTS` to the nearest terrain accent (OKLab distance between light shades, checked by `test/unit/theme.test.ts`); anything else falls back to forest green. Keep an accent's name once offered (add it to `LEGACY_ACCENTS` when removing it).
- No orange nor rust (tracks, `#B8461F` in the mockups), no red (errors, end marker) among the accents: ochre is the earthy one, browner than the tracks.
- Each accent is a full palette in `main.css` (`@theme static`, `--color-<accent>-50…950`, Nuxt UI reads it at runtime; `slate` replaces Tailwind's own, unused elsewhere) whose **600 is the light-mode accent** (white text on it) and **400 the dark-mode accent** (ink text on it, `--ui-text-inverted`); the other shades follow the hue in OKLCH. `main.css` sets light-mode primary to 600, dark mode keeps Nuxt UI's 400. `test/unit/accentContrast.test.ts` reads the palettes from `main.css` and checks every text pair at WCAG AA (4.5:1) in both modes: inverted text on primary (buttons, active pill tabs), primary on the paper, the surface and `bg-elevated` (links, active link tabs), primary on a 10 % and a 15 % primary veil (soft variants and their hover, the active settings section). `ACCENT_COLORS` repeats each palette's 600 / 400 in hex (swatches, which switch with `dark:`, and the theme-color meta, which follows the mode); the test checks they match.
- UI color goes through `primary` / `bg-primary` / `var(--ui-primary)`, never a fixed palette, so it follows the accent. Map and data colors stay fixed: rust tracks (light and dark shades, #230), yellow start, ink waypoints and red end squares, slope ramp. The MapTiler basemap, map popups and MapLibre's controls follow the mode (#109, `maps.md`); Plan IGN stays light.
- What can't follow a visitor's choice (PWA icons, favicon, manifest, link preview image) uses `BRAND_COLOR` (`#4f46e5`, Tailwind 3's indigo 600, the default accent before #228; still to align with the redesign), hard-coded in `public/icon.svg`, `pwa-assets.config.ts`, `nuxt.config.ts`, `server/utils/ogImage.ts` and Android's `ic_launcher_background.xml`. The logo (#193) is the m of sportmap drawn as an elevation profile, the second climb higher, in white on that square; `AppLogo.vue` and `logo()` in `ogImage.ts` repeat its path. After changing `public/icon.svg`, regenerate the icons with `npm run pwa:assets` (PWA, favicon) and `npm run android:icons` (launcher icons and launch screens; a new APK is needed).

# Sport colors, figures and headings (#108)

- Each sport has a fixed color (not the accent): a `sport-<sport type>` class (`main.css`) sets `--sport` (icons, route thumbnails), `--sport-text` and `--sport-soft` (badge text and background), 800 on 100 in light mode, 300 on a 15 % veil of 400 in dark mode (`themeContrast.test.ts`). Palette by family: road running orange, trail rose, hiking emerald, leisure cycling cyan, road cycling blue, mountain biking violet. `SportBadge` (with its `SportMark`), `RouteCard` and the sport selects (`useSportItems`, icons through `ui.itemLeadingIcon`) use it; a new sport needs its class (`test/unit/sportColors.test.ts`).
- Key figures (distances, durations, D+, totals, live data) use `font-numbers tabular-nums`: Barlow Semi Condensed 500/600, latin, normal style only, downloaded at build time by `@nuxt/fonts` (`fonts` in `nuxt.config.ts`) into `/_fonts/`, precached by the service worker through the `woff2` glob. It runs narrower than the text font: figures go one size up (`text-lg` instead of `text-base`).
- Heading scale in pages and panels: page title `h1` `text-2xl font-semibold`; section `h2` `text-base font-semibold`; block captions (charts, breakdowns, legends) `text-sm font-medium`; small labels above figures `text-xs font-medium text-muted`.
