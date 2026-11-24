# BirdTally

An offline field notebook for bird photographers. You log birds in a few taps with no signal, and BirdTally turns your birding sessions into **eBird import files** that you upload yourself.

> BirdTally is not affiliated with the Cornell Lab of Ornithology. It never signs in to eBird or Merlin and never submits anything on your behalf. eBird has no public submission API (checked 23 Nov 2026; see [docs/01-feasibility-and-architecture.md](docs/01-feasibility-and-architecture.md)).

## Status: release 1, the field notebook

| Works now | Not yet |
|---|---|
| Downloading the eBird taxonomy in several name languages (English, te reo Māori, …) for offline search | Mac photo import from Sony ARW files (release 2) |
| Adding a bird in ≤ 3 taps: tap a recent species, or type a name or code and tap the match | Importing eBird's "Download My Data" history into the archive (release 2) |
| One GPS fix per entry, with no continuous tracking | Native iPhone build through TestFlight (next step) |
| Voice notes, phone photos, "Unknown bird" entries waiting for an ID | App lock: none for now. Add a Face ID / fingerprint lock later only if users ask for it (no PIN) |
| Turning Birding mode on and off to record real effort, or having birding sessions suggested afterwards (split on a new date, a gap over 90 min, or a move over 2 km) | |
| Checklist review: protocol, the completeness question, count overrides, split and merge, validation | |
| eBird Record Format CSV export with a preview, ≤ 1 MB files, an export history and a duplicate-file warning | |
| Submission tracking: Ready → Exported → Submitted (with the S-number), plus an edited-after-export warning | |
| Searchable notebook/archive; backup and trip files merged across devices, with conflicts kept for review | |
| Dark, light ("bright sun") and automatic themes; km or miles | |
| Optional unusual-bird warning: with your own eBird API key and a trip region code (NZ or NZ-AUK, chosen from eBird's country and area lists or typed), a bird never reported in the region asks "Record anyway?", is flagged, and reminds you at review to add a description or photo. Works offline once the lists are downloaded | GPS cross-check: a notice on Today and in checklist review when a GPS fix is outside every region of the trip, using each region's bounding box downloaded with its list, so it works offline ([design](docs/superpowers/specs/2026-11-24-gps-cross-check-design.md)) | Exact region borders: a bounding box is a rectangle, so it catches the wrong country or a distant region, not a neighbouring one |

## Running it

Requires Node 22.12 or later.

```bash
npm install
```

Run the tests: unit, storage and end-to-end tests, plus property tests that merge hundreds of random two-phone edit histories.

```bash
npm test
```

Start a development server at http://localhost:5173:

```bash
npm run dev
```

Build the offline-capable PWA into `dist/`:

```bash
npm run build
```

Serve the built app locally (the service worker works here):

```bash
npm run preview
```

### Putting it on your phone

A PWA has to be served over HTTPS before a phone will install it. Any static host works, since `dist/` is plain files:

- GitHub Pages
- Cloudflare Pages
- Netlify

Open the URL on the phone once while online, then:

- **iPhone or iPad:** in Safari, tap Share → **Add to Home Screen**. Storage for home-screen apps is protected far better than storage for a Safari tab.
- **Android:** in Chrome, tap ⋮ → **Install app**.

After that, BirdTally opens and works with no connection.

## Project layout

```
src/core/      pure TypeScript rules, no browser APIs (shared by every platform)
  types.ts       data model: Sighting is the permanent record; Outing (a birding session) → checklist
  taxonomy.ts    eBird taxonomy CSV parser, multi-language search
  outings.ts     birding-session suggestions (date / gap / distance), with reasons
  checklist.ts   species lines (no silent summing), eBird validation rules
  ebirdCsv.ts    eBird Record Format writer (19 columns, no header, ≤1 MB files)
  merge.ts       trip/backup file format and conflict-aware merge
  records.ts     ids and edit history used for merging
src/db.ts      IndexedDB schema (Dexie)
src/store/     every user action is one atomic local write (settings, sightings, outings, backup, eBird API)
src/ui/        React screens: Today, Notebook, Checklists, Setup
tests/         unit tests + an end-to-end test through the real storage layer
docs/          feasibility report, requirements, user guide
```

## Data and privacy

- **Where your data lives.** Everything stays on the device, in IndexedDB. BirdTally connects to the network only for two optional things:
  - downloading the taxonomy from `api.ebird.org` (no key needed)
  - your own eBird API key's regional species list, if you add a key
- **Backup and trip-file format.** One open JSON file: `format: "birdtally"`, `formatVersion: 2` (version 1 files still import). A backup holds every trip, birding session and sighting; a trip file (Setup, with a trip active) holds only that trip's, with its media and none of this phone's export history. Media is stored as base64, plus `conflicts`: clashes still waiting for your review, so they survive a restore. Each record carries `updatedAt`, `deviceId` and an edit `history`, so merging two phones' files keeps both versions when they clash, including a delete on one phone against an edit on the other, instead of overwriting one. Every record in an imported file is checked first; a damaged file is refused and nothing from it is stored.
- **Locations.** Coordinates are exact, and nothing is ever published automatically.

## Support, privacy and licence

- Support: https://clicksbyg.com/birdtally/support/ (issues: https://github.com/jsganesh/BirdTally/issues)
- Privacy policy: https://clicksbyg.com/birdtally/privacy/
- Licence: [MIT](LICENSE)
