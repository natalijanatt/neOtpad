import { useEffect, useState } from 'react';
import type { GeoPoint } from '@/domain/types';

interface GeolocationState {
  position: GeoPoint | null;
  /** Poluprečnik pouzdanosti u metrima, iz `GeolocationCoordinates.accuracy`. */
  accuracyM: number | null;
  error: string | null;
  loading: boolean;
}

/**
 * Živa pozicija uređaja dok je komponenta prikazana — vozač na terenu se
 * pomera, pa `watchPosition` umesto jednokratnog očitavanja.
 */
export function useGeolocation(): GeolocationState {
  const [state, setState] = useState<GeolocationState>({ position: null, accuracyM: null, error: null, loading: true });

  useEffect(() => {
    if (!navigator.geolocation) {
      setState({ position: null, accuracyM: null, error: 'Geolokacija nije podržana na ovom uređaju.', loading: false });
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setState({
          position: { lat: pos.coords.latitude, lon: pos.coords.longitude },
          accuracyM: pos.coords.accuracy,
          error: null,
          loading: false,
        });
      },
      (err) => {
        setState((s) => ({ ...s, error: err.message || 'Nije moguće dobiti lokaciju.', loading: false }));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 5_000 },
    );

    return () => navigator.geolocation.clearWatch(id);
  }, []);

  return state;
}
