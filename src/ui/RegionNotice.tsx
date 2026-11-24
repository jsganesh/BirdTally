import { useState } from 'react';
import type { GeoPoint } from '../core/types';
import { useRegion } from './useRegion';

/**
 * Says when a GPS position is outside every region of the trip, because then the unusual-bird warnings are judged
 * against the wrong place. A notice only: it never blocks or changes anything.
 */
export function RegionNotice({ position, what, tripId, onSetup }: { position?: GeoPoint; what: string; tripId?: string; onSetup?: () => void }) {
  const region = useRegion(tripId);
  const [hidden, setHidden] = useState(false);
  if (hidden || !region.outside(position)) return null;
  return (
    <div className="banner" role="status">
      <span className="grow">
        {what} is outside {region.label}, this trip’s region, so the unusual-bird warnings may not fit where you are. Check the trip’s region codes
        {onSetup ? ' in Setup' : ''} and the checklist’s country and state codes.
      </span>
      {onSetup && <button className="btn small" onClick={onSetup}>Open Setup</button>}
      <button className="btn small" onClick={() => setHidden(true)}>Dismiss</button>
    </div>
  );
}
