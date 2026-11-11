import type { GeoPoint, Id, Settlement } from '@/domain/types';
import { settlements } from '@/data/mock/settlements';
import { distanceKm } from './geo';

/** Najbliže naselje datoj tački — koristi se za lokaciju u čarobnjaku za prijavu. */
export function nearestSettlement(point: GeoPoint): Settlement {
  let best = settlements[0]!;
  let bestDistance = distanceKm(point, best);
  for (const s of settlements) {
    const d = distanceKm(point, s);
    if (d < bestDistance) {
      bestDistance = d;
      best = s;
    }
  }
  return best;
}

export function settlementName(id: Id | null | undefined): string {
  if (!id) return '';
  return settlements.find((s) => s.id === id)?.name ?? '';
}
