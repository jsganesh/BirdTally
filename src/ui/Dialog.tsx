import { useEffect, useRef, type ReactNode } from 'react';

/** Index of the control Tab moves to when focus is kept inside a dialog of `count` controls. */
export function nextFocus(count: number, current: number, backwards: boolean): number {
  if (current < 0) return backwards ? count - 1 : 0;
  return (current + (backwards ? count - 1 : 1)) % count;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

const open: HTMLElement[] = []; // dialogs can stack (a confirmation over a sheet); only the top one reacts to keys

/**
 * A bottom sheet over a backdrop. Focus moves into it when it opens, Tab stays inside, Escape
 * closes it, and focus goes back to whatever opened it. Without that a keyboard or screen-reader
 * user is left on the page behind. The effect runs once: re-running it on every parent render
 * would pull focus out of a field being typed in.
 */
export function Dialog({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const el = box.current!;
    const opener = document.activeElement as HTMLElement | null;
    open.push(el);
    if (!el.contains(document.activeElement)) el.focus();
    const onKey = (e: KeyboardEvent) => {
      if (open[open.length - 1] !== el) return;
      if (e.key === 'Escape') return close.current();
      if (e.key !== 'Tab') return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      e.preventDefault();
      items[nextFocus(items.length, items.indexOf(document.activeElement as HTMLElement), e.shiftKey)].focus();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      open.splice(open.indexOf(el), 1);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <div className="sheet-backdrop" onClick={() => close.current()}>
      <div ref={box} tabIndex={-1} className="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
