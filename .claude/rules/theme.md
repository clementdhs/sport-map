---
paths:
  - "shared/utils/theme.ts"
  - "test/unit/accentContrast.test.ts"
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
---

# Theme: mode and accent color

- Visitors pick the light / dark / system mode (Nuxt UI color mode, localStorage) and an accent among the 10 `ACCENTS` (Tailwind palette names, indigo by default) in `ThemeSettings`, shown in the header's `ThemePicker` popover to visitors only and on `/settings` to signed-in users. The accent lives in the `sport-map-accent` cookie so the server renders `<html data-accent data-accent-shade>`, Nuxt UI's primary color (set on app config by `plugins/accent.ts`) and the theme-color meta without a flash. An unknown cookie value falls back to indigo: keep an accent's name once offered (the 4 of before #144 stay).
- No orange (tracks) nor red (errors, end marker) among the accents. « Ambre » is the `yellow` palette: Tailwind 4's amber 700-800 is the orange of the tracks.
- In light mode, `main.css` swaps Nuxt UI's primary 500 for the shade in `ACCENT_LIGHT_SHADES` (600, 700 or 800, through `data-accent-shade`); dark mode keeps 400. That shade is the lightest where every text pair passes WCAG AA (4.5:1), checked by `test/unit/accentContrast.test.ts` on Tailwind's OKLCH values: white on primary (buttons, active pill tabs), primary on the background and on `bg-elevated` (links, active link tabs), primary on a 10 % primary background (soft and subtle variants, the active settings section), and the same pairs in dark mode with 400 and the neutral 900 as inverted text. Soft buttons' hover (15 %) is left out: teal and pink dip just under 4.5 there. `ACCENT_COLORS` is that shade in sRGB hex (swatches, theme-color), which the test also checks: its failures give a new accent's shade and hex.
- UI color goes through `primary` / `bg-primary` / `var(--ui-primary)`, never a fixed palette, so it follows the accent. Map and data colors stay fixed: orange tracks, green start and red end markers, slope ramp. The MapTiler basemap, map popups and MapLibre's controls follow the mode (#109, `maps.md`); Plan IGN stays light.
- What can't follow a visitor's choice (PWA icons, favicon, manifest, link preview image) uses `BRAND_COLOR` (`#4f46e5`, Tailwind 3's indigo 600, slightly off the default accent's swatch), hard-coded in `public/icon.svg`, `pwa-assets.config.ts`, `nuxt.config.ts` and `server/utils/ogImage.ts`. After changing `public/icon.svg`, regenerate the icons with `npm run pwa:assets`.

# Sport colors, figures and headings (#108)

- Each sport has a fixed color (not the accent): a `sport-<sport type>` class (`main.css`) sets `--sport` (icons, route thumbnails), `--sport-text` and `--sport-soft` (badge text and background), 800 on 100 in light mode, 300 on a 15 % veil of 400 in dark mode (6.4:1 at least). Palette by family: road running orange, trail rose, hiking emerald, leisure cycling cyan, road cycling blue, mountain biking violet. `SportBadge`, `RouteCard` and the sport selects (`useSportItems`, icons through `ui.itemLeadingIcon`) use it; a new sport needs its class (`test/unit/sportColors.test.ts`).
- Key figures (distances, durations, D+, totals, live data) use `font-numbers tabular-nums`: Barlow Semi Condensed 500/600, latin, normal style only, downloaded at build time by `@nuxt/fonts` (`fonts` in `nuxt.config.ts`) into `/_fonts/`, precached by the service worker through the `woff2` glob. It runs narrower than the system font: figures go one size up (`text-lg` instead of `text-base`).
- Heading scale in pages and panels: page title `h1` `text-2xl font-semibold`; section `h2` `text-base font-semibold`; block captions (charts, breakdowns, legends) `text-sm font-medium`; small labels above figures `text-xs font-medium text-muted`.
