import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { hintsOn } from '../src/core/hints';
import { db } from '../src/db';
import { getSettings, updateSettings } from '../src/store';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('hints switch', () => {
  it('is on by default, including for settings saved before the switch existed', () => {
    expect(hintsOn(undefined)).toBe(true);
    expect(hintsOn({})).toBe(true);
    expect(hintsOn({ showHints: true })).toBe(true);
  });
  it('is off only when switched off', () => expect(hintsOn({ showHints: false })).toBe(false));
  it('a new device starts with hints on, and the choice is kept', async () => {
    expect(hintsOn(await getSettings())).toBe(true);
    await updateSettings({ showHints: false });
    expect(hintsOn(await getSettings())).toBe(false);
    await updateSettings({ showHints: true });
    expect(hintsOn(await getSettings())).toBe(true);
  });
});
