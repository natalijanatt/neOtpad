import type { GeoPoint } from '@/domain/types';

/** Centar Pirota — podrazumevani centar mape. */
export const PIROT_CENTER: GeoPoint = { lat: 43.1528, lon: 22.586 };

/** Baza JKP (industrijska zona) — odakle kamioni kreću. */
export const DEPOT: GeoPoint = { lat: 43.1462, lon: 22.6085 };

const EARTH_RADIUS_KM = 6371;

/** Rastojanje vazdušnom linijom u kilometrima (haversine). */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Putna udaljenost je u praksi duža od vazdušne; ovaj faktor je gruba procena za seoske puteve. */
export const ROAD_FACTOR = 1.35;

export function roadDistanceKm(a: GeoPoint, b: GeoPoint): number {
  return distanceKm(a, b) * ROAD_FACTOR;
}

/**
 * Vreme vožnje u sekundama kad OSRM nije dostupan — isti model kao backend
 * (`docs/routing-heuristic.md`, `faktor_puta` × `brzina_kmh`), samo za
 * procenu vremena dolaska na mapi, ne za sam redosled stanica.
 */
export function travelTimeS(a: GeoPoint, b: GeoPoint, faktorPuta: number, brzinaKmh: number): number {
  const km = distanceKm(a, b) * faktorPuta;
  return (km / brzinaKmh) * 3600;
}
