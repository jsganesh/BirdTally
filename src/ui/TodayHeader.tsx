import { gpsLabel } from '../core/day';
import { currentOffsetMin } from '../core/geotime';
import type { Outing, Sighting } from '../core/types';
import { updateOuting } from '../store';
import { DraftField } from './DraftField';
import { Hint } from './Hint';
import { dayLabel } from './util';

/**
 * Day, date and place, as a paper day list starts. The place can be typed while Birding mode is on; otherwise it is
 * named when the checklist is reviewed.
 */
export function TodayHeader({ outing, newest }: { outing?: Outing; newest?: Sighting }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="row wrap" style={{ gap: 8 }}>
        <strong>{dayLabel(new Date().toISOString(), currentOffsetMin())}</strong>
        <span className="muted small">{gpsLabel(newest)}</span>
      </div>
      {outing ? (
        <label className="field">
          <span className="visually-hidden">Place</span>
          <DraftField stored={outing.locationName ?? ''} placeholder="Where are you? e.g. Kumarakom, lake trail" onSave={(v) => updateOuting(outing.id, { locationName: v.trim() || undefined })} />
        </label>
      ) : (
        <span className="muted small">Place named when you review the checklist</span>
      )}
      <Hint>Date, time and GPS are saved with every entry automatically.</Hint>
    </div>
  );
}
