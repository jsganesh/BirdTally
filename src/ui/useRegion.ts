import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { isUnusual, regionSpecies } from '../core/region';
import { db } from '../db';
import { useSettings, useTaxonomy } from './hooks';

/** The active trip's regional species lists, and what they say about a bird. Off (never unusual) without lists. */
export function useRegion() {
  const settings = useSettings();
  const { taxa } = useTaxonomy();
  const data = useLiveQuery(async () => {
    const trip = settings?.activeTripId ? await db.trips.get(settings.activeTripId) : undefined;
    if (!trip) return undefined;
    const lists = new Map<string, string[]>();
    for (const r of trip.countryCodes) {
      const l = await db.tripLists.get(r);
      if (l) lists.set(r, l.codes);
    }
    const flagged = await db.sightings.where('tripId').equals(trip.id).filter((s) => !s.deleted && !!s.unusualHere && !!s.speciesCode).toArray();
    return { regions: trip.countryCodes, lists, confirmed: new Set(flagged.map((s) => s.speciesCode!)) };
  }, [settings?.activeTripId]);

  return useMemo(() => {
    const species = data ? regionSpecies(data.regions, data.lists) : undefined;
    const unusual = (code?: string) => !!code && isUnusual(taxa.get(code), species);
    return {
      active: !!species,
      label: data?.regions.join(', ') ?? '',
      unusual,
      /** Unusual and not already recorded as unusual on this trip: worth stopping the user to confirm. */
      needsConfirm: (code: string) => unusual(code) && !data?.confirmed.has(code)
    };
  }, [data, taxa]);
}
