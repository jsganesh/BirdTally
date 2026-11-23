# Requirements, from the Q&A of 23 Nov 2026

## Who it is for, and how we'll judge success
- **Users:** bird photographers who go on offline trips. The first user is based in New Zealand, takes 2–4 trips abroad a year, and today *often records nothing* in the field.
- **Release:** free and public, with no ads and no paid tier. No accounts and no server. Windows is not a target.
- **Success test for version 1:** "I used it all trip."
- **Things that would make the user stop using it, which become hard requirements:**
  - Logging a bird takes more than about 3 taps.
  - Any entry is lost.
  - Battery drain.
  - Fiddly setup before a trip.

## Field notebook (iPhone, Android, iPad) — release 1, needed within a month
- **One-step trip setup:** choose the countries and the name languages, then tap "Prepare". The app downloads the eBird taxonomy for those languages; this needs no API key. Afterwards a check confirms that offline mode is ready.
- **Name languages:** eBird English, te reo Māori (eBird locale `mi`, e.g. "Tūī | Tui"), scientific names, and the destination's local language.
- **Ways to add a bird:**
  - Type-ahead on any name, or on the 4-letter or 6-letter codes.
  - Tap from your recent species.
  - Tap from the trip list; this uses eBird's regional species list *only if* you add your own API key, because the terms don't allow a shared key.
  - A voice note.
  - A phone photo.
- **What each entry records automatically:** a timestamp, and one GPS fix. No continuous tracking, to save battery.
- **Outings:** you can tap start and stop, *or* just log birds. In the second case the app proposes outings afterwards (on a new day, after a gap, or after moving more than about 2 km), and you confirm them. A typical day is a few stops by car.
- **Counts:** default to an estimate or "present". Saving the record never requires a count.
- **"Pending ID":** saves a note, voice note or photo now so you can identify the bird later, at home, with Merlin photo ID or its step-by-step questions. The Merlin result is recorded by hand.
- **Two phones on one trip:** each phone exports a trip file, and the files merge into one trip without duplicates.
- **Export from the phone:**
  - An eBird import CSV, for outings that don't need photo review (to upload from the phone's browser or the Mac).
  - A trip file for the Mac.
  - A full backup.
- **Security:** no app lock in release 1; the phone's own passcode protects the data, which stays on the device. *Later, only if users ask for it:* an optional Face ID / fingerprint lock (no PIN — a PIN added little over the phone passcode and risked locking people out of their notebook).
- **Design:**
  - Readable in bright sun.
  - Usable one-handed, with the thumb, with a camera in the other hand.
  - Large targets that work with gloves or in rain.
  - A dark mode for dawn.
  - Units set by each user. eBird's import file is always written in miles.

## Mac photo-to-checklist tool — release 2, after the trip
- **Import:** Sony a7 V RAW files (ARW) from a folder. GPS from Sony's phone app may be present or not.
- **Camera clock:** often left on NZ time abroad. The app corrects the time zone and any clock offset, using notebook entries and phone photos as reference times.
- **Matching:** photos are matched to notebook entries; grouped into outings, then into sightings; you review each draft checklist.
- **Protocols:** Incidental by default for lists rebuilt from photos. Traveling or Stationary only when the outing has real start and stop times.
- **Export and tracking:** eBird import CSV, an export history with file fingerprints, and submission tracking. Media tasks list the photos to add to each eBird checklist.
- **Your eBird history:** import eBird's "Download My Data" file into a personal archive. The archive also shows sightings that were never submitted to eBird.

## Locations
- Coordinates are exact everywhere, with no rounding prompts.

## Distribution
- The same code runs as a web app (PWA) and as native apps.
- **iPhone ships through TestFlight from the start**, using your Apple developer account. The native app's storage is the safest way to meet "never lose an entry".
- Android and iPad can start as the PWA.
- Every write is saved immediately, and the app also creates an automatic rolling backup file.
