import type { GeoPoint } from './types';

export const KM_PER_MILE = 1.609344;

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371.0088;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Local wall-clock parts for an instant, using the offset recorded with it. */
export function localParts(iso: string, utcOffsetMin: number) {
  const d = new Date(new Date(iso).getTime() + utcOffsetMin * 60_000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes()
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD in the recorded local time. */
export function localDateKey(iso: string, utcOffsetMin: number): string {
  const p = localParts(iso, utcOffsetMin);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** eBird import date: MM/DD/YYYY. */
export function ebirdDate(iso: string, utcOffsetMin: number): string {
  const p = localParts(iso, utcOffsetMin);
  return `${pad(p.month)}/${pad(p.day)}/${p.year}`;
}

/** eBird import time: 24-hour HH:mm. */
export function ebirdTime(iso: string, utcOffsetMin: number): string {
  const p = localParts(iso, utcOffsetMin);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function localTimeLabel(iso: string, utcOffsetMin: number): string {
  const p = localParts(iso, utcOffsetMin);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Offset (minutes east of UTC) of the device's zone right now. */
export function currentOffsetMin(date = new Date()): number {
  return -date.getTimezoneOffset();
}

export function currentZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function minutesBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000);
}

/** Largest distance between any two points: a lower bound for distance travelled. */
export function spanKm(points: GeoPoint[]): number {
  let max = 0;
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) max = Math.max(max, haversineKm(points[i], points[j]));
  return max;
}

export function formatDistance(km: number, units: 'km' | 'mi'): string {
  return units === 'mi' ? `${(km / KM_PER_MILE).toFixed(2)} mi` : `${km.toFixed(2)} km`;
}
