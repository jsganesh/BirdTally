# BirdTally user guide

## Before a trip (on Wi-Fi, about 2 minutes)

1. Open **Setup**.
2. Under **1 · Prepare for offline birding**, tick your name languages (for example te reo Māori, or the language of the country you're visiting). Then tap **Download species names**.
3. Check that the **Offline check** shows ✓ for *Species names* and *App saved for offline use*.
4. Optional:
   - Under **2 · Trip**, create a trip (for example "Borneo 2027", with countries `MY,ID`) so new entries are tagged with it.
   - If you have your own eBird API key, download the trip's regional species list. Those species then appear as one-tap buttons.

## In the field

| To do this | Tap |
|---|---|
| Record real effort | **Turn on** Birding mode when you start birding, **Turn off** when you stop |
| Add a bird you've used recently | its button under **Recent birds** (1 tap) |
| Add any bird | the bottom field, type 2–3 letters (`tui`, `piwa`, `NZFA`, `nz fan`), then tap the match |
| Record a call to identify later | **Voice note**, then tap it again to stop |
| Record a phone photo to identify later | **Photo** |
| Note a bird you couldn't identify | **Unknown bird**, then add a note |
| Change a count, mark heard-only, add a note | **Details** on the confirmation bar, or tap the entry |
| Fix a mistake straight away | **Undo** on the confirmation bar |
| Delete a wrong bird | tap the entry, then **Delete** at the top of its sheet. The sheet then offers **Restore** |
| Delete a checklist | **Checklists** → open it → **Delete checklist…**. An empty draft has a **Delete** button in the list |

A voice note you are still recording when you leave the screen or close the sheet is saved, not dropped.

Deleting a checklist asks what happens to its birds. By default they stay in the Notebook (and may reappear under **Suggested birding sessions**). You can also tick the birds to delete with it; those move to **Notebook → Deleted**, where **Restore** brings them back. Nothing is erased for good, and a checklist already exported to eBird is not removed from eBird.

Every entry is saved immediately, with its time and one GPS position. The count starts as **present (X)**; switch it to **About** or **Exactly** only if you want a number.

## Back at base

1. Open **Notebook → To identify**. Identify each pending entry (Merlin's photo ID and step-by-step questions are useful here) and type Merlin's suggestion into its field if you like.
2. Open **Checklists**. Birds you logged with Birding mode off appear under **Suggested birding sessions**. Each suggestion covers one date and one area and says why it begins where it does. Tap **Confirm** for each one.
3. Open each birding session and work through it:
   - **Location name and country code** (for example `NZ`).
   - **Protocol.** Choose *Incidental* if you can't give real effort. Use *Stationary* or *Traveling* only if Birding mode was on or you know your real times; *Traveling* also needs a distance.
   - **Completeness.** Answer Yes only if you recorded every species you identified.
   - **Counts.** If one species was entered several times, BirdTally uses the largest single count, because the entries may have been the same bird. If they were different birds, type the total.
   - **Splitting and merging.** Use **Split** if you moved to a different site, or **Merge** for two birding sessions at the same place on the same day.
   - **Fixing problems.** Fix everything marked ✕ under **Checks**, then tap **Mark ready for eBird**.
4. Tap **Export for eBird**, check the preview, and save the file. Its status becomes *Exported*, not *Submitted*.
5. On ebird.org, go to **Submit → Import Data → eBird Record Format**, upload the file, fix any unmatched species or locations, and click **Apply Fixes**.
6. When eBird shows the checklist, paste its link into the birding session and tap **Confirm submitted**.

**Prefer typing it in by hand?** Each birding session has an **Entry sheet** to copy from into eBird Mobile or ebird.org/submit.

**Photos** are never part of the eBird file. Add them later on each eBird checklist with **Add Media**. They must come from the same date and place as the checklist.

**Your first upload.** Upload a file with a single checklist first, and confirm that eBird reads the protocol and location correctly before sending a whole trip.

## Moving data and backups

- **Setup → Save backup file** saves everything (including voice notes and photos) as one file. On a phone, the share sheet opens: use AirDrop, Files or email.
- **Setup → Import / merge a file** on another device merges that file in. If the same sighting, birding session or trip was changed on both devices (including deleted on one and edited on the other), both versions are kept; you choose which one to keep under **Edited on two devices**. Choosing **Use other** changes the content only: a checklist you already exported stays marked as exported and warns you that it has changed since.
- Clashes you haven't settled yet are saved in your backup file too, so they survive moving to a new phone.
- A damaged or edited file is refused with a message saying what is wrong, and nothing from it is stored.
- If a change can't be saved (for example, the device is full), a notice at the top of the screen says so. Save a backup and free up space before carrying on.
- The Today screen reminds you after every 25 entries since your last backup.

## Good to know

- The **Online/Offline** indicator shows only whether the device has a network connection. Nothing in the field needs one.
- On iPhone, add BirdTally to the Home Screen. The system protects a home-screen app's storage much better than a Safari tab's. Keep backups anyway.
