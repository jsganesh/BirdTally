// A voice note is never dropped: leaving the screen mid-recording saves it and frees the microphone.
import { describe, expect, it } from 'vitest';
import { VoiceNotes, type Recorder } from '../src/ui/recorder';

function fake(opts: { failStart?: boolean } = {}) {
  const made: { stopped: number }[] = [];
  const make = (): Recorder => {
    const r = { stopped: 0 };
    made.push(r);
    return {
      start: () => (opts.failStart ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve()),
      stop: async () => {
        r.stopped++;
        return { blob: new Blob(['x']), seconds: 3 };
      }
    };
  };
  const saved: number[] = [];
  const notes = new VoiceNotes(async (_b, s) => void saved.push(s), make);
  return { notes, made, saved };
}

describe('VoiceNotes', () => {
  it('starts on the first tap and saves once on the second', async () => {
    const { notes, saved } = fake();
    await notes.toggle();
    expect(notes.recording).toBe(true);
    await notes.toggle();
    expect(notes.recording).toBe(false);
    expect(saved).toEqual([3]);
  });

  it('saves a note still running when the screen closes, once', async () => {
    const { notes, made, saved } = fake();
    await notes.toggle();
    await Promise.all([notes.finish(), notes.finish()]);
    expect(saved).toEqual([3]);
    expect(made[0].stopped).toBe(1);
  });

  it('does nothing when closed while idle', async () => {
    const { notes, saved } = fake();
    await notes.finish();
    expect(saved).toEqual([]);
  });

  it('a failed start records nothing and can be retried', async () => {
    const { notes, saved } = fake({ failStart: true });
    await expect(notes.toggle()).rejects.toThrow(/NotAllowed/);
    expect(notes.recording).toBe(false);
    await expect(notes.toggle()).rejects.toThrow(/NotAllowed/);
    expect(saved).toEqual([]);
  });

  it('a second tap while the microphone opens does not start another recorder', async () => {
    const { notes, made } = fake();
    await Promise.all([notes.toggle(), notes.toggle()]);
    expect(made).toHaveLength(1);
    expect(notes.recording).toBe(true);
  });
});
