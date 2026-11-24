import { useState } from 'react';
import { clearDeleted } from '../store';
import { Dialog } from './Dialog';
import { CLEAR_AFTER_DAYS, useDeleted, type Scope } from './useDeleted';
import { formatBytes } from './util';

const describe = (s: Scope) => `${s.entries} deleted ${s.entries === 1 ? 'entry' : 'entries'}${s.bytes ? ` (${formatBytes(s.bytes)} of photos and voice notes)` : ''}`;

/** Asks before permanently clearing deleted entries; says exactly what goes and that it cannot be undone. */
function Confirm({ days, scope, onClose }: { days: number; scope: Scope; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog label="Clear deleted entries" onClose={onClose}>
      <h2>Clear {describe(scope)}?</h2>
      <p style={{ margin: 0 }}>
        Their species, notes, GPS positions, photos and voice notes are removed for good. They disappear from Deleted and can no longer be restored.
        Checklists and your other entries are not affected. Backup files you saved earlier still contain them.
      </p>
      <div className="row wrap">
        <button className="btn grow" onClick={onClose}>Cancel</button>
        <button
          className="btn danger grow"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await clearDeleted(days);
            onClose();
          }}
        >
          Clear for good
        </button>
      </div>
    </Dialog>
  );
}

/**
 * Deleted entries are kept so they can be restored and so a delete reaches other phones. This offers to clear them
 * once they are not wanted: all, or those deleted over a month ago. `nudge` is the one-line version shown after a checklist is submitted.
 */
export function DeletedCleaner({ nudge }: { nudge?: boolean }) {
  const { all, old } = useDeleted();
  const [days, setDays] = useState<number>();
  if (all.entries === 0) return null;
  return (
    <div className={nudge ? 'row wrap' : 'card stack'}>
      <span className={nudge ? 'grow small' : 'small'}>
        {nudge ? `You have ${describe(all)}. ` : `${describe(all)} can be cleared. Deleted entries stay restorable until you clear them.`}
      </span>
      <div className="row wrap">
        <button className="btn small danger" onClick={() => setDays(0)}>{nudge ? 'Clear…' : 'Clear all deleted…'}</button>
        {!nudge && old.entries > 0 && old.entries < all.entries && (
          <button className="btn small danger" onClick={() => setDays(CLEAR_AFTER_DAYS)}>Clear those over {CLEAR_AFTER_DAYS} days old ({old.entries})…</button>
        )}
      </div>
      {days !== undefined && <Confirm days={days} scope={days === 0 ? all : old} onClose={() => setDays(undefined)} />}
    </div>
  );
}
