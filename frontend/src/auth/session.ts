import type { Staff } from '@/domain/types';

/**
 * Sesija radnika JKP-a. Backend izdaje JWT koji traje 30 minuta i nema refresh
 * token (docs/reports-mvp.md), pa se čuva samo pristupni token i trenutak
 * isteka — kad istekne, operater se prijavljuje ponovo.
 *
 * Token stoji u `localStorage` da osvežavanje stranice ne izbaci dispečera iz
 * reda prijava usred smene. To je svesna razmena: XSS bi mu došao do tokena,
 * ali aplikacija nema drugog mesta za njega dok backend ne izda kolačić.
 */
export interface StaffSession {
  accessToken: string;
  /** Epoch ms; računa se iz `expiresIn` u trenutku prijave. */
  expiresAt: number;
  staff: Staff | null;
}

/**
 * Ključ nosi verziju šeme (`client-localstorage-schema`): kad se oblik sesije
 * promeni, stari zapis se ignoriše umesto da se čita kao da je nov. Čuva se
 * samo ono što UI stvarno treba — token, istek i ime/uloga za sidebar.
 */
const STORAGE_KEY = 'neotpad.staff-session:v1';

let cached: StaffSession | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function parse(raw: string | null): StaffSession | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StaffSession>;
    if (typeof value.accessToken !== 'string' || typeof value.expiresAt !== 'number') return null;
    return { accessToken: value.accessToken, expiresAt: value.expiresAt, staff: value.staff ?? null };
  } catch {
    return null;
  }
}

/**
 * Trenutna sesija, ili `null` ako je nema ili je istekla. Snapshot je keširan
 * jer ga čita i `useSyncExternalStore`, koji traži stabilnu referencu.
 */
export function readSession(): StaffSession | null {
  if (!loaded) {
    cached = parse(safeRead());
    loaded = true;
  }
  if (cached && cached.expiresAt <= Date.now()) {
    cached = null;
    safeWrite(null);
  }
  return cached;
}

export function saveSession(session: StaffSession): void {
  cached = session;
  loaded = true;
  safeWrite(session);
  emit();
}

export function clearSession(): void {
  if (!loaded && !safeRead()) return;
  cached = null;
  loaded = true;
  safeWrite(null);
  emit();
}

/** Dopunjava sesiju odgovorom `GET /auth/me` bez nove prijave. */
export function attachStaff(staff: Staff): void {
  const current = readSession();
  if (!current || current.staff?.id === staff.id) return;
  saveSession({ ...current, staff });
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Privatni prozor ili blokirani kolačići bacaju na pristup storage-u; sesija
// tada živi samo u memoriji umesto da cela aplikacija padne.
function safeRead(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function safeWrite(session: StaffSession | null): void {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* sesija ostaje u memoriji */
  }
}
