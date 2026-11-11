import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import { divIcon, type LatLngBoundsExpression } from 'leaflet';
import { LocateFixed, MapPinned, Route, TriangleAlert } from 'lucide-react';
import { pinIcon } from '@/components/MultiMarkerMap';
import { Button } from '@/components/ui/button';
import { useGeolocation } from '@/hooks/useGeolocation';
import type { RoutePlan } from '@/data/repo';
import type { GeoPoint } from '@/domain/types';
import { formatTime } from '@/lib/format';
import { PIROT_CENTER, travelTimeS } from '@/lib/geo';
import { fetchRoadRoute, roadRouteKey } from '@/lib/osrm';

const selfIcon = (color: string) =>
  divIcon({
    className: '',
    html: `<span class="relative flex size-4">
      <span class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style="background-color: ${color}"></span>
      <span class="relative inline-flex size-4 rounded-full border-2 border-white shadow" style="background-color: ${color}"></span>
    </span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

const gpsIcon = selfIcon('var(--primary)');
const manualIcon = selfIcon('var(--warning)');

interface ClickToSetLocationProps {
  onPick: (point: GeoPoint) => void;
}

function ClickToSetLocation({ onPick }: ClickToSetLocationProps) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lon: e.latlng.lng });
    },
  });
  return null;
}

/** Koliko traje jedna stanica — stajanje plus po jedan dodatan kontejner, isti model kao backend (`docs/routing-heuristic.md`). */
function dwellMinutes(stop: RoutePlan['stajalista'][number], parametri: RoutePlan['ciljFunkcija']['parametri']): number {
  const extra = Math.max(0, stop.kontejneri.length - 1);
  return parametri.trajanje_stajanja_min + parametri.trajanje_po_kontejneru_min * extra;
}

export interface ColoredRoute {
  plan: RoutePlan;
  /** Boja ove rute — linija i markeri stanica, da se vozila razlikuju kad ih je više na mapi odjednom. */
  color: string;
}

interface RouteMapProps {
  routes: readonly ColoredRoute[];
  className?: string;
}

/**
 * Svaka ruta se crta od trenutne (ili ručno postavljene) pozicije, kroz
 * stanice po `redosled`-u sa backenda (docs/routing-heuristic.md) — bez
 * povratka na depo. Povratak na depo postoji u `plan.putanja` jer se koristi
 * za ukupnu distancu/vreme smene, ali na mapi bi zatvorio krug oko poslednje
 * stanice i delovao kao greška; za "kuda da idem da ovo pokupim" bitan je
 * samo odlazak. Sam algoritam i dalje računa cenu vazdušnom linijom
 * (haversine × faktor; OSRM kao provajder rastojanja je faza 3) — ovde se
 * samo crta preko stvarnih puteva (OSRM demo ruter), uz pad nazad na pravu
 * liniju i haversine vreme ako taj zahtev ne uspe.
 *
 * `stop.planiraniDolazak` je backend-ov plan smene (polazak u pocetak_smene,
 * npr. 06:00) — ne "kad ću ja stići ako krenem sad odavde". Zato se ovde
 * računa i druga, uživo ETA: od trenutka gledanja mape, kroz stvarni/OSRM put.
 */
export function RouteMap({ routes, className }: RouteMapProps) {
  const { position: gpsPosition, accuracyM, error: gpsError, loading: gpsLoading } = useGeolocation();
  const [manualPosition, setManualPosition] = useState<GeoPoint | null>(null);
  const [picking, setPicking] = useState(false);

  // ETA "ako krenem sada" zastari čim prođe minut gledanja u mapu, ne samo pri prvom renderu.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const position = gpsPosition ?? manualPosition;
  const isManual = !gpsPosition && manualPosition !== null;

  // Svako vozilo polazi sa iste (moje) pozicije, ali ide ka svojim stanicama —
  // otud jedan skup putnih tačaka po ruti, ne jedan zajednički put.
  const waypointsByRoute = useMemo(
    () =>
      routes.map(({ plan }) => {
        const depotStart = plan.putanja[0];
        const start = position ?? (depotStart ? { lat: depotStart.lat, lon: depotStart.lon } : undefined);
        const stops = plan.stajalista.map((s) => ({ lat: s.lat, lon: s.lon }));
        return start ? [start, ...stops] : stops;
      }),
    [routes, position],
  );

  const roadQueries = useQueries({
    queries: waypointsByRoute.map((wp) => ({
      queryKey: ['osrm-route', roadRouteKey(wp)],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchRoadRoute(wp, signal),
      enabled: wp.length > 1,
      staleTime: Infinity,
      retry: 1,
    })),
  });

  // Geometrija za crtanje + trajanje svake deonice za ETA — sa OSRM-a kad uspe,
  // inače prava linija i haversine vreme (isti model kao backend bez OSRM-a).
  const roadDataByRoute = useMemo(
    () =>
      waypointsByRoute.map((wp, i) => {
        const road = roadQueries[i]?.data;
        if (road && road.points.length > 1) return { points: road.points, legDurationsS: road.legDurationsS, isRoad: true };
        const params = routes[i]?.plan.ciljFunkcija.parametri;
        const legDurationsS = params ? wp.slice(1).map((p, k) => travelTimeS(wp[k]!, p, params.faktor_puta, params.brzina_kmh)) : [];
        return { points: wp, legDurationsS, isRoad: false };
      }),
    [waypointsByRoute, roadQueries, routes],
  );

  const routePointsByRoute = useMemo<[number, number][][]>(
    () => roadDataByRoute.map((rd) => rd.points.map((p) => [p.lat, p.lon])),
    [roadDataByRoute],
  );

  // Vreme dolaska po stanici ako se krene ovog trenutka: kumulativno vreme
  // vožnje (OSRM ili haversine) plus vreme provedeno na svakoj prethodnoj
  // stanici — isti model kao backend (docs/routing-heuristic.md), samo sa
  // "sada" umesto pocetak_smene.
  const etasByRoute = useMemo(() => {
    const now = Date.now();
    return routes.map(({ plan }, i) => {
      const legDurationsS = roadDataByRoute[i]?.legDurationsS ?? [];
      let t = now;
      return plan.stajalista.map((stop, j) => {
        t += (legDurationsS[j] ?? 0) * 1000;
        const eta = t;
        t += dwellMinutes(stop, plan.ciljFunkcija.parametri) * 60_000;
        return eta;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick postoji samo da ETA ostari sa vremenom
  }, [routes, roadDataByRoute, tick]);

  const anyFetching = roadQueries.some((q) => q.isFetching);
  const anyFallback = roadDataByRoute.some((rd, i) => (waypointsByRoute[i]?.length ?? 0) > 1 && !rd.isRoad);

  const bounds = useMemo<LatLngBoundsExpression>(() => {
    const points = routePointsByRoute.flat();
    return points.length > 0 ? points : [[PIROT_CENTER.lat, PIROT_CENTER.lon]];
  }, [routePointsByRoute]);

  const handlePick = (point: GeoPoint) => {
    setManualPosition(point);
    setPicking(false);
  };

  return (
    <div className={className}>
      <div className="relative h-full w-full overflow-hidden rounded-xl border">
        <MapContainer bounds={bounds} boundsOptions={{ padding: [32, 32] }} className="h-full w-full" attributionControl={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

          {picking ? <ClickToSetLocation onPick={handlePick} /> : null}

          {routes.map(({ plan, color }, i) => {
            const routePoints = routePointsByRoute[i] ?? [];
            const etas = etasByRoute[i] ?? [];
            return (
              <Fragment key={plan.id}>
                {routePoints.length > 1 ? <Polyline positions={routePoints} pathOptions={{ color, weight: 4, opacity: 0.85 }} /> : null}
                {plan.stajalista.map((stop, j) => (
                  <Marker key={stop.sabirnoMestoId} position={[stop.lat, stop.lon]} icon={pinIcon(color, String(stop.redosled))}>
                    <Popup>
                      <div className="min-w-40 space-y-1 text-sm">
                        <p className="font-semibold">
                          {plan.voziloOznaka} · {stop.redosled}. {stop.naziv}
                        </p>
                        <p>
                          Dolazak ako krenete sada:{' '}
                          <span className="font-medium">{etas[j] !== undefined ? formatTime(new Date(etas[j])) : '—'}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">Plan smene: {formatTime(stop.planiraniDolazak)}</p>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </Fragment>
            );
          })}

          {position ? (
            <>
              {!isManual && accuracyM ? (
                <Circle center={[position.lat, position.lon]} radius={accuracyM} pathOptions={{ color: 'var(--primary)', weight: 1, opacity: 0.3, fillOpacity: 0.08 }} />
              ) : null}
              <Marker
                position={[position.lat, position.lon]}
                icon={isManual ? manualIcon : gpsIcon}
                zIndexOffset={1000}
                draggable={isManual}
                {...(isManual
                  ? { eventHandlers: { dragend: (e) => setManualPosition({ lat: e.target.getLatLng().lat, lon: e.target.getLatLng().lng }) } }
                  : {})}
              >
                <Popup>{isManual ? 'Ručno postavljena lokacija — prevuci da doteraš' : 'Tvoja trenutna lokacija'}</Popup>
              </Marker>
            </>
          ) : null}
        </MapContainer>

        {gpsLoading ? (
          <div className="absolute top-2 left-2 z-[1000] flex items-center gap-1.5 rounded-md bg-background/90 px-2.5 py-1.5 text-xs text-muted-foreground shadow">
            <LocateFixed className="size-3.5 animate-pulse" />
            Tražim tvoju lokaciju…
          </div>
        ) : null}

        {!gpsPosition && !gpsLoading && !picking ? (
          <div className="absolute top-2 left-2 z-[1000] flex items-center gap-2 rounded-md bg-background/90 px-2.5 py-1.5 text-xs shadow">
            <TriangleAlert className="size-3.5 text-destructive" />
            <span className="text-destructive">{gpsError ?? 'Lokacija nije dostupna.'}</span>
            <Button type="button" size="xs" variant="secondary" onClick={() => setPicking(true)}>
              <MapPinned className="size-3.5" />
              {manualPosition ? 'Promeni ručno' : 'Postavi ručno'}
            </Button>
          </div>
        ) : null}

        {picking ? (
          <div className="absolute top-2 left-2 z-[1000] flex items-center gap-1.5 rounded-md bg-background/90 px-2.5 py-1.5 text-xs text-muted-foreground shadow">
            <MapPinned className="size-3.5" />
            Klikni na mapu da postaviš svoju lokaciju
          </div>
        ) : null}

        {anyFetching ? (
          <div className="absolute top-2 right-2 z-[1000] flex items-center gap-1.5 rounded-md bg-background/90 px-2.5 py-1.5 text-xs text-muted-foreground shadow">
            <Route className="size-3.5 animate-pulse" />
            Računam put…
          </div>
        ) : anyFallback ? (
          <div className="absolute top-2 right-2 z-[1000] flex items-center gap-1.5 rounded-md bg-background/90 px-2.5 py-1.5 text-xs text-muted-foreground shadow">
            <TriangleAlert className="size-3.5" />
            Ruta puta nije dostupna za bar jedno vozilo — prikazana prava linija i procenjeno vreme
          </div>
        ) : null}
      </div>
    </div>
  );
}
