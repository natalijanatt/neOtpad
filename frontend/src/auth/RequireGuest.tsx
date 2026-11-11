import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useStaffSession } from './useStaffSession';

/**
 * Obrnuto od `RequireStaff`: prijava je ekran za nekoga bez sesije. Ako token
 * već postoji, forma nema šta da radi — vodi nazad u operativu umesto da
 * ponudi ponovnu prijavu.
 */
export function RequireGuest({ children }: { children: ReactNode }) {
  const session = useStaffSession();
  if (session) return <Navigate to="/operativa" replace />;
  return <>{children}</>;
}
