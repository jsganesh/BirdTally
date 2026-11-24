import { useEffect, useState } from 'react';
import type { Outing, Sighting } from '../core/types';
import { deleteOuting } from '../store';
import { useNames } from './hooks';
import { dayLabel, timeOf } from './util';

/** Asks what happens to a checklist's birds before deleting it. Birds are kept unless ticked. */
export function DeleteChecklist({ outing: o, birds, active, onClose, onDeleted }: { outing: Outing; birds: Sighting[]; active: boolean; onClose: () => void; onDeleted: () => void }) {
  const names = useNames();
  const [alsoBirds, setAlsoBirds] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const chosen = alsoBirds ? [...picked] : [];
  const exported = o.submission === 'exported' || o.submission === 'submitted';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Delete checklist" onClick={(e) => e.stopPropagation()}>
        <h2>Delete this checklist?</h2>
        <div className="muted small">
          {o.locationName || 'Unnamed location'} · {dayLabel(o.startedAt, o.utcOffsetMin)} · {birds.length} {birds.length === 1 ? 'entry' : 'entries'}
        </div>

        {birds.length > 0 && (
          <fieldset className="card stack" style={{ margin: 0 }}>
            <legend className="visually-hidden">What happens to the birds</legend>
            <label className="check" style={{ alignItems: 'flex-start' }}>
              <input type="radio" name="birds" checked={!alsoBirds} onChange={() => setAlsoBirds(false)} />
              <span>
                Keep the birds
                <span className="sub muted small" style={{ display: 'block', fontWeight: 400 }}>They stay in your Notebook and may reappear under “Suggested birding sessions”.</span>
              </span>
            </label>
            <label className="check" style={{ alignItems: 'flex-start' }}>
              <input type="radio" name="birds" checked={alsoBirds} onChange={() => setAlsoBirds(true)} />
              <span>
                Also delete some or all of the birds
                <span className="sub muted small" style={{ display: 'block', fontWeight: 400 }}>Deleted birds move to Notebook → Deleted, where you can restore them.</span>
              </span>
            </label>
            {alsoBirds && (
              <>
                <button className="btn small" onClick={() => setPicked(picked.size === birds.length ? new Set() : new Set(birds.map((b) => b.id)))}>
                  {picked.size === birds.length ? 'Select none' : 'Select all'}
                </button>
                {birds.map((b) => (
                  <label key={b.id} className="check">
                    <input type="checkbox" checked={picked.has(b.id)} onChange={() => toggle(b.id)} />
                    {timeOf(b.observedAt, b.utcOffsetMin)} · {names.name(b.speciesCode)}
                  </label>
                ))}
              </>
            )}
          </fieldset>
        )}

        {exported && <div className="issue warning">⚠ This checklist was exported for eBird. Deleting it here does not remove it from eBird.</div>}
        {active && <div className="issue warning">⚠ Birding mode is on for this checklist. It will be turned off.</div>}

        <div className="row wrap">
          <button className="btn grow" onClick={onClose}>Cancel</button>
          <button
            className="btn danger grow"
            onClick={async () => {
              await deleteOuting(o.id, chosen);
              onDeleted();
            }}
          >
            {chosen.length ? `Delete checklist + ${chosen.length} ${chosen.length === 1 ? 'bird' : 'birds'}` : 'Delete checklist'}
          </button>
        </div>
      </div>
    </div>
  );
}
