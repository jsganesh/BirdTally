import { describe, expect, it } from 'vitest';
import { createDraft } from '../src/ui/draft';
import { describeFailure } from '../src/ui/FailureBanner';

describe('text field drafts', () => {
  it('saves typed text once, then nothing until it changes again', () => {
    const d = createDraft('');
    d.edit('pair near the stream');
    expect(d.take()).toBe('pair near the stream');
    expect(d.take()).toBeUndefined(); // blur then unmount must not save twice
  });

  it('has nothing to save when the text is back to what is stored', () => {
    const d = createDraft('kea');
    d.edit('kea!');
    d.edit('kea');
    expect(d.take()).toBeUndefined();
  });

  it('keeps unsaved typing when the record changes underneath (e.g. a GPS fix)', () => {
    const d = createDraft('');
    d.edit('on the hut roof');
    expect(d.sync('')).toBe(false);
    expect(d.value).toBe('on the hut roof');
    expect(d.take()).toBe('on the hut roof');
  });

  it('shows a value saved elsewhere when nothing is being typed', () => {
    const d = createDraft('nz');
    expect(d.sync('NZ')).toBe(true);
    expect(d.value).toBe('NZ');
    expect(d.take()).toBeUndefined();
  });

  it('after saving, adopts the normalised stored form (nz → NZ)', () => {
    const d = createDraft('');
    d.edit('nz');
    expect(d.take()).toBe('nz');
    d.sync('NZ');
    expect(d.value).toBe('NZ');
  });
});

describe('failed-write messages', () => {
  it('says plainly that a full device did not save the change', () => {
    expect(describeFailure({ name: 'QuotaExceededError', message: 'x' })).toMatch(/out of storage space.*NOT saved/);
    expect(describeFailure({ name: 'DatabaseClosedError', inner: { name: 'QuotaExceededError' } })).toMatch(/out of storage space/);
  });
  it('stays quiet when the user cancels a share sheet', () => {
    expect(describeFailure({ name: 'AbortError' })).toBeUndefined();
  });
  it('passes on any other error', () => {
    expect(describeFailure(new Error('disk on fire'))).toMatch(/may not have been saved: disk on fire/);
  });
});
