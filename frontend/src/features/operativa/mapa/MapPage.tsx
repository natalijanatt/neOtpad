import { useState } from 'react';
import { Link } from 'react-router';
import { CircleMarker, MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import { AlertTriangle, Container as ContainerIcon, Flame, MessageSquareWarning } from 'lucide-react';
import { pinIcon } from '@/components/MultiMarkerMap';
import { PageHeader } from '@/components/PageHeader';
import { FillLevelBadge } from '@/components/FillLevelBadge';
import { PriorityPill, ReportStatusPill } from '@/components/StatusPill';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useContainers, useHotspots, useLookupNames, useReports, useSettlementOptions } from '@/data/queries';
import type { Container, Hotspot, Report, ReportStatus } from '@/domain/types';
import { formatDaysUntil, formatRelative } from '@/lib/format';
import { PIROT_CENTER } from '@/lib/geo';
import { HOTSPOT_STATUS_LABEL, REPORT_TYPE_LABEL } from '@/lib/labels';
import { FILL_BAND_CSS_VAR, fillBand } from '@/lib/levels';
import { priorityOf, reportPoint } from '@/lib/reports';
import { isReadingTrusted, SENSOR_STATUS_LABEL, sensorIssue } from '@/lib/sensors';
import { cn } from '@/lib/utils';

type LayerKey = 'containers' | 'hotspots' | 'reports';
type RiskFilter = 'sve' | 'povisen' | 'kritican';

const LAYERS: Array<{ key: LayerKey; label: string; icon: typeof ContainerIcon }> = [
  { key: 'containers', label: 'Kontejneri', icon: ContainerIcon },
  { key: 'hotspots', label: 'Žarišta', icon: Flame },
  { key: 'reports', label: 'Prijave', icon: MessageSquareWarning },
];

const REPORT_STATUS_COLOR: Record<ReportStatus, string> = {
  nova: 'var(--muted-foreground)',
  potvrdjena: 'var(--warning)',
  resena: 'var(--success)',
  odbijena: 'var(--destructive)',
  duplikat: 'var(--muted-foreground)',
};

const HOTSPOT_COLOR = { da: 'var(--level-critical)', ne: 'var(--success)', nepoznato: 'var(--level-mid)' } as const;

const UNTRUSTED_COLOR = 'var(--muted-foreground)';

export function MapPage() {
  const { data: containers, isPending: containersPending } = useContainers();
  const { data: hotspots } = useHotspots();
  const { data: reports } = useReports({ status: 'otvorene' });
  const { data: settlements } = useSettlementOptions();

  const settlementLabel = useLookupNames(settlements);

  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({ containers: true, hotspots: true, reports: true });
  const [settlementId, setSettlementId] = useState<string>('sve');
  const [risk, setRisk] = useState<RiskFilter>('sve');

  const toggleLayer = (key: LayerKey) => setLayers((l) => ({ ...l, [key]: !l[key] }));

  const inSettlement = (id: string | null) => settlementId === 'sve' || id === settlementId;

  // Skupovi su mali (desetine stavki), pa filtriranje po renderu ne treba memoizaciju.
  const visibleContainers = (containers ?? []).filter((c) => {
    if (!inSettlement(c.settlementId)) return false;
    if (risk === 'sve') return true;
    // Nepouzdano merenje nije signal rizika, pa ispada iz filtera po riziku.
    // Ni kontejner bez merenja: nepoznata popunjenost nije niska popunjenost.
    if (!isReadingTrusted(c) || c.fillLevel === null) return false;
    const band = fillBand(c.fillLevel);
    return risk === 'kritican' ? band === 'critical' : band === 'high' || band === 'critical';
  });

  // Deo deponija nije spojen ni sa jednim naseljem iz šifarnika (naziv iz izvora
  // se nije prepoznao); filter po naselju ih ispušta, a „sva naselja“ ih
  // prikazuje — inače bi tiho nestale sa mape.
  const visibleHotspots = (hotspots ?? []).filter((h) => {
    if (!inSettlement(h.settlementId)) return false;
    if (risk === 'sve') return true;
    return risk === 'kritican' ? h.riskScore >= 85 : h.riskScore >= 60;
  });

  // Prijava bez koordinate se ne crta: centroid naselja nije njena tačka.
  const visibleReports = (reports ?? []).filter((r) => {
    if (reportPoint(r) === null) return false;
    if (!inSettlement(r.naselje_id)) return false;
    if (risk === 'sve') return true;
    const p = priorityOf(r);
    if (p === null) return false;
    return risk === 'kritican' ? p === 1 : p <= 2;
  });

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[480px] flex-col gap-4">
      <PageHeader
        title="Mapa"
        description="Kontejneri po popunjenosti, divlje deponije koje i dalje stoje i otvorene prijave građana."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={settlementId} onValueChange={setSettlementId}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sve">Sva naselja</SelectItem>
                {settlements?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.naziv}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={risk} onValueChange={(v) => setRisk(v as RiskFilter)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sve">Svi nivoi rizika</SelectItem>
                <SelectItem value="povisen">Povišen rizik</SelectItem>
                <SelectItem value="kritican">Samo kritično</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {LAYERS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => toggleLayer(key)}
            aria-pressed={layers[key]}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              layers[key] ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            <Icon className="size-3.5" />
            {label}
            <span className={cn('rounded-full px-1.5 text-[10px]', layers[key] ? 'bg-primary-foreground/20' : 'bg-muted')}>
              {key === 'containers' ? visibleContainers.length : key === 'hotspots' ? visibleHotspots.length : visibleReports.length}
            </span>
          </button>
        ))}
        <Legend className="ml-auto" />
      </div>

      {containersPending ? (
        <Skeleton className="min-h-0 flex-1 rounded-xl" />
      ) : (
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border">
          <MapContainer center={[PIROT_CENTER.lat, PIROT_CENTER.lon]} zoom={12} className="h-full w-full" attributionControl={false}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

            {layers.hotspots
              ? visibleHotspots.map((h) => (
                  <CircleMarker
                    key={h.id}
                    center={[h.lat, h.lon]}
                    radius={6 + Math.min(h.yearsRecorded.length, 6) * 2}
                    pathOptions={{ color: HOTSPOT_COLOR[h.recurs], fillColor: HOTSPOT_COLOR[h.recurs], fillOpacity: 0.3, weight: 1.5 }}
                  >
                    <Popup>
                      <HotspotPopup hotspot={h} />
                    </Popup>
                  </CircleMarker>
                ))
              : null}

            {layers.containers
              ? visibleContainers.map((c) => {
                  // Bez merenja ili sa greškom uređaja pin je siv sa upitnikom:
                  // nepoznata popunjenost se ne boji kao niska.
                  const known = isReadingTrusted(c) && c.fillLevel !== null;
                  return (
                    <Marker
                      key={c.id}
                      position={[c.lat, c.lon]}
                      icon={pinIcon(
                        known ? FILL_BAND_CSS_VAR[fillBand(c.fillLevel as number)] : UNTRUSTED_COLOR,
                        known ? String(c.fillLevel) : '?',
                        30,
                      )}
                    >
                      <Popup>
                        <ContainerPopup container={c} />
                      </Popup>
                    </Marker>
                  );
                })
              : null}

            {layers.reports
              ? visibleReports.map((r) => {
                  const point = reportPoint(r);
                  if (!point) return null;
                  return (
                    <Marker key={r.id} position={[point.lat, point.lon]} icon={pinIcon(REPORT_STATUS_COLOR[r.status], undefined, 22)}>
                      <Popup>
                        <ReportPopup report={r} settlement={settlementLabel(r.naselje_id)} />
                      </Popup>
                    </Marker>
                  );
                })
              : null}
          </MapContainer>
        </div>
      )}
    </div>
  );
}

