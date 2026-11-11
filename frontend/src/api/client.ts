import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './generated/schema';
import { clearSession, readSession } from '@/auth/session';

/**
 * The only HTTP client in this app.
 *
 * Its types come from src/api/generated/schema.ts, which is generated from
 * contracts/openapi.json. Paths, methods, request bodies and response shapes
 * are all checked against the contract at compile time, so an endpoint that
 * does not exist on the backend does not compile here.
 *
 * Default base URL is the Prism mock on 4010, so the app runs with no backend
 * on the machine. Point VITE_API_BASE_URL at a real server to switch.
 */
const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4010';

/**
 * Bearer token za radničke rute. Ugovor označava zaštićene operacije
 * (`security: bearer`), ali openapi-fetch ne postavlja zaglavlje sam, pa ga
 * dodaje ovaj middleware — jedno mesto umesto po pozivu.
 */
const auth: Middleware = {
  onRequest({ request }) {
    // Prijava nosi lozinku, ne token; slanje isteklog tokena uz nju samo
    // zbunjuje backend logove.
    if (request.url.endsWith('/auth/login')) return request;
    const session = readSession();
    if (session) request.headers.set('Authorization', `Bearer ${session.accessToken}`);
    return request;
  },
  onResponse({ response }) {
    // Token traje 30 minuta i nema refresh: 401 znači da je sesija gotova, pa
    // se briše odmah da UI ponudi prijavu umesto niza neuspelih poziva.
    if (response.status === 401) clearSession();
    return response;
  },
};

export const api = createClient<paths>({ baseUrl });
api.use(auth);
