/**
 * Normalizuje srpski tekst za pretragu: skida dijakritike i menja slova sa
 * kvačicom/repom (č, ć, ž, š, đ) u latinicu bez njih, da pretraga radi bez
 * obzira da li je korisnik otkucao dijakritike.
 */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'dj')
    .replace(/Đ/g, 'Dj')
    .toLowerCase();
}

export function matchesQuery(haystacks: string[], query: string): boolean {
  const q = normalizeSearch(query.trim());
  if (!q) return true;
  return haystacks.some((h) => normalizeSearch(h).includes(q));
}
