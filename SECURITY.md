# Security Policy

## Supported versions

BirdTally is one web app that is updated in place: <https://jsganesh.github.io/BirdTally/>. Only the latest
published version is supported, and fixes go into that version. There are no older maintained branches.

## Reporting a vulnerability

Please report it privately, not in a public issue:

1. Open <https://github.com/jsganesh/BirdTally/security/advisories/new> (the **Security** tab, then **Report a vulnerability**).
2. Say what you found, how to reproduce it, and what it could let someone do.

This is a small personal project, so there is no guaranteed response time. I will read every report, say whether I
accept it, and credit you in the fix if you want that.

Please do not include real eBird API keys, backup files or other people's data in a report. Describe the problem, or
use made-up test data.

## What the app handles

- Everything you record is stored only on your own device (in the browser's local database). BirdTally has no server
  and no accounts.
- The app talks to one outside service, `api.ebird.org`, to download species names and, if you choose, species lists
  for your trip. The optional eBird API key you enter stays on your device and is sent only to eBird. It is not
  included in backup or trip files.
- Backup files hold your entries with exact GPS positions, notes, photos and voice notes. Keep them private.
