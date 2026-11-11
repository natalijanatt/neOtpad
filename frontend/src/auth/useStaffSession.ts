import { useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import type { Staff } from '@/domain/types';
import { attachStaff, clearSession, readSession, saveSession, subscribe, type StaffSession } from './session';

/** Trenutna sesija; komponente se same osvežavaju posle prijave i odjave. */
export function useStaffSession(): StaffSession | null {
  return useSyncExternalStore(subscribe, readSession, () => null);
}

export const useIsStaff = (): boolean => useStaffSession() !== null;

/**
 * Ime i uloga ulogovanog radnika. Sesija ih pamti posle prijave, pa je poziv
 * `GET /auth/me` ovde samo provera da token još važi — 401 middleware u
 * `api/client.ts` pretvara u odjavu.
 */
export function useCurrentStaff() {
  const session = useStaffSession();
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async (): Promise<Staff> => {
      const staff = unwrap(await api.GET('/auth/me'));
      attachStaff(staff);
      return staff;
    },
    enabled: session !== null,
    initialData: session?.staff ?? undefined,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export interface Credentials {
  email: string;
  password: string;
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, password }: Credentials): Promise<Staff | null> => {
      const token = unwrap(await api.POST('/auth/login', { body: { email, password } }));
      saveSession({
        accessToken: token.accessToken,
        // Minut rezerve: poziv poslat u poslednjoj sekundi važenja stiže sa
        // isteklim tokenom i vraća 401 usred radnje.
        expiresAt: Date.now() + Math.max(token.expiresIn - 60, 60) * 1000,
        staff: null,
      });
      const me = await api.GET('/auth/me');
      if (me.data) attachStaff(me.data);
      return me.data ?? null;
    },
    onSuccess: () => {
      // Red prijava je bio prazan dok nije bilo tokena.
      void client.invalidateQueries();
    },
  });
}

export function useLogout() {
  const client = useQueryClient();
  return () => {
    clearSession();
    client.removeQueries({ queryKey: ['reports'] });
    client.removeQueries({ queryKey: ['auth'] });
  };
}
