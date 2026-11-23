/**
 * What a text field has typed versus what is stored. Kept free of React and the DOM so the
 * rules that decide when typing is saved can be tested on their own.
 */
export interface Draft {
  readonly value: string;
  edit(v: string): void;
  /** Storage changed. Returns true when the visible text changed with it. */
  sync(stored: string): boolean;
  /** The text to save, or undefined when nothing new was typed. Marks it as saved. */
  take(): string | undefined;
}

export function createDraft(stored: string): Draft {
  let saved = stored;
  let current = stored;
  return {
    get value() {
      return current;
    },
    edit(v) {
      current = v;
    },
    sync(next) {
      // Unsaved typing wins over a background update (e.g. a GPS fix touching the record).
      const adopt = current === saved && current !== next;
      if (adopt) current = next;
      saved = next;
      return adopt;
    },
    take() {
      if (current === saved) return undefined;
      saved = current;
      return current;
    }
  };
}
