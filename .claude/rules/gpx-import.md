---
paths:
  - "app/utils/gpx.ts"
  - "app/components/RouteEditorWorkspace.vue"
  - "test/unit/gpx.test.ts"
---

# GPX import in the editor

- Two entry points, one path: the "Importer un fichier GPX" button ("Déjà un tracé ?" at the bottom of the panel in both modes, #215; hidden `<input type="file">`) and a file dropped on the editor map (`[data-gpx-dropzone]`, #68). Both go through `importGpx(file)` in `RouteEditorWorkspace.vue`: confirmation when a track exists, `readGpxFile`, `editor.importTrack`, toast.
- The drop zone only reacts to drags carrying files (`dataTransfer.types` includes `Files`) and counts `dragenter` / `dragleave`, which fire for every child element crossed; the overlay is `pointer-events-none` so it never swallows the drop. Several files or a name not ending in `.gpx` are refused with a toast before reading.
- `readGpxFile` errors are `LocalizedError` keys (`errors.gpx*`), translated by `useErrorMessage`.
- A GPX without `<ele>` gets its elevations from the IGN (Open-Meteo outside France) after the import (#71, `editor.fetchElevations`, see `osm-discover.md`).
- e2e: Playwright can't drag files from the OS. Build a `DataTransfer` with `page.evaluateHandle`, then `dispatchEvent('dragenter' | 'drop', { dataTransfer })` on the drop zone (`specs/editor.spec.ts`). Toast texts exist twice in the page (toast + live region): use `.first()`.
