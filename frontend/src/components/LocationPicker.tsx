import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { divIcon, type Marker as LeafletMarker } from 'leaflet';
import { LocateFixed } from 'lucide-react';
import type { GeoPoint } from '@/domain/types';
import { Button } from '@/components/ui/button';

const pinIcon = divIcon({
  className: '',
  html: `<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 25 15 25s15-14.5 15-25C30 6.7 23.3 0 15 0z" fill="var(--primary)"/>
    <circle cx="15" cy="15" r="6" fill="white"/>
  </svg>`,
  iconSize: [30, 40],
  iconAnchor: [15, 40],
});

/** Zum za tačku sa uređaja — dovoljno blizu da se vidi kuća ili kontejner, ne samo ulica. */
const DEVICE_ZOOM = 16;

/** Odakle je tačka došla: sa uređaja (GPS) ili ju je korisnik postavio rukom. */
export type LocationSource = 'device' | 'manual';

interface ClickHandlerProps {
  onPick: (point: GeoPoint) => void;
}

function ClickHandler({ onPick }: ClickHandlerProps) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lon: e.latlng.lng });
    },
  });
  return null;
}

/**
 * `MapContainer` čita `center` samo pri montiranju, pa pin postavljen sa
 * uređaja inače završi van ekrana dok mapa i dalje gleda centar Pirota.
 */
function Recenter({ point, zoom }: { point: GeoPoint; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([point.lat, point.lon], zoom ?? map.getZoom(), { duration: 0.6 });
  }, [map, point.lat, point.lon, zoom]);
  return null;
}

/**
 * Stanje dozvole za geolokaciju. `unknown` kad Permissions API ne postoji
 * (stariji Safari / WebView) — tada se lokacija ipak zatraži, pa browser
 * sam pita.
 */
async function geolocationPermission(): Promise<PermissionState | 'unknown'> {
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state;
  } catch {
    return 'unknown';
  }
}

interface LocationPickerProps {
  value: GeoPoint;
  onChange: (point: GeoPoint, source: LocationSource) => void;
  /**
   * Odmah po montiranju uzmi lokaciju uređaja kao prvi predlog. Roditelj ovo
   * gasi čim korisnik jednom pomeri pin, da povratak na korak ne pregazi
   * ručno postavljenu tačku.
   */
  autoLocate?: boolean;
  className?: string;
}

/** Mapa sa pinom koji se pomera klikom ili prevlačenjem, plus dugme "koristi moju lokaciju". */
export function LocationPicker({ value, onChange, autoLocate = false, className }: LocationPickerProps) {
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [fromDevice, setFromDevice] = useState(false);
  // Tačka na koju mapa treba da odleti — samo kad stigne sa uređaja. Ručno
  // postavljen pin je već na ekranu i „let“ do njega bi samo smetao.
  const [flyTo, setFlyTo] = useState<GeoPoint | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const handleManual = useCallback((point: GeoPoint) => {
    setFromDevice(false);
    onChangeRef.current(point, 'manual');
  }, []);

  const handleDrag = useCallback(
    (e: { target: LeafletMarker }) => {
      const pos = e.target.getLatLng();
      handleManual({ lat: pos.lat, lon: pos.lng });
    },
    [handleManual],
  );

  const locate = useCallback((silent: boolean) => {
    if (!navigator.geolocation) {
      if (!silent) setLocateError('Geolokacija nije podržana na ovom uređaju.');
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setFromDevice(true);
        setFlyTo(point);
        onChangeRef.current(point, 'device');
        setLocating(false);
      },
      () => {
        // Automatski pokušaj bez dozvole ne sme da izgleda kao greška —
        // korisnik ništa nije tražio; ručni klik na dugme jeste.
        if (!silent) setLocateError('Nije moguće dobiti lokaciju. Postavi pin ručno.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  useEffect(() => {
    if (!autoLocate) return;
    let cancelled = false;
    void geolocationPermission().then((state) => {
      // Odbijena dozvola: ne pitamo ponovo, pin ostaje na centru i korisnik
      // ga pomera rukom. `prompt` i `unknown` puštamo — na koraku „gde je
      // problem“ pitanje za lokaciju ima smisla.
      if (cancelled || state === 'denied') return;
      locate(true);
    });
    return () => {
      cancelled = true;
    };
    // Namerno samo pri montiranju: korak se otvara jednom, a `autoLocate`
    // se menja tek kad korisnik pomeri pin, kada automatika ionako staje.
  }, []);

  const center = useMemo<[number, number]>(() => [value.lat, value.lon], [value.lat, value.lon]);

  const hint = locateError
    ? locateError
    : locating
      ? 'Tražim tvoju lokaciju…'
      : fromDevice
        ? 'Pin je na tvojoj trenutnoj lokaciji — pomeri ga ako problem nije baš tu.'
        : 'Dodirni mapu ili prevuci pin da postaviš tačnu lokaciju.';

  return (
    <div className={className}>
      <div className="relative h-56 w-full overflow-hidden rounded-xl border">
        <MapContainer center={center} zoom={14} className="h-full w-full" attributionControl={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <ClickHandler onPick={handleManual} />
          {flyTo ? <Recenter point={flyTo} zoom={DEVICE_ZOOM} /> : null}
          <Marker
            position={[value.lat, value.lon]}
            icon={pinIcon}
            draggable
            eventHandlers={{ dragend: handleDrag }}
          />
        </MapContainer>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="absolute right-2 bottom-2 z-[1000] shadow-md"
          onClick={() => locate(false)}
          disabled={locating}
        >
          <LocateFixed className={locating ? 'animate-pulse' : ''} />
          {locating ? 'Tražim lokaciju…' : 'Moja lokacija'}
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
