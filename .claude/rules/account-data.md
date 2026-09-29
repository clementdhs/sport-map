---
paths:
  - "server/api/profile/me*"
  - "server/api/profile/me/**"
  - "server/utils/accountExport.ts"
  - "server/utils/photos.ts"
  - "app/components/AccountData.vue"
  - "app/utils/accountArchive.ts"
---

# Account data (RGPD)

- Export: `GET /api/profile/me/export` returns the archive's text files (JSON per kind of data, one GPX per route, built by `accountArchive`) and signed URLs of the photos; the browser downloads the photos and zips everything with `fflate` (`downloadAccountArchive`), since photos would exceed Vercel's ~4.5 MB response limit.
- Deletion: `DELETE /api/profile/me` checks the username typed again, empties the photo folder of each of the user's routes (storage files aren't tied to users), then deletes the auth user with the secret key (`serverSupabaseServiceRole`); everything else goes by cascade, and triggers recompute the ratings of the routes they reviewed. It needs `NUXT_SUPABASE_SECRET_KEY` in production; e2e tests and `dev:local` pass the local one.
- e2e tests delete throwaway accounts (`jetable-…@sport-map.test`), which the global setup also removes if a test failed halfway.
