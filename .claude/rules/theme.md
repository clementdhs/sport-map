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
- Map popups follow the surface (`--popup-bg`: `bg-default` in light mode, `bg-elevated` in dark mode). The manifest's `background_color` is the light paper.

# Theme: mode and accent color

- Visitors pick the light / dark / system mode (Nuxt UI color mode, localStorage) and an accent among the 10 `ACCENTS` (Tailwind palette names, indigo by default) in `ThemeSettings`, shown in the header's `ThemePicker` popover to visitors only and on `/settings` to signed-in users. The accent lives in the `sport-map-accent` cookie so the server renders `<html data-accent data-accent-shade>`, Nuxt UI's primary color (set on app config by `plugins/accent.ts`) and the theme-color meta without a flash. An unknown cookie value falls back to indigo: keep an accent's name once offered (the 4 of before #144 stay).
- No orange (tracks) nor red (errors, end marker) among the accents. « Ambre » is the `yellow` palette: Tailwind 4's amber 700-800 is the orange of the tracks.
- In light mode, `main.css` swaps Nuxt UI's primary 500 for the shade in `ACCENT_LIGHT_SHADES` (600, 700 or 800, through `data-accent-shade`); dark mode keeps 400. That shade is the lightest where every text pair passes WCAG AA (4.5:1), checked by `test/unit/accentContrast.test.ts` on Tailwind's OKLCH values: white on primary (buttons, active pill tabs), primary on the paper, the surface and `bg-elevated` (links, active link tabs), primary on a 10 % primary background (soft and subtle variants, the active settings section), and the same pairs in dark mode with 400 and the dark inverted text (topo 900). The cream surfaces pushed teal to 800 (#227). Soft buttons' hover (15 %) is left out: teal and pink dip just under 4.5 there. `ACCENT_COLORS` is that shade in sRGB hex (swatches, theme-color), which the test also checks: its failures give a new accent's shade and hex.
- UI color goes through `primary` / `bg-primary` / `var(--ui-primary)`, never a fixed palette, so it follows the accent. Map and data colors stay fixed: orange tracks, green start and red end markers, slope ramp. The MapTiler basemap, map popups and MapLibre's controls follow the mode (#109, `maps.md`); Plan IGN stays light.
- What can't follow a visitor's choice (PWA icons, favicon, manifest, link preview image) uses `BRAND_COLOR` (`#4f46e5`, Tailwind 3's indigo 600, slightly off the default accent's swatch), hard-coded in `public/icon.svg`, `pwa-assets.config.ts`, `nuxt.config.ts`, `server/utils/ogImage.ts` and Android's `ic_launcher_background.xml`. The logo (#193) is the m of sportmap drawn as an elevation profile, the second climb higher, in white on that square; `AppLogo.vue` and `logo()` in `ogImage.ts` repeat its path. After changing `public/icon.svg`, regenerate the icons with `npm run pwa:assets` (PWA, favicon) and `npm run android:icons` (launcher icons and launch screens; a new APK is needed).

# Sport colors, figures and headings (#108)

- Each sport has a fixed color (not the accent): a `sport-<sport type>` class (`main.css`) sets `--sport` (icons, route thumbnails), `--sport-text` and `--sport-soft` (badge text and background), 800 on 100 in light mode, 300 on a 15 % veil of 400 in dark mode (`themeContrast.test.ts`). Palette by family: road running orange, trail rose, hiking emerald, leisure cycling cyan, road cycling blue, mountain biking violet. `SportBadge`, `RouteCard` and the sport selects (`useSportItems`, icons through `ui.itemLeadingIcon`) use it; a new sport needs its class (`test/unit/sportColors.test.ts`).
- Key figures (distances, durations, D+, totals, live data) use `font-numbers tabular-nums`: Barlow Semi Condensed 500/600, latin, normal style only, downloaded at build time by `@nuxt/fonts` (`fonts` in `nuxt.config.ts`) into `/_fonts/`, precached by the service worker through the `woff2` glob. It runs narrower than the text font: figures go one size up (`text-lg` instead of `text-base`).
- Heading scale in pages and panels: page title `h1` `text-2xl font-semibold`; section `h2` `text-base font-semibold`; block captions (charts, breakdowns, legends) `text-sm font-medium`; small labels above figures `text-xs font-medium text-muted`.
