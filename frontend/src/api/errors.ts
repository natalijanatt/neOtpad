/**
 * Greške HTTP sloja u jednom obliku. Ugovor za greške ne opisuje telo, pa se
 * poruka za korisnika izvodi iz statusa, a tekst backenda se koristi samo kad
 * stvarno postoji.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** 409 na trijaži znači da je neko drugi već izmenio prijavu (polje `verzija`). */
export const isConflict = (e: unknown): boolean => e instanceof ApiError && e.status === 409;

export const isUnauthorized = (e: unknown): boolean => e instanceof ApiError && e.status === 401;

const STATUS_MESSAGE: Record<number, string> = {
  400: 'Podaci nisu prihvaćeni.',
  401: 'Sesija je istekla — prijavi se ponovo.',
  403: 'Nalog nema ovlašćenje za ovu radnju.',
  404: 'Traženi podatak ne postoji.',
  409: 'Prijavu je u međuvremenu izmenio neko drugi — osveži i pokušaj ponovo.',
  // Upload fotografije: granicu i tip određuje backend po sadržaju fajla, ne
  // po ekstenziji (docs/media-storage.md), pa poruka ne sme da obećava više.
  413: 'Fotografija je prevelika — najviše 8 MB.',
  415: 'Fajl nije prihvaćena slika. Dozvoljeni su JPEG, PNG, WebP i HEIC.',
  422: 'Podaci nisu prihvaćeni.',
  429: 'Previše pokušaja — sačekaj pa probaj ponovo.',
  500: 'Greška na serveru.',
  503: 'Servis trenutno nije dostupan.',
};

function messageFrom(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const { message } = body as { message: unknown };
    if (typeof message === 'string' && message.trim()) return message;
    // Nest validacija vraća listu poruka; prva je dovoljna za toast.
    if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  }
  return STATUS_MESSAGE[status] ?? `Greška ${status}.`;
}

/**
 * Pretvara odgovor openapi-fetch-a u vrednost ili grešku, da React Query ima
 * jasno „uspeh/greška“ umesto `data === undefined`.
 */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.data !== undefined) return result.data;
  throw new ApiError(result.response.status, messageFrom(result.error, result.response.status), result.error);
}

/**
 * Ključ za `Idempotency-Key`: obe rute za slanje prijave ga traže, a ponovljeni
 * pokušaj sa istim ključem vraća istu potvrdu umesto druge prijave
 * (docs/reports-mvp.md).
 */
export function idempotencyKey(): string {
  // Stariji pregledači (i neki WebView-i na starijim Androidima) nemaju
  // randomUUID; prijava sa sela ne sme da padne zbog toga.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
