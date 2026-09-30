---
paths:
  - "shared/utils/theme.ts"
  - "app/composables/useAccent.ts"
  - "app/plugins/accent.ts"
  - "app/components/ThemePicker.vue"
  - "app/components/ThemeSettings.vue"
  - "app/components/AppLogo.vue"
  - "app/assets/css/main.css"
  - "app/app.config.ts"
  - "public/icon.svg"
  - "pwa-assets.config.ts"
---

# Theme: mode and accent color

- Visitors pick the light / dark / system mode (Nuxt UI color mode, localStorage) and an accent among `ACCENTS` (indigo by default, violet, sky, green) in `ThemeSettings`, shown in the header's `ThemePicker` popover (for visitors too) and on `/settings`. The accent lives in the `sport-map-accent` cookie so the server renders `<html data-accent>`, Nuxt UI's primary color (set on app config by `plugins/accent.ts`) and the theme-color meta without a flash.
- In light mode, `main.css` swaps Nuxt UI's primary 500 for the shade in `ACCENT_LIGHT_SHADES` (600, or 700 for sky and green) so white text on buttons passes WCAG AA; dark mode keeps 400.
- UI color goes through `primary` / `bg-primary` / `var(--ui-primary)`, never a fixed palette, so it follows the accent. Map and data colors stay fixed: orange tracks, green start and red end markers, slope ramp.
- What can't follow a visitor's choice (PWA icons, favicon, manifest, link preview image) uses `BRAND_COLOR`, the default accent. After changing `public/icon.svg`, regenerate the icons with `npm run pwa:assets`.
