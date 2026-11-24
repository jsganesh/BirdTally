import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/db';
import { missingRegions } from '../src/core/region';
import { cleanApiKey, createTrip, downloadRegionList, getSettings, listCountries, listRegions, updateSettings } from '../src/store';

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
    expect(info[1]).toMatchObject({ headers: { 'x-ebirdapitoken': 'KEY123' } });
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

describe('listRegions', () => {
  it('lists sub-regions by name, sending the key only to api.ebird.org', async () => {
    const f = reply(200, [{ code: 'NZ-WKO', name: 'Waikato' }, { code: 'NZ-AUK', name: 'Auckland' }, { code: 7 }, 'junk']);
    vi.stubGlobal('fetch', f);
    expect(await listRegions('subnational1', 'NZ', 'KEY123')).toEqual([{ code: 'NZ-AUK', name: 'Auckland' }, { code: 'NZ-WKO', name: 'Waikato' }]);
    expect(String(f.mock.calls[0][0])).toBe('https://api.ebird.org/v2/ref/region/list/subnational1/NZ');
    expect(f.mock.calls[0][1]).toMatchObject({ headers: { 'x-ebirdapitoken': 'KEY123' } });
  });

  it('asks for the countries with the parent "world"', async () => {
    const f = reply(200, []);
    vi.stubGlobal('fetch', f);
    expect(await listRegions('country', 'world', 'k')).toEqual([]);
    expect(String(f.mock.calls[0][0])).toBe('https://api.ebird.org/v2/ref/region/list/country/world');
  });

  it('says what to do when the key is refused, and copes with an odd reply', async () => {
    vi.stubGlobal('fetch', reply(403));
    await expect(listRegions('country', 'world', 'bad')).rejects.toThrow(/refused the key/);
    vi.stubGlobal('fetch', reply(200, { not: 'a list' }));
    expect(await listRegions('country', 'world', 'k')).toEqual([]);
  });
});

describe('a request that fails is reported, never left loading', () => {
  it('turns a request that never answers into a message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')));
    await expect(listRegions('country', 'world', 'k')).rejects.toThrow(/did not answer in time/);
  });

  it('turns an unreachable network into a message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Load failed')));
    await expect(listRegions('country', 'world', 'k')).rejects.toThrow(/Could not reach eBird/);
  });

  it('gives every request a time limit', async () => {
    const f = reply(200, []);
    vi.stubGlobal('fetch', f);
    await listRegions('country', 'world', 'k');
    expect((f.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });
});

describe('listCountries', () => {
  it('asks once per key however many places need the list', async () => {
    const f = reply(200, [{ code: 'NZ', name: 'New Zealand' }]);
    vi.stubGlobal('fetch', f);
    const [a, b] = await Promise.all([listCountries('shared-key'), listCountries('shared-key')]);
    expect(a).toEqual(b);
    await listCountries('shared-key');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('forgets a failure, so Try again really asks again', async () => {
    vi.stubGlobal('fetch', reply(403));
    await expect(listCountries('flaky-key')).rejects.toThrow(/refused the key/);
    const ok = reply(200, [{ code: 'NZ', name: 'New Zealand' }]);
    vi.stubGlobal('fetch', ok);
    expect(await listCountries('flaky-key')).toHaveLength(1);
    expect(ok).toHaveBeenCalledTimes(1);
  });
});

describe('cleanApiKey', () => {
  it('removes the spaces, line breaks and invisible characters a phone adds', () => {
    expect(cleanApiKey('  abc123def456\n')).toBe('abc123def456');
    expect(cleanApiKey('abc\u200B123 \u00a0def\uFEFF')).toBe('abc123def');
  });
  it('leaves a clean key, including its case, alone', () => expect(cleanApiKey('AbC123')).toBe('AbC123'));
});
