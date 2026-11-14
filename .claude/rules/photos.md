---
paths:
  - "server/api/routes/*/photos*"
  - "server/api/routes/*/photos/**"
  - "server/utils/photos.ts"
  - "app/utils/photos.ts"
  - "app/components/route/RoutePhotos.vue"
---

# Route photos

The owner uploads them from the route page. The browser resizes and re-encodes them (`compressPhoto`, WebP or JPEG, EXIF dropped), `POST /api/routes/:id/photos` checks the real type and the per-route limit, stores the file in the private `route-photos` bucket under `<route_id>/` and adds a `route_photos` row. Rows and files follow the route's visibility (RLS and storage policies); pages get signed URLs (1 h). Deleting a route removes its files first (the cascade only deletes rows). Profile photos (`avatars.md`) share the encoding (`compressAvatar`) and `signPhotos` (export), not the rest.
