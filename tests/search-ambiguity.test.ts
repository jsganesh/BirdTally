// Real eBird data shares one banding code between several species (BASW: Bates's Swift, Bank,
// Bahama and Barn Swallow). Enter used to record whichever came first in taxonomic order.
import { describe, expect, it } from 'vitest';
import { buildIndex, isAmbiguous, searchTaxa } from '../src/core/taxonomy';
import type { Taxon } from '../src/core/types';

let order = 0;
const taxon = (code: string, en: string, codes: string[], names: Taxon['names'] = {}): Taxon => ({ code, sci: en, en, category: 'species', order: ++order, codes, names });
const taxa = [
  taxon('batswi1', "Bates's Swift", ['BASW']),
  taxon('banswa', 'Bank Swallow', ['BASW']),
  taxon('barswa', 'Barn Swallow', ['BASW', 'BARS']),
  taxon('nezfal1', 'New Zealand Falcon', ['NZFA']),
  taxon('nezfan1', 'New Zealand Fantail', ['NZFA'], { mi: ['Pīwakawaka'] }),
  taxon('soiwre1', 'South Island Wren', [], { mi: ['Pīwauwau'] }),
  taxon('tui1', 'Tui', ['TUI'])
];
const index = buildIndex(taxa, ['en', 'mi']);
const hits = (q: string, opts = {}) => searchTaxa(index, q, opts);

describe('ambiguous searches', () => {
  it.each(['BASW', 'NZFA', 'piwa'])('%s ties between species, so Enter must not choose', (q) => {
    expect(isAmbiguous(hits(q))).toBe(true);
  });

  it('a clear match is not ambiguous', () => {
    expect(isAmbiguous(hits('tui'))).toBe(false);
    expect(isAmbiguous(hits('nz fan'))).toBe(false);
  });

  it('a bird you used recently breaks the tie', () => {
    const h = hits('BASW', { recent: ['barswa'] });
    expect(isAmbiguous(h)).toBe(false);
    expect(h[0].taxon.code).toBe('barswa');
  });

  it('a bird on the trip list breaks the tie', () => {
    expect(isAmbiguous(hits('NZFA', { regional: ['nezfan1'] }))).toBe(false);
  });

  it('no hits or one hit is never ambiguous', () => {
    expect(isAmbiguous([])).toBe(false);
    expect(isAmbiguous(hits('BARS'))).toBe(false);
  });
});
