---
paths:
  - "shared/utils/theme.ts"
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

- Visitors pick the light / dark / system mode (Nuxt UI color mode, localStorage) and an accent among `ACCENTS` (indigo by default, violet, sky, green) in `ThemeSettings`, shown in the header's `ThemePicker` popover to visitors only and on `/settings` to signed-in users. The accent lives in the `sport-map-accent` cookie so the server renders `<html data-accent>`, Nuxt UI's primary color (set on app config by `plugins/accent.ts`) and the theme-color meta without a flash.
- In light mode, `main.css` swaps Nuxt UI's primary 500 for the shade in `ACCENT_LIGHT_SHADES` (600, or 700 for sky and green) so white text on buttons passes WCAG AA; dark mode keeps 400.
- UI color goes through `primary` / `bg-primary` / `var(--ui-primary)`, never a fixed palette, so it follows the accent. Map and data colors stay fixed: orange tracks, green start and red end markers, slope ramp.
- What can't follow a visitor's choice (PWA icons, favicon, manifest, link preview image) uses `BRAND_COLOR`, the default accent. After changing `public/icon.svg`, regenerate the icons with `npm run pwa:assets`.

# Sport colors, figures and headings (#108)

- Each sport has a fixed color (not the accent): a `sport-<sport type>` class (`main.css`) sets `--sport` (icons, route thumbnails), `--sport-text` and `--sport-soft` (badge text and background), 800 on 100 in light mode, 300 on a 15 % veil of 400 in dark mode (6.4:1 at least). Palette by family: road running orange, trail rose, hiking emerald, leisure cycling cyan, road cycling blue, mountain biking violet. `SportBadge`, `RouteCard` and the sport selects (`useSportItems`, icons through `ui.itemLeadingIcon`) use it; a new sport needs its class (`test/unit/sportColors.test.ts`).
- Key figures (distances, durations, D+, totals, live data) use `font-numbers tabular-nums`: Barlow Semi Condensed 500/600, latin, normal style only, downloaded at build time by `@nuxt/fonts` (`fonts` in `nuxt.config.ts`) into `/_fonts/`, precached by the service worker through the `woff2` glob. It runs narrower than the system font: figures go one size up (`text-lg` instead of `text-base`).
- Heading scale in pages and panels: page title `h1` `text-2xl font-semibold`; section `h2` `text-base font-semibold`; block captions (charts, breakdowns, legends) `text-sm font-medium`; small labels above figures `text-xs font-medium text-muted`.
