import { newId, newMeta } from '../core/records';
import type { GeoPoint, Sighting, Trip } from '../core/types';
import { db, type SettingsRow } from '../db';


// ---------- settings ----------

export async function getSettings(): Promise<SettingsRow> {
  const s = await db.settings.get('main');
  if (s) return s;
  const fresh: SettingsRow = {
    key: 'main',
    deviceId: newId(),
    deviceName: guessDeviceName(),
    units: 'km',
    displayLocales: ['en'],
    defaultObservers: 1,
    theme: 'auto',
    entriesSinceBackup: 0
  };
  await db.settings.put(fresh);
  return fresh;
}

function guessDeviceName(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/iPad/.test(ua)) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac/.test(ua)) return 'Mac';
  return 'Device';
}

export async function updateSettings(changes: Partial<SettingsRow>) {
  await getSettings();
  await db.settings.update('main', changes);
}

// ---------- location: one fix per entry, never continuous tracking ----------

export function getPosition(timeoutMs = 15000): Promise<{ pos?: GeoPoint; status: Sighting['positionStatus'] }> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve({ status: 'unavailable' });
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          status: 'ok',
          pos: { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy), at: new Date(p.timestamp).toISOString() }
        }),
      (e) => resolve({ status: e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 }
    );
  });
}

// ---------- trips ----------

export async function createTrip(name: string, countryCodes: string[]): Promise<Trip> {
  const st = await getSettings();
  const t: Trip = { ...newMeta(st.deviceId), name, countryCodes };
  await db.transaction('rw', db.trips, db.settings, async () => {
    await db.trips.put(t);
    await db.settings.update('main', { activeTripId: t.id });
  });
  return t;
}

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
