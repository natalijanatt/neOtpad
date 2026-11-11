import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowLeft,
  Container as ContainerIcon,
  Flame,
  Globe,
  History,
  MapPin,
  MessageCircle,
  MessageSquare,
  Package,
  Phone,
  Smartphone,
  Sparkles,
  Users,
} from 'lucide-react';
import { MultiMarkerMap, type MapMarkerItem } from '@/components/MultiMarkerMap';
import { ClassificationCard } from '@/components/ClassificationCard';
import { ReportPhotos } from '@/components/ReportPhotos';
import { ReportTimeline } from '@/components/ReportTimeline';
import { PriorityPill, ReportStatusPill } from '@/components/StatusPill';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useContainerOptions,
  useHotspots,
  useIntermediaries,
  useLookupNames,
  useClassifyReport,
  useRemoveReportPhoto,
  useReport,
  useReports,
  useSettlementOptions,
} from '@/data/queries';
import type { Hotspot, ReportChannel } from '@/domain/types';
import { formatDateTime, formatRelative } from '@/lib/format';
import { distanceKm } from '@/lib/geo';
import {
  HOTSPOT_STATUS_LABEL,
  LOCATION_PRECISION_LABEL,
  REPORT_ACTION_LABEL,
  REPORT_CHANNEL_LABEL,
  REPORT_SIZE_LABEL,
  REPORT_TYPE_LABEL,
} from '@/lib/labels';
import { feedbackPath, freshProposal, isLocationMeasured, isOpenReport, isTextOnlyChannel, priorityOf, reportPoint } from '@/lib/reports';
import { ReportActions } from './ReportActions';

const HOTSPOT_RADIUS_KM = 1;
const NEARBY_REPORT_RADIUS_KM = 0.5;

const CHANNEL_ICON: Record<ReportChannel, typeof Globe> = {
  sms: MessageSquare,
  viber: MessageCircle,
  web: Globe,
  mobilna: Smartphone,
  telefon: Phone,
  posrednik: Users,
};

