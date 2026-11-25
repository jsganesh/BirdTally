import { useLiveQuery } from 'dexie-react-hooks';
import type { Tag } from '../core/tags';
import { db } from '../db';
import { TagRow } from './TagRow';

export interface ToastState {
  id: string;
  text: string;
  /** The entry was just removed: no Undo, Details or marks. */
  removed?: boolean;
}

/** The quick marks; the rest are one tap away under More. */
const QUICK: readonly Tag[] = ['photo', 'video', 'phoneVideo', 'audio', 'lifer', 'checkId'];

/** "Saved" toast with Undo, Details and the quick notebook marks. `onKeep` restarts its timer. */
export function SavedToast({ toast, onUndo, onDetails, onKeep }: { toast: ToastState; onUndo: () => void; onDetails: () => void; onKeep: () => void }) {
  const tags = useLiveQuery(() => db.sightings.get(toast.id).then((s) => s?.tags), [toast.id]);

  return (
    <div className="toast" role="status" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <div className="row" style={{ gap: 8 }}>
        <span className="grow">{toast.text}</span>
        {!toast.removed && <button onClick={onUndo}>Undo</button>}
      </div>
      {!toast.removed && (
        <div className="row wrap" style={{ gap: 6 }}>
          <TagRow id={toast.id} tags={tags} only={QUICK} onTap={onKeep} />
          <button onClick={onDetails}>More…</button>
        </div>
      )}
    </div>
  );
}
