import { useLiveQuery } from 'dexie-react-hooks';
import { clearable } from '../core/clearing';
import { db } from '../db';

export const CLEAR_AFTER_DAYS = 30;
export interface Scope {
  entries: number;
  bytes: number;
}

/** What clearing would remove: every deleted entry that still has details, and those deleted over 30 days ago. */
export function useDeleted(): { all: Scope; old: Scope } {
  return (
    useLiveQuery(async () => {
      const now = Date.now();
      const deleted = await db.sightings.filter((s) => clearable(s, now, 0)).toArray();
      const metas = await db.media.bulkGet(deleted.flatMap((s) => s.mediaIds));
      const bytes = new Map(metas.filter((m) => !!m).map((m) => [m!.sightingId, 0]));
      for (const m of metas) if (m) bytes.set(m.sightingId, (bytes.get(m.sightingId) ?? 0) + m.bytes);
      const scope = (list: typeof deleted): Scope => ({ entries: list.length, bytes: list.reduce((n, s) => n + (bytes.get(s.id) ?? 0), 0) });
      return { all: scope(deleted), old: scope(deleted.filter((s) => clearable(s, now, CLEAR_AFTER_DAYS))) };
    }, []) ?? { all: { entries: 0, bytes: 0 }, old: { entries: 0, bytes: 0 } }
  );
}
