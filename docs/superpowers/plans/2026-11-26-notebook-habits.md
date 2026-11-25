# Notebook Habits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make BirdTally read like a paper day list: cleaner search, a Today header, entry tags, a day sheet.

**Architecture:** Pure rules in `src/core/` (search folding, tag table, header and day-sheet text); thin React
components in `src/ui/`; one store helper for toggling a tag in one transaction.

**Tech Stack:** React 19, TypeScript, Dexie, Vitest (node, fake-indexeddb).

**Spec:** `docs/superpowers/specs/2026-11-26-notebook-habits-design.md`

## Global Constraints
- `src/core/` uses no browser APIs.
- Files around 200 lines, hard limit 300; functions 20 lines at most.
- Never render model or user text as HTML; the day sheet is text in a `<pre>`.
- No new network host; no format version change (`formatVersion: 2`).
- Private tags (`lifer`, `checkId`) never reach the eBird CSV.

## Review Focus
- A backup from a newer device with an unknown tag must import: validate accepts any short string list; unknown tags are kept and ignored when shown.
- A note with line breaks must stay on one day-sheet line.
- Folding must not hide everything: a query that matches only composites ("myna/starling") shows them directly.
- Tag taps in quick succession must not overwrite each other (toggle runs inside one transaction).
- A cleared (stripped) entry must lose its tags.

---

### Task 1: Search folding and code collision
**Files:** Modify `src/core/taxonomy.ts`, `src/ui/AddBar.tsx`, `src/ui/SightingSheet.tsx`. Test `tests/search-fold.test.ts`.
**Produces:** `splitFolded(hits: SearchHit[], query: string): { main: SearchHit[]; folded: SearchHit[] }`.

- [ ] Test (mini taxonomy built in the test): "goldfinch" → main has only species; folded has the hybrid and slash; "x"/"/"/"sp"/"hybrid"/"domestic" queries → folded empty; a query matching only a spuh → main holds it; "myna" ranks a name match above a species whose code is MYNA; "eugo" still finds by code.
- [ ] Run, see it fail.
- [ ] Implement: folded categories `hybrid, slash, spuh, intergrade, domestic`. In `searchTaxa`, an exact code hit drops below name-word matches (score 60) when any English name has the query as a whole word.
- [ ] UI: search with limit 40, show `main.slice(0, 12)`, then a button "Show N hybrids, domestic types and unsure IDs" that reveals `folded.slice(0, 12)`. `isAmbiguous` uses `main`.
- [ ] Run tests, pass.

### Task 2: Today header
**Files:** Create `src/core/day.ts`, `src/ui/TodayHeader.tsx`. Modify `src/ui/Today.tsx`. Test `tests/day.test.ts`.
**Produces:** `gpsLabel(s?: Sighting): string`.

- [ ] Test: undefined → "GPS taken with each bird"; ok with accuracy 8 → "GPS ✓ ±8 m"; pending → "Getting GPS…"; denied → "No GPS: permission off"; unavailable → "No GPS fix".
- [ ] Implement; header shows `dayLabel · place · gpsLabel(newest today)`. Place: active outing `locationName`, tap to edit via `updateOuting` when Birding mode is on; else "Place named at review". Hint: date, time and GPS are saved with every entry.

### Task 3: Entry tags
**Files:** Create `src/core/tags.ts`, `src/ui/TagRow.tsx`, `src/ui/SavedToast.tsx`. Modify `types.ts`, `validate.ts`, `checklist.ts`, `store/sightings.ts`, `Today.tsx`, `Notebook.tsx`, `SightingSheet.tsx`, `styles.css`. Test `tests/tags.test.ts`.
**Produces:** `TAGS` (table order from spec), `type Tag`, `tagMarks(tags?: string[]): string`, `tagComments(list: Sighting[]): string[]`, `EVIDENCE_TAGS`, `toggleTag(id: ID, tag: Tag): Promise<void>`, `Sighting.tags?: string[]`.

- [ ] Test: `tagMarks(['lifer','photo','zzz'])` → "P ★"; comments for two entries tagged photo+male and photo+phoneVideo → "Photographed. Video. Male." once each; lifer/checkId never in `buildLines` comments nor CSV; checkId gives warning "1 entry is marked Check ID."; photo tag clears the unusual-without-evidence warning; validate accepts `tags: ['photo','future']`, refuses `tags: 'photo'`; `toggleTag` twice quickly adds both, in table order; `stripSighting` drops tags.
- [ ] Implement and wire UI: toast shows P V PV A ★ ? + More…; sheet shows all ten; marks after names in Today and Notebook.

### Task 4: Day sheet
**Files:** Modify `src/core/day.ts`; create `src/ui/DaySheet.tsx`; modify `Today.tsx`, `Notebook.tsx`. Test `tests/day.test.ts`.
**Produces:** `daySheet(title: string, entries: Sighting[], outings: Outing[], name: (code?: string) => string): string`.

- [ ] Test: oldest first, repeats kept, pending shows "(to identify)", `×3` / `~20`, note after " - " with line breaks flattened, tags appended, deleted skipped; place = outing names joined by ", " else first GPS `GPS lat, lng` (5 decimals) else title alone.
- [ ] Implement; dialog with `<pre>`, Copy (`navigator.clipboard`) and Share (`navigator.share({ text })`, hidden when missing).

### Task 5: Docs and checks
- [ ] USER-GUIDE and README: header, tags, day sheet, folded search.
- [ ] `npm test`, `npm run typecheck`, `npm run build`; browser check on the dev server; commit.
