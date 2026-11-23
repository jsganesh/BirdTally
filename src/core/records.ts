import type { RecordMeta } from './types';

const HISTORY_CAP = 50;

export function newId(): string {
  return crypto.randomUUID();
}

export function newMeta(deviceId: string, now = new Date().toISOString()): RecordMeta {
  return { id: newId(), createdAt: now, updatedAt: now, deviceId, history: [] };
}

/** Return an edited copy: new updatedAt, this device, previous stamp appended to history. */
export function touch<T extends RecordMeta>(rec: T, changes: Partial<T>, deviceId: string, now = new Date().toISOString()): T {
  // Guarantee a strictly later stamp even if two edits land in the same millisecond.
  const stamp = now > rec.updatedAt ? now : new Date(new Date(rec.updatedAt).getTime() + 1).toISOString();
  const history = [...(rec.history ?? []), rec.updatedAt].slice(-HISTORY_CAP);
  return { ...rec, ...changes, updatedAt: stamp, deviceId, history };
}
