# Unusual-bird warning (Step 1): design

Approved by the user in conversation on 2026-11-24. Step 2 (GPS cross-check, region picker) is a separate design.

## Intent

Birders in the field pick birds fast and sometimes pick the wrong one from a similar name or code. A bird that has
never been reported in the region is almost always a slip, and when it is real, eBird reviewers will ask for evidence.
BirdTally should say "this is unusual here" at the moment of entry, let the user force the entry, and remind them at
checklist review that a rarity needs a description or photo.

## Goals

- Warn when the user records or identifies a bird that is not on the species list for the active trip's regions.
- Let the user record it anyway in one tap; flag the entry as unusual here.
- At checklist review, warn when a flagged species has no note or media.
- Guide the user through getting and entering their own eBird API key, and downloading the lists, from Setup.
- Work fully offline once the lists are downloaded.

## Non-goals and anti-goals

- No hiding or blocking of birds. Vagrants and escapees are real; the user always has the last word.
- No GPS region detection, region picker or auto-refresh of lists (Step 2).
- No frequency or "rare in this month" logic. eBird's species list means "ever reported in the region".
- Anti-goal: slowing the normal case. A bird on the list, and every recent-bird chip that is on it, saves in one tap
  exactly as today. The feature must never make the app unusable without a key or without lists.

## Constraints

- eBird API terms: the key is personal and tied to the user's eBird account, never shared or built in; non-commercial
  use; eBird.org must be credited with a link wherever its data is shown; Cornell may change or withdraw the API without
  notice. So the feature is optional and degrades to "no warnings".
- The key stays on the device, is sent only to api.ebird.org, and is not part of backup or trip files (settings are not
  exported).
- Project rules: files about 200 lines (hard 300), functions at most 20 lines, tests ship with the feature.

## Approaches considered

1. **Block with a confirmation sheet at the moment of choosing (chosen).** Matches "warning, force entry". Costs one
   extra tap only for unusual birds.
2. Save immediately, then show an Undo toast saying "unusual here". Faster, but easy to miss, which defeats the point.
3. Filter unusual birds out of search. Rejected: hides real vagrants.

## Design

### Rules (core/region.ts, pure)

- A trip's regions are its `countryCodes` (country such as `NZ`, or subnational such as `NZ-AUK`; the field keeps its
  old name for file compatibility).
- Warnings are active only when every region code of the trip has a downloaded list. A partial set would warn about
  birds that are on a missing list.
- A bird is unusual when it is on none of those lists. Only taxa that appear on species lists are judged: category
  species, issf or form, looked up by `reportAs ?? code`. Slashes, spuhs, hybrids and the like are never flagged.
- A species already recorded as unusual in the same trip is not asked about again, but the new entry is still flagged.

### Data

- `Sighting.unusualHere?: boolean`, checked in file validation, carried by merge and "Use other" like any content field.
- Set when the user forces an entry; cleared when the species is changed to a listed one.

### UI

- `useRegion()` hook: active trip, its lists, confirmed species; exposes `unusual(code)`, the region label and whether
  warnings are active.
- Today: adding by chip or search calls the check first. If unusual, an `UnusualSheet` opens: "<Bird> is not on the
  eBird list for <regions>. Unusual birds need a description or photo. [Cancel] [Record anyway]", with an eBird.org link.
- SightingSheet: identifying a pending bird or changing species runs the same check.
- Search results (AddBar and the sheet's species list) dim unusual birds and tag them "unusual here".
- `Dialog` stacks: only the top-most dialog reacts to Escape and Tab.
- Checklist review: a warning for each flagged species with no entry note and no media.
- Setup: the optional key step moves out of the hidden section into `RegionKeyGuide`: status line, five numbered
  steps, a link to ebird.org/api/keygen, a key field, "Download lists for this trip" (also tests the key), saved lists,
  and the eBird.org credit. Trip creation says "Regions" and explains codes with an example.

### Left to the builder

- Wording, styling of the dim state, and the exact error text for a refused key.

## Test plan

- Region rules: no trip, no lists, partial lists, listed, unlisted, subspecies via `reportAs`, slash/hybrid never
  flagged, confirmed species not re-asked.
- Review warning: flagged species with and without note or media.
- Validation round-trip of `unusualHere`; Dialog stacking helper.
- Browser: unusual bird shows the sheet, Cancel saves nothing, Record anyway saves flagged; listed bird is one tap.
