# BirdTally

Offline field notebook for bird photographers. Installable PWA: log birds with no signal, then export eBird Record Format CSV files that the user uploads to eBird themselves. Release 1 (version 0.1.0). Not affiliated with the Cornell Lab of Ornithology.

## Commands
Node 22.12 or later.
```sh
npm ci            # install (package versions are pinned exactly: .npmrc save-exact=true)
npm test          # vitest run: unit, storage, end-to-end and property tests
npm run typecheck # tsc -b
npm run dev       # Vite dev server on 127.0.0.1 (port 5173)
npm run build     # tsc -b && vite build, into dist/
npm run preview   # serves dist/ on 127.0.0.1; use this to test the service worker (port 4173)
```
`.claude/launch.json` defines `birdtally` (preview, 4173) and `birdtally-dev` (dev, 5173).

## Deploy
Pushing to `main` runs `.github/workflows/pages.yml`: `npm ci`, `npm test`, `npm run build`, then publishes `dist/` to GitHub Pages. Failing tests block the deploy.

## Stack
React 19, TypeScript 7, Vite 8, Dexie (IndexedDB), vite-plugin-pwa, Vitest 5 with fake-indexeddb. No backend.

## Layout
```
src/core/    pure TypeScript rules, no browser APIs: types, taxonomy, outings, checklist, ebirdCsv, merge, records, region, validate, geotime, clearing, hints
src/db.ts    Dexie schema
src/store/   every user action is one atomic local write (settings, sightings, outings, backup, conflicts, ebirdApi)
src/ui/      React screens: Today, Notebook, Checklists, Setup, and dialogs
tests/       one *.test.ts per area, plus e2e.test.ts through the real storage layer
docs/        01-feasibility-and-architecture.md, 02-requirements.md, USER-GUIDE.md, superpowers/specs/
```

## Constraints
- Keep `src/core/` free of browser APIs so it can be reused on other platforms.
- Data stays on the device in IndexedDB. The only network calls are the eBird taxonomy download (`api.ebird.org`, no key) and, when the user adds their own key, the regional species list.
- The built app sets a Content Security Policy through a `<meta>` tag (`POLICY` in `vite.config.ts`, build only). `connect-src` allows only `'self'` and `https://api.ebird.org`. A new network host needs a change there.
- eBird has no public submission API. The app never signs in to eBird or Merlin and never submits for the user. A file is "Ready", then "Exported", then "Submitted" only when the user records the S-number.
- eBird CSV export: 19 columns, no header row, at most 1 MB per file, no double quotes and no line breaks in fields.
- Backup and trip file: JSON with `format: "birdtally"`, `formatVersion: 2`. Version 1 files must keep importing. Each record carries `updatedAt`, `deviceId` and an edit `history`. Merging keeps both versions on a clash. An imported file is validated first, and a damaged file stores nothing.
- Deleted entries stay restorable until the user clears them. Clearing keeps a blank "deleted" mark so merges and old backups cannot bring them back.
- Never store or commit the user's eBird API key. It lives only on the device.
- A species line is never silently summed (`checklist.ts`).

## Docs
- `docs/01-feasibility-and-architecture.md`: what eBird allows, with sources. It calls the app "Field Ledger", a working name.
- `docs/02-requirements.md`, `docs/USER-GUIDE.md`.
- `docs/superpowers/specs/`: design specs for the GPS cross-check and the unusual-bird warning.
- `SECURITY.md`: vulnerability reporting.
