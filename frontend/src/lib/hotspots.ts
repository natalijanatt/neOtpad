/**
 * Skor rizika žarišta.
 *
 * Ranije je živeo u `scripts/build-hotspots.mjs`, koji je pravio mock direktno
 * iz CSV-a. Sad podaci dolaze sa `GET /dumps`, ali skor ostaje ovde jer je
 * privremen: prava težina računa se u `app.rizik`, koji još niko ne puni. Dok se
 * to ne desi, mapa boji i dimenzioniše po ovoj heuristici, istoj onoj po kojoj
 * je izgledala i sa mock podacima.
 *
 * Svođenje `status` teksta na pet stanja više NIJE ovde — backend ga vraća kao
 * `stanje`, jer isti izraz filtrira šta je aktivno; dve implementacije bi se
 * razišle.
 */
import type { HotspotRecurrence, HotspotStatus } from '@/domain/types';

/**
 * Skor 0–100 od ponavljanja, dužine serije i skorašnjosti.
 *
 * Očišćeno i u sanaciji imaju plafon: lokacija koja se upravo sanira ne sme da
 * ispadne najhitnija na mapi samo zato što je dugo evidentirana.
 */
export function hotspotRiskScore(input: {
  recurs: HotspotRecurrence;
  years: number[];
  lastSeen: number;
  status: HotspotStatus;
}): number {
  const { recurs, years, lastSeen, status } = input;
  let score = recurs === 'da' ? 40 : recurs === 'nepoznato' ? 20 : 5;
  score += Math.min(years.length * 8, 30);
  if (lastSeen >= 2025) score += 20;
  else if (lastSeen === 2024) score += 15;
  else if (lastSeen === 2023) score += 10;
  if (status === 'aktivna' || status === 'prijavljeno') score += 10;
  if (status === 'ocisceno') score = Math.min(score, 35);
  if (status === 'u_sanaciji') score = Math.min(score, 30);
  return Math.min(score, 100);
}
