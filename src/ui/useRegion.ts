import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { isUnusual, outsideRegions, regionSpecies } from '../core/region';
import type { GeoBounds, GeoPoint } from '../core/types';
import { db } from '../db';
import { useSettings, useTaxonomy } from './hooks';

/** The active trip's regional species lists, and what they say about a bird. Off (never unusual) without lists. */
export function useRegion(tripId?: string) {
  const settings = useSettings();
  const { taxa } = useTaxonomy();
  const data = useLiveQuery(async () => {
    const id = tripId ?? settings?.activeTripId;
    const trip = id ? await db.trips.get(id) : undefined;
    if (!trip) return undefined;
    const lists = new Map<string, string[]>();
    const boxes: (GeoBounds | null | undefined)[] = [];
    for (const r of trip.countryCodes) {
      const l = await db.tripLists.get(r);
      if (l) lists.set(r, l.codes);
      boxes.push(l?.bounds);
    }
    const flagged = await db.sightings.where('tripId').equals(trip.id).filter((s) => !s.deleted && !!s.unusualHere && !!s.speciesCode).toArray();
    return { regions: trip.countryCodes, lists, boxes, confirmed: new Set(flagged.map((s) => s.speciesCode!)) };
  }, [tripId ?? settings?.activeTripId]);

  return useMemo(() => {
    const species = data ? regionSpecies(data.regions, data.lists) : undefined;
    const unusual = (code?: string) => !!code && isUnusual(taxa.get(code), species);
    return {
      active: !!species,
      label: data?.regions.join(', ') ?? '',
      /** The position is outside every region of the trip. False whenever that cannot be known. */
      outside: (p?: GeoPoint) => !!p && !!data && outsideRegions(p, data.boxes),
      unusual,
      /** Unusual and not already recorded as unusual on this trip: worth stopping the user to confirm. */
      needsConfirm: (code: string) => unusual(code) && !data?.confirmed.has(code)
    };
  }, [data, taxa]);
}
