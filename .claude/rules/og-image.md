---
paths:
  - "server/api/routes/*/og.png.get.ts"
  - "server/utils/ogImage.ts"
  - "app/pages/routes/*/index.vue"
---

# Link previews

`GET /api/routes/:id/og.png` draws the track and key figures as SVG (`server/utils/ogImage.ts`) and renders it to PNG with `@resvg/resvg-js`, using the Inter fonts from `server/assets/fonts` (no map tiles: MapTiler static maps need a paid plan). It only serves public routes, whoever asks, because the image is cached publicly. The route page adds `?v=<updated_at>` so caches fetch a new image after an edit.