function Legend({ className }: { className?: string }) {
  const items: Array<{ color: string; label: string }> = [
    { color: FILL_BAND_CSS_VAR.low, label: '< 50%' },
    { color: FILL_BAND_CSS_VAR.mid, label: '50–79%' },
    { color: FILL_BAND_CSS_VAR.high, label: '80–94%' },
    { color: FILL_BAND_CSS_VAR.critical, label: '≥ 95%' },
    { color: UNTRUSTED_COLOR, label: 'senzor nepouzdan' },
  ];
  return (
    <div className={cn('hidden items-center gap-3 text-xs text-muted-foreground lg:flex', className)}>
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: i.color }} />
          {i.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <span className="size-3 rounded-full border-2" style={{ borderColor: HOTSPOT_COLOR.da, backgroundColor: 'color-mix(in oklch, var(--level-critical) 30%, transparent)' }} />
        žarište (veće = duže evidentirano)
      </span>
    </div>
  );
}

function ContainerPopup({ container }: { container: Container }) {
  const issue = sensorIssue(container);
  return (
    <div className="min-w-48 space-y-1.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{container.code}</p>
        <FillLevelBadge level={container.fillLevel} />
      </div>
      <p className="text-xs text-muted-foreground">
        {container.locationName}
      </p>
      {issue ? (
        <p className="flex items-center gap-1 text-xs text-level-high">
          <AlertTriangle className="size-3" /> {SENSOR_STATUS_LABEL[issue]}
        </p>
      ) : container.predictedCriticalAt ? (
        <p className="text-xs">Kritično {formatDaysUntil(container.predictedCriticalAt)}</p>
      ) : (
        <p className="text-xs text-muted-foreground">Nije kritično u narednih 7 dana</p>
      )}
      <Button asChild size="xs" className="mt-1 w-full">
        <Link to={`/operativa/kontejneri/${container.id}`}>Detalji</Link>
      </Button>
    </div>
  );
}

function HotspotPopup({ hotspot }: { hotspot: Hotspot }) {
  return (
    <div className="min-w-48 space-y-1 text-sm">
      <p className="font-semibold">
        {hotspot.id} · {hotspot.name}
      </p>
      <p className="text-xs text-muted-foreground">{hotspot.settlementName}</p>
      <p className="text-xs">
        {HOTSPOT_STATUS_LABEL[hotspot.status]} · evidentirano {hotspot.yearsRecorded.length}× ({hotspot.firstSeenYear}–{hotspot.lastSeenYear})
      </p>
      <p className="text-xs">
        Ponavlja se: <span className="font-medium">{hotspot.recurs}</span> · rizik {hotspot.riskScore}/100
      </p>
      {hotspot.geoPrecision !== 'registarska_tacka' ? (
        <p className="text-[11px] text-muted-foreground">Koordinata je približna ({hotspot.geoPrecision.replace(/_/g, ' ')}).</p>
      ) : null}
    </div>
  );
}

function ReportPopup({ report, settlement }: { report: Report; settlement: string }) {
  return (
    <div className="min-w-48 space-y-1.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{REPORT_TYPE_LABEL[report.tip]}</p>
        <PriorityPill priority={priorityOf(report)} />
      </div>
      <p className="text-xs text-muted-foreground">
        {report.kratki_kod} · {settlement} · {formatRelative(report.primljena_at)}
      </p>
      <p className="line-clamp-2 text-xs">{report.opis ?? 'Bez opisa.'}</p>
      <div className="flex items-center justify-between gap-2 pt-1">
        <ReportStatusPill status={report.status} />
        <Button asChild size="xs" variant="outline">
          <Link to={`/operativa/prijave/${report.id}`}>Otvori</Link>
        </Button>
      </div>
    </div>
  );
}
