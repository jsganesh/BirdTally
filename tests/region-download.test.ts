import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db';
import { missingRegions } from '../src/core/region';
import { createTrip, downloadRegionList, getSettings, updateSettings } from '../src/store';

const reply = (status: number, body: unknown = []) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

beforeEach(() => db.tripLists.clear());
afterEach(() => vi.unstubAllGlobals());

describe('downloadRegionList', () => {
  it('stores the list under the upper-case region code and sends the key only to api.ebird.org', async () => {
    const fetchMock = reply(200, ['tui1', 'kea1']);
    vi.stubGlobal('fetch', fetchMock);
    expect(await downloadRegionList('nz-auk', 'KEY123')).toBe(2);
    expect((await db.tripLists.get('NZ-AUK'))!.codes).toEqual(['tui1', 'kea1']);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.ebird.org/v2/product/spplist/nz-auk');
    expect((init as RequestInit).headers).toEqual({ 'x-ebirdapitoken': 'KEY123' });
  });

  it('says what to do when the key is refused', async () => {
    vi.stubGlobal('fetch', reply(403));
    await expect(downloadRegionList('NZ', 'bad')).rejects.toThrow(/refused the key.*copied all/);
    expect(await db.tripLists.count()).toBe(0);
  });

  it.each([400, 404])('names the region code eBird does not recognise (%i)', async (status) => {
    vi.stubGlobal('fetch', reply(status));
    await expect(downloadRegionList('ZZ-QQ', 'k')).rejects.toThrow(/does not recognise the region code ZZ-QQ/);
  });
});

describe('one key, many trips', () => {
  it('a saved key survives creating more trips, and each region keeps its own list', async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await getSettings();
    await updateSettings({ ebirdApiKey: 'KEY123' });
    vi.stubGlobal('fetch', reply(200, ['tui1']));
    await createTrip('Auckland', ['NZ-AUK']);
    await downloadRegionList('NZ-AUK', 'KEY123');
    await createTrip('Waikato', ['NZ-WKO']);
    expect((await getSettings()).ebirdApiKey).toBe('KEY123');
    expect(missingRegions(['NZ-WKO'], (await db.tripLists.toArray()).map((l) => l.key))).toEqual(['NZ-WKO']);
    expect(missingRegions(['NZ-AUK'], (await db.tripLists.toArray()).map((l) => l.key))).toEqual([]);
  });
});
