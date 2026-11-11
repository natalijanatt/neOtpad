import type { GeoPoint } from '@/domain/types';

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

/**
 * React-query ključ za rutu kroz ove tačke — zaokruženo na ~100m. Startna
 * tačka je često živa GPS pozicija (`watchPosition`), koja se pomera i za par
 * metara na svaki otkucaj; bez ovog zaokruživanja bi svaki GPS šum tražio nov
 * zahtev od javnog OSRM servera dok se kamion kreće.
 */
export function roadRouteKey(points: readonly GeoPoint[]): string {
  return points.map((p) => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`).join(';');
}

export interface RoadRoute {
  points: GeoPoint[];
  /** Trajanje svake deonice u sekundama — legDurationsS[i] je od points-ulaza[i] do [i+1], isti redosled kao zahtev. */
  legDurationsS: number[];
}

/**
 * Stvarna geometrija puta kroz zadate tačke, tim redom — kamion mora putem,
 * ne vazdušnom linijom. Javni OSRM demo server, samo za crtanje i procenu
 * vremena dolaska; sam algoritam rutiranja i dalje računa haversine za
 * trošak/redosled (docs/routing-heuristic.md — OSRM kao provajder rastojanja
 * je faza 3). `null` znači da zahtev nije uspeo; pozivalac tad crta pravu
 * liniju i računa vreme haversine formulom.
 */
export async function fetchRoadRoute(points: readonly GeoPoint[], signal?: AbortSignal): Promise<RoadRoute | null> {
  if (points.length < 2) return null;
  const coords = points.map((p) => `${p.lon},${p.lat}`).join(';');
  const res = await fetch(`${OSRM_BASE}/${coords}?overview=full&geometries=geojson`, signal ? { signal } : {});
  if (!res.ok) return null;
  const body = (await res.json()) as {
    routes?: Array<{ geometry?: { coordinates?: [number, number][] }; legs?: Array<{ duration?: number }> }>;
  };
  const route = body.routes?.[0];
  const coordinates = route?.geometry?.coordinates;
  if (!coordinates || coordinates.length < 2) return null;
  const legs = route?.legs ?? [];
  // Broj deonica mora da prati broj ulaznih tačaka, ne broj tačaka u geometriji
  // (geometrija ima puno više tačaka duž puta) — inače se ETA po stanici pomeri.
  if (legs.length !== points.length - 1) return null;
  return {
    points: coordinates.map(([lon, lat]) => ({ lat, lon })),
    legDurationsS: legs.map((l) => l.duration ?? 0),
  };
}
