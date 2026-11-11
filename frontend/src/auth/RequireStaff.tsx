import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useStaffSession } from './useStaffSession';

/**
 * Čuvar operativne zone. Red prijava, trijaža i šifarnici kontejnera i
 * posrednika su radničke rute (docs/reports-mvp.md), pa bez sesije zona nema
 * šta da prikaže — umesto niza 401 odgovora vodi na prijavu i pamti odakle.
 */
export function RequireStaff({ children }: { children: ReactNode }) {
  const session = useStaffSession();
  const location = useLocation();

  if (!session) {
    return <Navigate to="/operativa/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}