export function OpsReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: report, isPending, isError, error } = useReport(id ?? '');
  const { data: allReports } = useReports({ status: 'otvorene' });
  const { data: hotspots } = useHotspots();
  const settlements = useSettlementOptions();
  const intermediaries = useIntermediaries();
  const containers = useContainerOptions(report?.naselje_id ?? undefined);
  const removePhoto = useRemoveReportPhoto();
  const classify = useClassifyReport();

  const settlementName = useLookupNames(settlements.data);
  const intermediaryName = useLookupNames(intermediaries.data);
  const containerName = useLookupNames(containers.data);

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 rounded-xl lg:col-span-2" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError || !report) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/operativa/prijave">
            <ArrowLeft /> Prijave
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">{error?.message ?? 'Prijava nije pronađena.'}</p>
      </div>
    );
  }

  const point = reportPoint(report);
  const measured = isLocationMeasured(report);

  // Bez koordinate nema ni rastojanja: centroid naselja ne sme da glumi tačku
  // problema (ista zamka kao `geo_preciznost` u docs/data-sources.md).
  const nearbyHotspots: Array<{ hotspot: Hotspot; d: number }> = point
    ? (hotspots ?? [])
        .map((hotspot) => ({ hotspot, d: distanceKm(hotspot, point) }))
        .filter(({ d }) => d <= HOTSPOT_RADIUS_KM)
        .sort((a, b) => a.d - b.d)
        .slice(0, 4)
    : [];

  const nearbyReports = point
    ? (allReports ?? [])
        .filter((r) => {
          const p = reportPoint(r);
          return r.id !== report.id && p !== null && distanceKm(p, point) <= NEARBY_REPORT_RADIUS_KM;
        })
        .sort((a, b) => new Date(b.primljena_at).getTime() - new Date(a.primljena_at).getTime())
        .slice(0, 5)
    : (allReports ?? []).filter((r) => r.id !== report.id && r.naselje_id === report.naselje_id).slice(0, 5);

  const markers: MapMarkerItem[] = [
    ...(point ? [{ id: report.id, point, color: 'var(--priority-critical)', popup: <b>{report.kratki_kod}</b> }] : []),
    ...nearbyHotspots.map(({ hotspot }) => ({
      id: hotspot.id,
      point: hotspot,
      color: 'var(--warning)',
      popup: (
        <span>
          <b>Žarište {hotspot.id}</b> · {hotspot.name}
        </span>
      ),
    })),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon-sm">
          <Link to="/operativa/prijave">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">
            {REPORT_TYPE_LABEL[report.tip]} <span className="font-normal text-muted-foreground">· {report.kratki_kod}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {settlementName(report.naselje_id) || 'Naselje nije određeno'} · primljeno {formatRelative(report.primljena_at)} ·
            verzija {report.verzija}
          </p>
        </div>
        <ReportStatusPill status={report.status} className="h-7 px-3 text-sm" />
        <PriorityPill priority={priorityOf(report)} className="h-7 px-3 text-sm" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="gap-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <ReportPhotos
                photos={report.fotografije}
                emptyText={isTextOnlyChannel(report.kanal) ? `${REPORT_CHANNEL_LABEL[report.kanal]} ne nosi fotografiju` : 'Bez fotografije'}
                onRemove={(photo, razlog) =>
                  removePhoto.mutateAsync(
                    { id: report.id, fotoId: photo.id, razlog },
                    {
                      onSuccess: () => toast.success('Fotografija je uklonjena', { description: 'Razlog je zabeležen u toku prijave.' }),
                      onError: (error) => toast.error('Fotografija nije uklonjena', { description: error.message }),
                    },
                  )
                }
              />
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Opis prijave</p>
                  <p className="text-pretty">{report.opis ?? 'Bez opisa — prijava nosi samo tip i lokaciju.'}</p>
                </div>
                <Row
                  icon={CHANNEL_ICON[report.kanal]}
                  label="Kanal prijave"
                  value={REPORT_CHANNEL_LABEL[report.kanal]}
                  hint={report.posrednik_id ? intermediaryName(report.posrednik_id) || 'Preko posrednika' : feedbackPath(report)}
                />
                <Row
                  icon={MapPin}
                  label="Lokacija"
                  value={
                    point
                      ? `${point.lat.toFixed(report.preciznost_lokacije === 'gps' ? 5 : 4)}, ${point.lon.toFixed(report.preciznost_lokacije === 'gps' ? 5 : 4)}`
                      : settlementName(report.naselje_id) || 'Nepoznata'
                  }
                  hint={
                    report.opis_lokacije ??
                    (report.preciznost_lokacije === 'gps'
                      ? settlementName(report.naselje_id)
                      : `${LOCATION_PRECISION_LABEL[report.preciznost_lokacije]} — tačka je približna`)
                  }
                />
                {report.velicina ? <Row icon={Package} label="Procenjena veličina" value={REPORT_SIZE_LABEL[report.velicina]} /> : null}
                {report.tip_obrade ? (
                  <Row
                    icon={Sparkles}
                    label="Odluka operative"
                    value={REPORT_ACTION_LABEL[report.tip_obrade]}
                    {...(report.potvrdjena_at ? { hint: `potvrđeno ${formatRelative(report.potvrdjena_at)}` } : {})}
                  />
                ) : null}
              </div>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="gap-3 p-5">
              <div className="flex items-center gap-2">
                <Flame className="size-4 text-warning-foreground" />
                <p className="font-medium">Žarišta u blizini</p>
                <span className="text-xs text-muted-foreground">do {HOTSPOT_RADIUS_KM} km</span>
              </div>
              {!point ? (
                <p className="rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground text-pretty">
                  Prijava nema koordinatu ({LOCATION_PRECISION_LABEL[report.preciznost_lokacije].toLowerCase()}) — rastojanje se
                  ne računa.
                </p>
              ) : !measured ? (
                <p className="rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground text-pretty">
                  Lokacija nije izmerena ({LOCATION_PRECISION_LABEL[report.preciznost_lokacije].toLowerCase()}) — rastojanja su
                  orijentaciona.
                </p>
              ) : null}
              {nearbyHotspots.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {point ? 'Nema evidentiranih divljih deponija u blizini — nova lokacija.' : 'Nema podatka.'}
                </p>
              ) : (
                <ul className="divide-y">
                  {nearbyHotspots.map(({ hotspot, d }) => (
                    <li key={hotspot.id} className="py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-medium">
                          {hotspot.id} <span className="font-normal text-muted-foreground">· {hotspot.name}</span>
                        </p>
                        <span className="shrink-0 text-xs text-muted-foreground">{Math.round(d * 1000)} m</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {hotspot.yearsRecorded.length} god. evidentirano ({hotspot.firstSeenYear}–{hotspot.lastSeenYear}) ·{' '}
                        {HOTSPOT_STATUS_LABEL[hotspot.status]}
                        {hotspot.recurs === 'da' ? ' · ponavlja se' : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">Istorijski podaci o divljim deponijama — lokalni skup, van ugovora.</p>
            </Card>

            <Card className="gap-3 p-5">
              <div className="flex items-center gap-2">
                <History className="size-4 text-muted-foreground" />
                <p className="font-medium">{point ? 'Druge prijave sa lokacije' : 'Druge otvorene prijave iz naselja'}</p>
                {point ? <span className="text-xs text-muted-foreground">do {NEARBY_REPORT_RADIUS_KM * 1000} m</span> : null}
              </div>
              {nearbyReports.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nema drugih otvorenih prijava.</p>
              ) : (
                <ul className="divide-y">
                  {nearbyReports.map((r) => (
                    <li key={r.id}>
                      <Link to={`/operativa/prijave/${r.id}`} className="flex items-center gap-3 py-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{REPORT_TYPE_LABEL[r.tip]}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {r.kratki_kod} · {formatRelative(r.primljena_at)}
                          </p>
                        </div>
                        <ReportStatusPill status={r.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {nearbyReports.some(isOpenReport) ? (
                <p className="flex items-center gap-1.5 text-xs text-priority-high">
                  <AlertTriangle className="size-3.5" /> Postoji još otvorenih prijava — proveri duplikat pre potvrde.
                </p>
              ) : null}
            </Card>
          </div>

          {markers.length > 0 ? <MultiMarkerMap className="h-72 overflow-hidden rounded-xl border" markers={markers} /> : null}
        </div>

        <div className="space-y-4">
          {/* Nova verzija prijave znači da su obrada, prioritet i kontejner
              drugačiji nego kad je panel montiran — ključ resetuje lokalna
              polja umesto da dispečer gleda vrednosti od pre izmene. */}
          <ReportActions key={`${report.id}-${report.verzija}`} report={report} />

          <ClassificationCard
            klasifikacija={report.klasifikacija}
            sveza={freshProposal(report) !== null}
            onReclassify={() => {
              classify.mutate(report.id, {
                onSuccess: (k) =>
                  toast.success('Prijava je ponovo klasifikovana', {
                    description: k.nadlezna_sluzba,
                  }),
                onError: (e: Error) => toast.error('Klasifikacija nije uspela', { description: e.message }),
              });
            }}
            busy={classify.isPending}
          />

          <Card className="gap-3 p-5">
            <div className="flex items-center gap-2">
              <ContainerIcon className="size-4 text-muted-foreground" />
              <p className="font-medium">Povezani kontejner</p>
            </div>
            {!report.kontejner_id ? (
              <p className="text-sm text-muted-foreground">
                Prijava nije vezana za kontejner. Odvoz traži kontejner — veži ga pri potvrdi ili izaberi čišćenje.
              </p>
            ) : (
              <div className="space-y-1 rounded-lg border p-3">
                <p className="text-sm font-medium">{containerName(report.kontejner_id) || 'Kontejner iz šifarnika'}</p>
                <p className="text-xs text-muted-foreground">
                  Popunjenost i senzori još nisu u ugovoru — šifarnik daje samo naziv i naselje.
                </p>
              </div>
            )}
          </Card>

          <Card className="gap-3 p-5">
            <p className="font-medium">Tok prijave</p>
            <ReportTimeline report={report} />
            <p className="text-xs text-muted-foreground">Poslednja promena {formatDateTime(report.azurirana_at)}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}
