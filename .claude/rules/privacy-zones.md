---
paths:
  - "shared/utils/privacyZones.ts"
  - "server/utils/privacyZones.ts"
  - "server/utils/privacyZoneList.ts"
  - "server/utils/routeRow.ts"
  - "server/utils/routeList.ts"
  - "server/api/profile/me/privacy-zones/**"
  - "server/api/routes/**"
  - "server/api/recordings.post.ts"
  - "server/api/profile/me/export.get.ts"
  - "app/components/PrivacyZoneSettings.vue"
  - "supabase/migrations/*privacy*"
  - "test/e2e/specs/privacy-zones.spec.ts"
---

# Privacy zones (#254)

- Members place up to 5 zones (point + 200, 500 or 1,000 m) in the settings (`#privacy`, `PrivacyZoneSettings`). A route or GPS outing that **starts or ends** in one is shown to the rest of the team from where it leaves the zone to where it enters it again (`trackMask`, cut on the circle, interpolated); a passage through a zone mid-track stays visible, so tracks stay in one piece (Clem's choices, 2026-11-08). A track entirely inside is hidden: the route is the owner's only (`routes.privacy_hidden`, in the routes select policy), the outing keeps no visible points.
- The cutting circle is moved from the point placed by up to 40 % of the radius (`offsetCenter`, `mask_lng`/`mask_lat`, drawn once at creation with `crypto.getRandomValues`), so crossing several routes' cut points leads to the moved centre, never to the home. The settings show the zone as placed.
- **Storage: `routes` and `route_outings.track` hold what the team sees**, so every list, search, computed field, policy and the link preview (service role) only ever read the cut track, and a member calling PostgREST directly gets nothing more. The owner's full data of a cut route is in `route_originals` (geometry, elevations, editor state, POIs, way info, gains), of a cut outing in `outing_originals`; both owner-only (RLS). Masked routes' team row has no `editor_state`, no POI inside a zone, sliced elevations and way ranges, and the stats of the visible part (`distance_m` is generated from the cut `geom`; Clem's choice).
- Owner overlay: the route detail, GPX, outing detail, export and best efforts embed `original:route_originals(…)` / `outing_originals` (null for anyone else) and use it first; card lists add its distance, gain and outline (`ROUTE_LIST_COLUMNS`, `routeOriginalFigures` for `search_routes`). The home map marker stays the visible start.
- Writes: `POST/PUT /api/routes`, `/api/recordings` and outings cut with the caller's zones (`maskedRouteColumns`, `maskedOutingColumns`); full data is written before the routes row on updates, and a new route whose full data can't be saved is deleted. Adding or removing a zone recuts every route and outing of the member (`applyPrivacyZones`, by chunks); `applied: false` (some failed) shows a "Réessayer" calling `POST /api/profile/me/privacy-zones/apply`.
- OSM places saved by the owner of a cut route are kept only within 200 m of the visible track. Photos carry no position (EXIF dropped on upload). Live position sharing is out of scope (the member starts it knowingly).
- e2e: `privacy-zones.spec.ts` puts its zone at `FAR_AWAY` and removes every zone of the account in `finally`, since zones recut all the account's routes (the worker's other specs share it).
