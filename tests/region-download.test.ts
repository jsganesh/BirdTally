import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db';
import { missingRegions } from '../src/core/region';
import { createTrip, downloadRegionList, getSettings, updateSettings } from '../src/store';

const reply = (status: number, body: unknown = []) => vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), { status }));
const BOX = { minX: 174.3, maxX: 175.4, minY: -37.3, maxY: -36.1 };
/** The species list answers with `list`, the region info with `info`. */
const split = (list: Response, info: () => Response | Promise<Response>) =>
  vi.fn().mockImplementation(async (url: string) => (String(url).includes('/ref/region/info/') ? info() : list.clone()));

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

describe('region bounding boxes for the GPS cross-check', () => {
  const list = () => new Response(JSON.stringify(['tui1']), { status: 200 });

  it('stores the box with the list, asking for it with the same key', async () => {
    const f = split(list(), () => new Response(JSON.stringify({ code: 'NZ-AUK', bounds: BOX }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    await downloadRegionList('NZ-AUK', 'KEY123');
    expect((await db.tripLists.get('NZ-AUK'))!.bounds).toEqual(BOX);
    const info = f.mock.calls.find((c) => String(c[0]).includes('/ref/region/info/NZ-AUK'))!;
    expect(info[1]).toEqual({ headers: { 'x-ebirdapitoken': 'KEY123' } });
  });

  it('keeps the list and stores null when eBird has no box for the region', async () => {
    vi.stubGlobal('fetch', split(list(), () => new Response('{}', { status: 404 })));
    await downloadRegionList('NZ-AUK', 'k');
    const saved = (await db.tripLists.get('NZ-AUK'))!;
    expect(saved.codes).toEqual(['tui1']);
    expect(saved.bounds).toBeNull();
  });

  it('stores null for a reply with no usable box', async () => {
    vi.stubGlobal('fetch', split(list(), () => new Response(JSON.stringify({ bounds: { minX: 1 } }), { status: 200 })));
    await downloadRegionList('NZ-AUK', 'k');
    expect((await db.tripLists.get('NZ-AUK'))!.bounds).toBeNull();
  });

  it('leaves the box unset after a network error, so it is tried again', async () => {
    vi.stubGlobal('fetch', split(list(), () => Promise.reject(new TypeError('offline'))));
    await downloadRegionList('NZ-AUK', 'k');
    const saved = (await db.tripLists.get('NZ-AUK'))!;
    expect(saved.codes).toEqual(['tui1']);
    expect(saved.bounds).toBeUndefined();
  });
});
