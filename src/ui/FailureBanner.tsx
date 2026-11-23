import { useEffect, useState } from 'react';

/** Text for an error nobody caught, or undefined when it needs no message (a cancelled share sheet). */
export function describeFailure(reason: unknown): string | undefined {
  const e = reason as { name?: string; message?: string; inner?: { name?: string } } | undefined;
  const name = e?.inner?.name ?? e?.name; // Dexie wraps the browser's error in `inner`
  if (name === 'AbortError') return undefined;
  if (name === 'QuotaExceededError')
    return 'This device is out of storage space, so your last change was NOT saved. Save a backup file (Setup), then free up space on the device.';
  return `Something went wrong and your last change may not have been saved: ${e?.message ?? String(reason)}. Check it before you carry on.`;
}

/**
 * Any action whose write fails would otherwise fail silently: the button's promise rejects
 * and nothing tells the user their bird was not stored. Shows those failures until dismissed.
 */
export function FailureBanner() {
  const [message, setMessage] = useState<string>();
  useEffect(() => {
    const show = (reason: unknown) => {
      const text = describeFailure(reason);
      if (text) setMessage(text);
    };
    const onRejection = (e: PromiseRejectionEvent) => show(e.reason);
    const onError = (e: ErrorEvent) => show(e.error ?? e.message);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError);
    };
  }, []);
  if (!message) return null;
  return (
    <div className="banner" role="alert" style={{ margin: '10px 16px 0', borderColor: 'var(--error)' }}>
      <span className="grow">{message}</span>
      <button className="btn small" onClick={() => setMessage(undefined)}>Dismiss</button>
    </div>
  );
}
