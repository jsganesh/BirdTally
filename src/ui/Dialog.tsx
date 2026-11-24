import { useEffect, useRef, type ReactNode } from 'react';

/** Index of the control Tab moves to when focus is kept inside a dialog of `count` controls. */
export function nextFocus(count: number, current: number, backwards: boolean): number {
  if (current < 0) return backwards ? count - 1 : 0;
  return (current + (backwards ? count - 1 : 1)) % count;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * A bottom sheet over a backdrop. Focus moves into it when it opens, Tab stays inside, Escape
 * closes it, and focus goes back to whatever opened it. Without that a keyboard or screen-reader
 * user is left on the page behind.
 */
export function Dialog({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    if (!box.current?.contains(document.activeElement)) box.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab' || !box.current) return;
      const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      e.preventDefault();
      items[nextFocus(items.length, items.indexOf(document.activeElement as HTMLElement), e.shiftKey)].focus();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div ref={box} tabIndex={-1} className="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
