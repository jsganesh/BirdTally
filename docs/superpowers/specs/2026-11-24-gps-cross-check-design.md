# GPS cross-check of the trip region (Step 2): design

Continues [Step 1](2026-11-24-unusual-bird-warning-design.md). The user asked for Step 2 on 2026-11-24.

## Intent

The unusual-bird warning judges a bird against the lists of the active trip's regions. If the user is actually
somewhere else (forgot to switch trips, typed the wrong code), every warning is judged against the wrong place.
The phone already records a GPS fix per entry, so it can say "you seem to be outside this trip's region".

## Goals

- Tell the user when a GPS position is outside every region of the trip, on Today (latest fix) and in checklist review.
- Work offline and without a lookup at the moment of use.
- Cost nothing when the feature is off (no key, no lists, no GPS).

## Non-goals

- No automatic region detection or suggested codes, and no region picker (possible later).
- No continuous GPS tracking: only the fixes already taken per entry are used.
- Never blocks saving or changes a record. It is a notice.

## Change from the earlier proposal

The earlier idea was an online lookup at review time using nearby hotspots, which carry region codes. eBird's published
API documentation has no sample response for that endpoint, so its fields could not be confirmed without a key.
`GET /ref/region/info/{regionCode}` is documented and returns `bounds` (minX, maxX, minY, maxY) for any country or
subnational region. Downloading each region's bounding box together with its species list gives an offline check with no
per-use request, using the same key and the same download step.

## Approaches considered

1. **Bounding boxes downloaded with the lists (chosen).** Offline, one extra small request per region, no hidden
   per-entry network use. Cost: a box is a rectangle, so a point just outside a coastline or inside a neighbouring
   region's corner is not caught. It catches the real mistake (a different country or distant region), not borders.
2. Hotspot lookup at review time. Precise region codes, but online only, per-use requests, and unverified response fields.
3. Bundled border data. Not available under eBird's terms and large.

## Design

- `TripList.bounds?: GeoBounds | null`. `undefined`: not fetched yet. `null`: eBird has none for this region (the check
  stays off for it). Fetched inside `downloadRegionList`; a failed box fetch never fails the list download. A network
  error leaves it `undefined` so it is retried; an HTTP error stores `null`.
- Lists downloaded before this change have no bounds, so the Setup guide refreshes them once, automatically, like a
  missing list.
- `core/region.ts`: `insideBounds(point, box, margin)` with a 0.25 degree margin (about 25 km, so coastlines and GPS
  error do not trigger it) and antimeridian handling; `outsideRegions(point, boxes)` is true only when every region has a
  box and the point is inside none; `regionsToFetch` lists regions lacking a list or bounds.
- `useRegion(tripId?)` exposes `outside(position)`.
- `RegionNotice`: "Your last GPS fix (<bird>, <time>) is outside <regions>, this trip's region, so the unusual-bird
  warnings may not fit where you are." Today shows it for the newest located entry of the active trip, with Open Setup and
  Dismiss (until the app reloads). Checklist review shows it for the checklist's location, judged against the
  checklist's own trip, and points at the country and state code fields.

## Test plan

- insideBounds: inside, outside, margin, antimeridian box. outsideRegions: unknown box means false, any region
  containing the point means false. regionsToFetch.
- downloadRegionList: stores bounds; a 404 box stores `null` and the list still saves; a network error stores
  `undefined`; the key is sent to both requests.
- Browser: a fix outside the trip shows the notice; inside shows nothing; Dismiss hides it.
