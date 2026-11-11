import { useMemo } from 'react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import { divIcon, type LatLngBoundsExpression } from 'leaflet';
import type { ReactNode } from 'react';
import type { GeoPoint } from '@/domain/types';
import { PIROT_CENTER } from '@/lib/geo';

export interface MapMarkerItem {
  id: string;
  point: GeoPoint;
  /** Boja markera — token iz globals.css, npr. "var(--primary)". */
  color?: string;
  popup?: ReactNode;
}

/** Pin u zadatoj boji (CSS vrednost ili var()); `label` je kratak tekst u krugu, npr. procenat. */
export const pinIcon = (color: string, label?: string, size = 26) => {
  const h = Math.round(size * (40 / 30));
  return divIcon({
    className: '',
    html: `<svg width="${size}" height="${h}" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 25 15 25s15-14.5 15-25C30 6.7 23.3 0 15 0z" fill="${color}"/>
      <circle cx="15" cy="15" r="${label ? 9 : 6}" fill="white"/>
      ${label ? `<text x="15" y="18" text-anchor="middle" font-family="sans-serif" font-size="9" font-weight="700" fill="#222">${label}</text>` : ''}
    </svg>`,
    iconSize: [size, h],
    iconAnchor: [size / 2, h],
    popupAnchor: [0, -h + 4],
  });
};

const markerIcon = (color: string) => pinIcon(color);

interface MultiMarkerMapProps {
  markers: MapMarkerItem[];
  className?: string;
  /** Centar kad nema markera ili se ne uklapaju u granice. */
  fallbackCenter?: GeoPoint;
}

/** Mapa sa više markera i popup-ima — za mesta za odlaganje, žarišta, kontejnere. */
export function MultiMarkerMap({ markers, className, fallbackCenter = PIROT_CENTER }: MultiMarkerMapProps) {
  // Jedan marker bi dao degenerisane granice (Leaflet zumira do maksimuma), pa se tada centrira.
  const bounds = useMemo<LatLngBoundsExpression | undefined>(() => {
    if (markers.length < 2) return undefined;
    return markers.map((m) => [m.point.lat, m.point.lon] as [number, number]);
  }, [markers]);
  const single = markers.length === 1 ? markers[0] : undefined;

  return (
    <div className={className}>
      <MapContainer
        {...(bounds
          ? { bounds, boundsOptions: { padding: [24, 24] } }
          : single
            ? { center: [single.point.lat, single.point.lon] as [number, number], zoom: 15 }
            : { center: [fallbackCenter.lat, fallbackCenter.lon] as [number, number], zoom: 13 })}
        className="h-full w-full"
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {markers.map((m) => (
          <Marker key={m.id} position={[m.point.lat, m.point.lon]} icon={markerIcon(m.color ?? 'var(--primary)')}>
            {m.popup ? <Popup>{m.popup}</Popup> : null}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
