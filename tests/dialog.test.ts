import { describe, expect, it } from 'vitest';
import { nextFocus } from '../src/ui/Dialog';

describe('nextFocus keeps Tab inside a dialog', () => {
  it('wraps forwards and backwards', () => {
    expect(nextFocus(4, 3, false)).toBe(0);
    expect(nextFocus(4, 0, true)).toBe(3);
  });
  it('steps normally in between', () => {
    expect(nextFocus(4, 1, false)).toBe(2);
    expect(nextFocus(4, 2, true)).toBe(1);
  });
  it('enters the dialog from outside at the first or last control', () => {
    expect(nextFocus(4, -1, false)).toBe(0);
    expect(nextFocus(4, -1, true)).toBe(3);
  });
  it('a single control stays put', () => {
    expect(nextFocus(1, 0, false)).toBe(0);
    expect(nextFocus(1, 0, true)).toBe(0);
  });
});
