import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { daySheet } from '../core/day';
import { localDateKey } from '../core/geotime';
import { db } from '../db';
import { Dialog } from './Dialog';
import { useNames } from './hooks';

/** One day as plain text, like a paper day list, to copy or share (for example to match camera files later). */
export function DaySheet({ dayKey, title, onClose }: { dayKey: string; title: string; onClose: () => void }) {
  const names = useNames();
  const [copied, setCopied] = useState(false);
  const data = useLiveQuery(async () => {
    const all = await db.sightings.toArray();
    return { entries: all.filter((s) => localDateKey(s.observedAt, s.utcOffsetMin) === dayKey), outings: await db.outings.toArray() };
  }, [dayKey]);
  const text = data ? daySheet(title, data.entries, data.outings.filter((o) => !o.deleted), (c) => names.name(c)) : '';
  const canShare = typeof navigator.share === 'function';

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };

  return (
    <Dialog label="Day sheet" onClose={onClose}>
      <div className="sheet-head">
        <h2 className="grow">Day sheet</h2>
        <button className="btn small" onClick={onClose}>Done</button>
      </div>
      <pre className="card daysheet">{text}</pre>
      <div className="row wrap">
        <button className="btn grow" onClick={copy} disabled={!data}>{copied ? 'Copied' : 'Copy'}</button>
        {canShare && (
          <button className="btn primary grow" onClick={() => navigator.share({ title, text }).catch(() => undefined)}>
            Share
          </button>
        )}
      </div>
    </Dialog>
  );
}
