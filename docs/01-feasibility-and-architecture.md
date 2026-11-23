# Field Ledger — feasibility report and proposed architecture

*Working name for the app. Researched 23 Nov 2026. Each claim links to the source it rests on.*

---

## Part A — Feasibility report

### What I checked, and how

| Source | Result |
|---|---|
| eBird API 2.0 docs (Postman) — [documenter.getpostman.com/view/664302/S1ENwy59](https://documenter.getpostman.com/view/664302/S1ENwy59) | Read the full endpoint list (26 endpoints). **All 26 are `GET` requests.** None submits checklists or uploads media. |
| Taxonomy endpoint, called live from here | `GET https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=csv` worked **without an API key** (HTTP 200). `GET /v2/ref/taxonomy/versions` reports **`authorityVer 2026.0` as the latest**. |
| Spreadsheet import help — [support.ebird.org/…/48000907878](https://support.ebird.org/support/solutions/articles/48000907878) (updated 28 Mar 2025) | Import rules, the 1 MB limit, date and time formats, protocols. |
| Appendix A "eBird Data Fields" PDF, linked from that article | Column definitions and maximum field lengths (read in full). |
| Protocols — [48000950859](https://support.ebird.org/en/support/solutions/articles/48000950859); Rules & best practices — [48000795623](https://support.ebird.org/support/solutions/articles/48000795623) | Protocol definitions, plus "single calendar date" and "single map location" rules. |
| Media — [Upload FAQ 48000960529](https://support.ebird.org/en/support/solutions/articles/48000960529-ebird-media-upload-faq); [Adding media 48000825713](https://support.ebird.org/support/solutions/articles/48000825713) | Photo routes and limits; media must come from the same date and location as the checklist. |
| Merlin saves — [48001144489](https://support.ebird.org/en/support/solutions/articles/48001144489) | How Merlin saves sightings, and whether it exports them. |
| eBird API Terms — [birds.cornell.edu/home/ebird-api-terms-of-use](https://www.birds.cornell.edu/home/ebird-api-terms-of-use/) | **The page refused automated access (HTTP 403).** I have only the quoted excerpts from search results: no commercial use without written permission, and API keys may not be shared. You should read the full terms yourself before requesting a key. |

### 1. Features you can build with documented, supported interfaces

| Feature | Supported route |
|---|---|
| **Offline taxonomy** with a recorded version, common and scientific names, banding codes, family, category (species, spuh, slash, ISSF…) and `REPORT_AS` | `/v2/ref/taxonomy/ebird?fmt=csv&version=…&locale=…` plus `/v2/ref/taxonomy/versions`. Download once before a trip; the app stores it locally. Compare two versions to detect renamed or removed codes. |
| **eBird-format CSV export** | **eBird Record Format**: 19 columns, no header row, `.csv` only, **≤ 1 MB per file**, MM/DD/YYYY dates, 24-hour or 12-hour start times, duration in minutes, distance in miles, `Y`/`N` for "all observations reported", count may be a number or `X`. **No double quotes and no line breaks anywhere.** Field limits: common name 128 characters, location 254, comments 4000. Country is 2 characters; state is 1–3 characters. |
| **Reading photo metadata** (capture time, `OffsetTime*`, GPS, camera body and serial, lens, burst or sequence numbers, XMP and IPTC sidecars, ratings and keywords) | Runs on the device using open-source parsers. Needs no Cornell interface. |
| **Field notebook, trips, grouping, validation, archive, backup, encryption** | All of this runs inside the app, on the device. |
| **Optional, with your own API key:** cached hotspots and region codes for a destination; reading back one checklist you submitted, to check species and counts against your local version | `/v2/ref/hotspot/{region}`, `/v2/ref/region/list/…`, `/v2/product/checklist/view/{subId}`. The docs warn: *"Do NOT use this to download large amounts of data."* The app reads one checklist at a time, and only when you tap a button. |

### 2. Features that need you to act in eBird or Merlin

| Step | What you do | What the app does |
|---|---|---|
| **Submitting checklists, route A: CSV import** | eBird → Submit → *Import Data* → *Record Format* → upload the file. Then fix any unmatched species or locations and click **"Apply Fixes"**. Status page: [ebird.org/import/status/all.htm](https://ebird.org/import/status/all.htm?theme=ebird). | Produces the file, shows a preview, blocks export while there are errors, and records the file's fingerprint. The file is marked **"Ready for eBird"**, not "Submitted". |
| **Submitting checklists, route B: manual entry** | Type each checklist into [ebird.org/submit](https://ebird.org/submit) or eBird Mobile. eBird itself recommends this route for fewer than 30 checklists. | A compact "entry sheet" for each checklist, in the order the eBird form asks for things, with copy buttons. |
| **Confirming the submission** | Paste the checklist link or `S…` ID back into the app. | Marks the checklist *Submitted* only at that point. If you have an API key, it can optionally read the checklist back and show differences. |
| **Adding photos** | On the eBird website, open the checklist → **Add Media** → drag in JPEGs. eBird says photos, including phone photos, should go through the website. | A queue of photo tasks for each checklist and species. It holds the finished JPEG paths, warns when a photo's capture time or place doesn't match the checklist, and shows the upload limits (below). **Photos are never included in the CSV.** eBird's own words: *"You will not be able to bulk upload images."* |
| **Using Merlin** | Use Merlin separately. It does not export or share saved sightings, and saving a sighting needs a network connection. Its saves are *"not part of public eBird displays."* | Lets you record "Merlin suggested: X" next to your final identification. Nothing syncs automatically. |
| **Getting an API key** (optional) | Request one at [ebird.org/api/keygen](https://ebird.org/api/keygen). The key is personal and may not be shared. | Keeps the key in the device's secure storage. It is used only for hotspots and read-back. |

### 3. Features that need Cornell Lab permission, or are not publicly available

| Feature | Status |
|---|---|
| Submitting checklists directly to eBird | **Not available.** API 2.0 has no submission endpoint. You would have to ask Cornell at ebird@cornell.edu. The app has an `EbirdSubmitter` interface ready in case a supported route appears. |
| Uploading photos to eBird or the Macaulay Library from the app | **Not available.** There is no public API for it. |
| Signing in with a Cornell account (OAuth) | **Not available.** There is no public OAuth. The app never asks for your eBird password. |
| Reading Merlin's database or running Merlin's identification models | **Not available.** I found no export, API or model licence. |
| Commercial use of the API | Needs Cornell's written permission. Your use is personal and non-commercial. |
| An automatic image-identification model | I found **no model that is verified as legally usable** for bird photos. Stage 4 will evaluate candidates and their licences (BirdNET for audio is one; its licence still needs checking). Any suggestions will be labelled and never applied silently. |

### Discrepancies I found, and how I'll handle them

1. **Protocol values.** The current article says protocols should be one word, e.g. `Stationary`, `Traveling`, `Historical`, `Incidental`. The older Appendix A PDF lists `casual / stationary / traveling / area`. → The app exports the current names. **Before your first real batch, upload a one-checklist test file** and confirm eBird reads the protocol correctly.
2. **Photo limits.** The FAQ says *10 photos per species, 10 MB each*. The upload article says *JPG under 20 MB, 20 photos per species*. → The app warns above the stricter limits (10 photos, 10 MB) and checks that files are JPEG.
3. **Rock Pigeon.** The taxonomy calls it `Rock Pigeon`, but the import article says to write `Rock Pigeon (Feral Pigeon)`. → The export uses a small, documented table of import-name overrides.
4. **eBird's guidance on effort.** It recommends keeping Traveling lists under 5 miles and Stationary lists under 3 hours. These are recommendations, not limits. → The app warns but does not block.

---

## Part B — Proposed architecture

### Stack: TypeScript core + React UI, in Capacitor (mobile) and Electron (desktop)

```
┌──────────────────────────────────────────────────────────────────────┐
│ packages/core   (pure TypeScript — about 80% of the logic)            │
│   domain model · rules · photo grouping · clock correction · flags    │
│   checklist builder · eBird CSV writer + validator · taxonomy diff    │
│   operation log (audit + sync) · backup / open-format export          │
├──────────────────────────────────────────────────────────────────────┤
│ packages/ui     React screens, responsive: phone · tablet · desktop   │
├───────────────┬───────────────────────────┬──────────────────────────┤
│ Capacitor     │  iPhone · iPad · Android  │ Electron  macOS · Windows │
│  SQLite (SQLCipher) · Geolocation (+bg)   │  SQLite (SQLCipher)       │
│  Photo library picker · file picker       │  folder / card import     │
│  secure key store · share sheet           │  worker-thread import     │
├───────────────┴───────────────────────────┴──────────────────────────┤
│ Platform adapters behind interfaces: Storage, PhotoSource, Location,  │
│ KeyStore, FileExport, EbirdSubmitter (Manual / CsvImport / future)    │
└──────────────────────────────────────────────────────────────────────┘
```

**Why this stack.** Flutter also supports all six device types, but the JavaScript metadata parser (`exifr`) handles RAW-file EXIF, XMP sidecars and IPTC far better than Dart's options. Choosing TypeScript also means the domain rules have one implementation, which is tested once and shared by every device.

**Native components needed:**
- **iOS:** the system photo picker (PHPicker), which works with "limited" photo access; ImageIO for RAW previews; background location for GPS tracks, which needs a permission string and App Store justification.
- **Android:** `READ_MEDIA_IMAGES`, with partial access on Android 14 and later; the system file picker (SAF) for camera cards and cloud folders; a foreground service for GPS tracks.
- **Desktop:** Node's file system access, for folder and card imports.
- **RAW previews everywhere:** the JPEG preview that cameras embed in CR2, CR3, NEF, ARW, DNG, ORF and RAF files. The app never decodes or modifies the RAW file itself.

### Data model: the sighting is the permanent record

```
Trip ─< Outing ─< Sighting >─< PhotoLink >─ PhotoAsset ─ ClockCorrection
              │       │
              │       └─< IdentificationDecision   (history; one is current)
              │
              └─< Checklist (versioned) ─< ChecklistObservation >─ Sighting(s)
                       │                          └─< MediaTask ─ PhotoAsset
                       └─< ExportRecord (file sha256, checklist versions)

Location · Taxon(version) · TaxonomyChange · ReviewFlag · Op (audit/sync log)
```

What each record holds, and the rules it carries:

- **Outing.** Its start and end times are set **only** by a session you start in the field or by values you type. Times taken from photo evidence are stored separately, as `evidenceStart` and `evidenceEnd`, and are shown as evidence.
- **Sighting.** Records seen or heard, the time, an optional position, and a count mode: `exact`, `estimate` or `present`. It also holds pending-ID status and sensitive or possibly-captive flags. A sighting needs no photo.
- **PhotoAsset.** Holds the original file's path or bookmark, a SHA-256 fingerprint, the raw metadata as JSON, a thumbnail, and a status of present, moved or missing. **The app never writes to the original file.**
- **PhotoLink.** Links many photos to many sightings. One photo can document several species, and several photos can document one bird. **Adding photos never changes a sighting's count.**
- **Checklist.** Has one date and one location, which the app enforces. Its states are `draft → ready → exported → submitted`, plus `needs_correction`. It has a version number that increases on every edit after export, and it stores `ebirdSubId`. The *complete* field starts as `unanswered`. A checklist built from photos cannot be exported until you answer it.
- **Op log.** Every change is stored as `{hlc, deviceId, entity, id, field, old, new, reason}`. The same log provides the audit trail, undo, and sync.

**Photo grouping.** These are proposals with the reasoning shown; you confirm or change every one:
- Outings split on a calendar-date change, a gap longer than 90 minutes, or a move of more than 2 km.
- Photos within 60 seconds of each other and within 50 m are proposed as **one sighting**.
- Clock offsets are found by comparing photo times with phone-GPS times, or with a reference photo you choose. Corrections are stored for each camera serial number and date range.

**Review flags:**
- missing GPS
- camera clock offset
- time-zone crossing
- duplicate fingerprint
- edited export with its metadata stripped
- ambiguous taxon (spuh or slash)
- possible captive bird
- outside the expected range or season (if you cache a region's species list from eBird)

### Offline, sync and backup — decisions that affect cost and data ownership

- **Offline:** everything works without a network: the database, taxonomy, thumbnails and submission state. Only these steps need a connection: downloading taxonomy, optional hotspots and read-back, opening eBird to submit, and sync.
- **Recommended sync: an encrypted operation log in a cloud folder you already own.** Each device writes its own append-only file to a folder you choose in iCloud Drive, OneDrive, Dropbox, Google Drive or a NAS, and reads the files the other devices wrote.
  - **Cost:** nothing beyond the storage you already have. A year's records plus thumbnails is roughly 1–3 GB at about 60 KB per thumbnail.
  - **Privacy:** files are encrypted on your device before they reach the folder (XChaCha20-Poly1305, with a key derived from your passphrase by Argon2id). The cloud provider sees only encrypted data.
  - **Limits to know:** Dropbox's free plan allows 3 devices. OneDrive's free plan is 5 GB; iCloud's is 5 GB; Google's 15 GB is shared with Gmail. On phones, sync runs when you open the app or tap "Sync". Phones do not allow reliable background sync to a folder.
  - **Conflicts:** each field keeps whichever edit came last, ordered by a hybrid logical clock. **If two devices edit the same field of the same sighting before seeing each other's change, the app keeps both values and asks you to choose.**
- **Rejected for the first release:** a hosted database such as Firebase or Supabase. It brings a monthly cost, an account, and your locations on someone else's server.
- **Backup and export in open formats:** a single `.zip` containing JSON-Lines for every entity, CSVs for sightings and checklists, the taxonomy version, and thumbnails. It can be encrypted. Restoring a backup is tested.
- **Protecting precise locations:** the database is encrypted with SQLCipher, using a key kept in the device's secure store. You can add an app lock. Each export or sync has a choice of exact, rounded (about 1 km), or no coordinates; sensitive species default to rounded. **Nothing is ever published automatically.**

### What can actually be built and installed from this Mac

| Target | Status from here |
|---|---|
| Web/PWA preview (for testing) | ✅ builds and runs here |
| macOS app (Electron `.dmg`) | ✅ can build here; unsigned unless you have a Developer ID |
| iPhone and iPad | ✅ iOS Simulator build here. Installing on your own devices needs signing: a free Apple ID works for 7 days at a time; TestFlight needs the paid program at $99 a year. |
| Android phones and tablets | ⚠️ The Android SDK isn't installed on this Mac. I would include the project and a GitHub Actions workflow that builds an APK, or I can install the SDK here (about 5 GB). |
| Windows | ⚠️ Can't be built on a Mac. I would include the project and a GitHub Actions workflow that builds the `.exe`. |

### Delivery in stages

1. **Stage 1:** offline notebook — trips, one-tap session, quick add, voice notes, pending IDs, local encrypted database, operation log, backup and restore.
2. **Stage 2:** photo import (files, folders, phone library), metadata extraction, clock correction, grouping, ID review.
3. **Stage 3:** checklist builder and validator, eBird CSV export, entry sheet, submission queue, photo tasks, export history and duplicate guard.
4. **Stage 4 (optional):** folder sync, an API-key read-back of submitted checklists, and ID suggestions — only if their licences are verified.

The end-to-end test runs as an automated script with sample data: offline entry → photos with and without GPS → clock fix → 6 photos of one heron becoming 1 individual → draft checklist → completeness question → CSV export → photo task queue.
