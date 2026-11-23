import type { Table } from 'dexie';
import { touch } from '../core/records';
import type { Conflict, ID, IdDecision, Outing, Sighting, Trip } from '../core/types';
import { db } from '../db';
import { bumpOutingTx } from './outings';
import { getSettings } from './settings';

// Identity, edit tracking and this device's eBird workflow. "Use other" must never copy these:
// taking an old version's `submission` or `version` would turn an exported checklist back
// into a draft and invite a second, duplicate upload to eBird.
const NOT_CONTENT = new Set(['id', 'createdAt', 'updatedAt', 'deviceId', 'history', 'version', 'submission', 'exportedVersion', 'ebirdChecklistId']);

/** Settle a clash: keep the current version, or make the other version's content current. */
export async function resolveConflict(conflictId: ID, useOther: boolean) {
  const { deviceId } = await getSettings();
  await db.transaction('rw', [db.conflicts, db.trips, db.outings, db.sightings], async () => {
    const c = await db.conflicts.get(conflictId);
    if (!c || c.resolved) return;
    if (useOther) await applyOther(c, deviceId);
    await db.conflicts.update(conflictId, { resolved: true });
  });
}

async function applyOther(c: Conflict, deviceId: string) {
  const t = db[c.table] as unknown as Table<Trip | Outing | Sighting, string>;
  const cur = await t.get(c.recordId);
  if (!cur) return;
  const other = c.other as Record<string, unknown>;
  const changes: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(cur), ...Object.keys(other)])) if (!NOT_CONTENT.has(k)) changes[k] = other[k];

  if (c.table === 'outings') {
    const o = cur as Outing;
    changes.version = o.version + 1; // content changed: an exported list must show "edited since export"
    if (o.submission === 'ready') changes.submission = 'draft';
  }
  if (c.table === 'sightings') changes.idHistory = mergeIdHistory((cur as Sighting).idHistory, (other as unknown as Sighting).idHistory);
  await t.put(touch(cur, changes as Partial<typeof cur>, deviceId));

  if (c.table === 'sightings') {
    const outings = new Set([(cur as Sighting).outingId, (other as unknown as Sighting).outingId]);
    for (const o of outings) if (o) await bumpOutingTx(o, deviceId);
  }
}

/** Both devices' identification decisions, oldest first, each once. */
function mergeIdHistory(a: IdDecision[], b: IdDecision[]): IdDecision[] {
  const byKey = new Map([...a, ...b].map((d) => [`${d.at}|${d.speciesCode ?? ''}`, d]));
  return [...byKey.values()].sort((x, y) => x.at.localeCompare(y.at));
}
