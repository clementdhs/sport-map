---
paths:
  - "app/utils/outingImport.ts"
  - "app/composables/useOutingImport.ts"
  - "app/components/OutingImportButton.vue"
  - "app/components/CoachImport.vue"
  - "server/api/outings/import.post.ts"
  - "server/utils/saveRecording.ts"
  - "test/unit/outingImport.test.ts"
  - "test/fixtures/outings/**"
  - "test/e2e/specs/outing-import.spec.ts"
---

# Importing outings (#268)

- **Outings, not routes**: a GPX, FIT or TCX file recorded by a watch or another app becomes an outing exactly like one saved from `/record` (`saveRecording`, shared with `POST /api/recordings`): a private route `source: 'recorded'` of its track, a `completed` activity and a `route_outings` row with its points (`outingTrack`). So it counts in the profile statistics, the records and the coach's form (`coach.md`) with nothing of its own. A GPX of a route drawn somewhere (no times) is refused and pointed to the editor's import (`gpx-import.md`).
- Read in the browser (`app/utils/outingImport.ts`, pure and unit-tested on the small files of `test/fixtures/outings/`): GPX and TCX through `DOMParser`, elements found by local name whatever the namespace prefix; FIT through **fit-file-parser** (MIT, no dependency but `buffer`, ~62 kB gzipped, nearly all FIT profile), loaded with a dynamic `import()` only when a FIT file is read. Garmin's own `@garmin/fitsdk` weighs the same under Garmin's FIT licence, not an open-source one. The test FIT file is built by the library's `FitEncoder` (`test/fixtures/outings/fit.ts`, also used by the e2e test) rather than kept as a binary.
- Points go through the GPS recording's rules (`MIN_STEP_M`, `MAX_SPEED_MS`, `MIN_MOVING_SPEED_MS` of `recorder.ts`, in a mutable loop: `addFix` copies the array at every point) for the distance, the moving time per point and the route's track. Totals the file gives win: FIT session (`start_time`, elapsed, timer, distance; several sessions summed), TCX laps (timer time and distance summed, `StartTime`). The timer time stands for the moving time. Elapsed time runs to the file's last point, even a stop at the finish.
- Altitudes: the file's (Clem's default choice in #268), when every kept point has one; out of −500…9,000 m they are a FIT "invalid" value and count as none. A file without any gets them from the IGN / Open-Meteo on the server (`trackElevations`, like `/api/elevations`), so its gain counts in the coach's load; without an answer it has none.
- Sport: `importedSport` maps the words of watches and apps (GPX `<type>`, TCX `Sport`, FIT sport + sub-sport: trail, mountain, road); anything else takes the member's default sport, else hiking. Name: the GPX track's, else "Sortie du {date}" like `/record`.
- **Duplicates**: `POST /api/outings/import` answers `{ route_id, duplicate: true }` without saving when the member already has an outing starting within `IMPORT_SAME_START_S` (60 s) on any route, so a file imported twice, or an outing recorded by both the app and a watch, counts once. Files are sent one at a time (`useOutingImport`), so two copies in the same batch are caught too.
- UI: `OutingImportButton` (hidden `<input type="file" multiple>`, UButton props through `$attrs`) shows the progress, then the summary ("18 sorties importées, 2 déjà présentes, 1 fichier non importé") and each failed file with its reason, and calls `refreshNuxtData()` once something was imported. On the profile's header; on `/coach` in the dashed `CoachImport` block under the start card, only while the coach is learning (mockup 5).
- Left out: complete Strava or Garmin account archives (zip of hundreds of files, `activities.csv`): a follow-up issue.
- e2e (`outing-import.spec.ts`): files built in the test with New Zealand tracks and starts at a second no other spec uses, picked through the button's `filechooser`; each test deletes its routes, found by start time in `/api/profile/me`.
