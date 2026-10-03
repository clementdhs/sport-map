---
paths:
  - "server/api/routes/*/og.png.get.ts"
  - "server/utils/ogImage.ts"
  - "app/pages/routes/*/index.vue"
  - "app/pages/login.vue"
---

# Link previews

`GET /api/routes/:id/og.png` draws the track and key figures as SVG (`server/utils/ogImage.ts`) and renders it to PNG with `@resvg/resvg-js`, using the Inter fonts from `server/assets/fonts` (no map tiles: MapTiler static maps need a paid plan). It only serves routes visible to the family (`is_public`), whoever asks, because the image is cached publicly: it is the one API route open without a session, and reads through the service role since bots have none. The route page adds `?v=<updated_at>` so caches fetch a new image after an edit; bots never see it (they are sent to `/login`, which links the image without `?v=`, see `family-access.md`).
