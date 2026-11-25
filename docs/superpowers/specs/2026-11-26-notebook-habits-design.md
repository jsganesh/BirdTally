# Notebook habits: search, Today header, entry tags, day sheet

## Why
A tester keeps a paper day list: day, date and place at the top, then one line per sighting (repeats included) with
marks: P camera photos, V camera video, PV phone video, * lifer. The list later guides photo culling. The tester did
not notice that BirdTally already records date, time and GPS for every entry, because Today never shows them. They
also found common birds buried under hybrids in search.

Goal: make BirdTally read like that paper list, without adding typing in the field.

Non-goals: automatic lifers (needs the eBird "Download My Data" import, release 2); matching camera files to entries
(release 2 Mac tool); reverse geocoding (no new network host); user-defined tags.

Anti-goals: anything that slows the one-tap add; sending private marks (lifer, check ID) to eBird.

## Approaches considered
- **Chosen: four small, separate changes**, built in order: search, header, tags, day sheet. Each is useful alone.
- Notebook shorthand in the add bar ("EUGO P*"): matches the paper habit exactly, but tag letters collide with search
  prefixes ("great p…"). Left out.
- Tags as free text in the note: no new field, but cannot be shown as marks, counted or kept out of eBird. Rejected.

## 1. Search
- Hybrids, slashes ("X/Y"), spuhs ("sp."), intergrades and domestic types are folded behind one last row:
  "Show N hybrids, domestic types and unsure IDs". Tapping it shows them inline.
- They are shown directly when the query asks for them: contains " x ", "/", "sp", "hybrid" or "domestic", or when no
  species, ISSF or form matches. ISSFs and forms ("House Sparrow (Indian)") stay unfolded.
- A 4-letter code that is also a whole word in an English name no longer outranks the name: typing "myna" puts mynas
  above Paperbark Flycatcher (code MYNA). The code still wins when typed with no name word matching (e.g. "eugo").
- Applies to the add bar and to Identify / Change species in the entry sheet.
- Known limit: more than 12 species share "myna". Without an eBird key, Common Myna still needs "com my" until it has
  been used once (recent birds are boosted) or a regional list is downloaded.

## 2. Today header
One line at the top of Today: `Wed, 26 Nov 2026 · <place> · GPS ✓ ±8 m`.
- Place: the active checklist's location name when Birding mode is on and it has one; otherwise "Place named at
  review". When Birding mode is on, tapping the place lets the user type it (sets the checklist's location name), which
  is how the paper list starts.
- GPS: from the newest entry today: "GPS ✓ ±N m", "Getting GPS…", "No GPS: permission off" or "No GPS fix". Before any
  entry: "GPS taken with each bird".
- A hint (Show hints switch) says date, time and GPS are saved with every entry automatically.

## 3. Entry tags
`Sighting.tags?: Tag[]`, where `Tag` is one of:

| Tag | Shown | Meaning | eBird species comment |
|---|---|---|---|
| photo | P | Camera photos taken | Photographed. |
| video | V | Camera video | Video. |
| phoneVideo | PV | Phone video | Video. |
| audio | A | Sound recorded | Audio recorded. |
| male | ♂ | Male | Male. |
| female | ♀ | Female | Female. |
| juvenile | juv | Juvenile | Juvenile. |
| breeding | B | Breeding behaviour, nest | Breeding behaviour. |
| lifer | ★ | First ever for me | never sent |
| checkId | ? | Named, confirm from photos | never sent |

- Each tag is an independent toggle. Set from a tag row in the entry sheet, and from a compact row on the toast after a
  bird is added (P V PV A ★ ? then "More…" opens the sheet). Tapping a tag on the toast keeps the toast open.
- Today, Notebook and the day sheet show tags after the name in the paper order: `European Goldfinch P ★`.
- Checklist line comments get each distinct phrase once, in table order, after the existing notes.
- Review warns (does not block) when a checklist has entries tagged "?": "N entries are marked Check ID."
- A photo/video/audio tag counts as evidence for the unusual-bird warning, like a note or media.
- Storage: optional field; `validate.ts` accepts any list of short strings, so a newer device's tag cannot make a
  backup fail to import. Unknown tags are kept (so they survive a round trip) and ignored when shown. No format version change; old files have no tags. Merge treats it as any
  other field. `clearDeleted` strips tags with the other details.

## 4. Day sheet
A "Day sheet" button on Today, and on each day heading in Notebook, opens a plain-text view of that day:

```
Wed, 26 Nov 2026 · Kumarakom, Kerala
06:42 European Goldfinch P
06:45 European Goldfinch PV ★
07:10 Unknown bird (to identify) - perched on wire
```

- Place: the day's checklist location names, joined; else the first GPS fix as `GPS 9.61712, 76.43010`.
- One line per live entry, oldest first, repeats included; count shown when exact or estimated (`×3`, `~20`); note
  after a dash, flattened to one line.
- Copy and Share buttons (share sheet on phones, `navigator.share` text; copy falls back when share is missing).
- Text is rendered as text, never HTML.

## Builder's calls (not discussed)
- Tag order, labels and comment phrases in the table above.
- Toast stays 5 s; any tag tap restarts the timer. The tag row shows on every "saved" toast (named bird, photo,
  voice note, unknown), not on "Removed".
- Tags are stored and shown in table order, whatever order they were tapped in.
- Folded row label wording and the 12-row limit.
- Day sheet uses each entry's own recorded offset for times, as the rest of the app does.

## Tests
- Search: goldfinch and mallard show species first with composites folded; "x"/"/"/"sp" queries show composites;
  "myna" ranks a myna first; code-only queries unchanged.
- Tags: validate accepts known tags and drops unknown; comments phrase mapping, dedupe, private tags never in CSV;
  checkId review warning; evidence for unusual warning; clearDeleted strips tags.
- Day sheet: pure formatter in `src/core/` with repeats, pending, counts, notes with line breaks, place fallbacks.
- Header text: pure function for the GPS/place states.
