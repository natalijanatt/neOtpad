import { Link, useParams } from 'react-router';
import { AlertTriangle, ArrowLeft, BatteryMedium, CalendarClock, History, MessageSquareWarning, Truck } from 'lucide-react';
import { FillLevelBadge, FillLevelBar } from '@/components/FillLevelBadge';
import { MultiMarkerMap } from '@/components/MultiMarkerMap';
import { PriorityPill, ReportStatusPill } from '@/components/StatusPill';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useContainer, useLookupNames, useReports, useSettlementOptions } from '@/data/queries';
import { formatDateTime, formatDaysUntil, formatRelative } from '@/lib/format';
import { REPORT_TYPE_LABEL } from '@/lib/labels';
import { FILL_BAND_CSS_VAR, fillBand } from '@/lib/levels';
import { priorityOf } from '@/lib/reports';
import { isReadingTrusted, SENSOR_STATUS_LABEL, sensorIssue } from '@/lib/sensors';
import { cn } from '@/lib/utils';
import { FillChart } from './FillChart';

export function ContainerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: container, isPending, isError } = useContainer(id ?? '');
  const { data: reports } = useReports({ status: 'otvorene' });
  const settlementLabel = useLookupNames(useSettlementOptions().data);

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

  if (isError || !container) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/operativa/kontejneri">
            <ArrowLeft /> Kontejneri
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">Kontejner nije pronađen.</p>
      </div>
    );
  }

  const trusted = isReadingTrusted(container);
  const issue = sensorIssue(container);
  const linkedReports = (reports ?? []).filter((r) => r.kontejner_id === container.id);
  const criticalSoon =
    trusted && container.predictedCriticalAt !== null && new Date(container.predictedCriticalAt).getTime() - Date.now() <= 48 * 3_600_000;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon-sm">
          <Link to="/operativa/kontejneri">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">
            {container.code} <span className="font-normal text-muted-foreground">· {container.locationName}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {settlementLabel(container.settlementId)} · {container.capacityLiters} l · {container.hasSensor ? 'sa senzorom' : 'bez senzora'}
          </p>
        </div>
        <FillLevelBadge level={container.fillLevel} withLabel className="h-7 px-3 text-sm" />
      </div>

      {issue ? (
        <Card className="flex-row items-start gap-3 border-level-high/40 bg-level-high/10 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-level-high" />
          <div className="text-sm">
            <p className="font-medium">
              {SENSOR_STATUS_LABEL[issue]}
              {container.sensor ? ` · baterija ${container.sensor.batteryPercent}%` : ''}
            </p>
            <p className="text-muted-foreground text-pretty">
              {trusted
                ? 'Merenje je i dalje pouzdano; uređaj ide na servis pri sledećem obilasku.'
                : 'Ovo merenje se ne koristi za prioritet — dijagnostički kod ima prednost nad izmerenom vrednošću. Otvoren je nalog za servis; kontejner ostaje u fiksnom rasporedu.'}
            </p>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="gap-3 p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <p className="font-medium">Popunjenost — 14 dana istorije, 7 dana predikcije</p>
            <span className="text-xs text-muted-foreground">merenje {formatRelative(container.lastReadingAt)}</span>
          </div>
          <FillChart container={container} />
          {container.seasonalEvents.length ? (
            <div className="flex flex-wrap gap-1.5">
              {container.seasonalEvents.map((e) => (
                <span key={e.date + e.kind} className="inline-flex items-center gap-1 rounded-full bg-warning/25 px-2 py-0.5 text-xs text-warning-foreground">
                  <CalendarClock className="size-3" />
                  {e.label} · {e.date.slice(8)}.{e.date.slice(5, 7)}.
                </span>
              ))}
            </div>
          ) : null}
        </Card>

        <div className="space-y-4">
          <Card className={cn('gap-2 p-5', criticalSoon && 'border-level-critical/40 bg-level-critical/5')}>
            <p className="text-sm text-muted-foreground">Predviđeno kritično (≥ 95%)</p>
            <p className={cn('text-2xl font-semibold', criticalSoon && 'text-level-critical')}>
              {trusted ? formatDaysUntil(container.predictedCriticalAt) : '—'}
            </p>
            {trusted && container.predictedCriticalAt ? (
              <p className="text-xs text-muted-foreground">{formatDateTime(container.predictedCriticalAt)}</p>
            ) : (
              <p className="text-xs text-muted-foreground">{trusted ? 'Nije u horizontu od 7 dana' : 'Merenje nepouzdano'}</p>
            )}
            <FillLevelBar level={container.fillLevel} className="mt-1" />
          </Card>

          <Card className="gap-3 p-5">
            <Row icon={Truck} label="Poslednji odvoz" value={formatRelative(container.lastCollectedAt)} hint={formatDateTime(container.lastCollectedAt)} />
            <Row icon={History} label="Prelivanja (90 dana)" value={String(container.overflowsLast90Days)} hint={container.overflowsLast90Days >= 3 ? 'ponavlja se — kandidat za češći odvoz' : 'u granicama'} />
            {container.sensor ? (
              <Row icon={BatteryMedium} label="Baterija senzora" value={`${container.sensor.batteryPercent}%`} hint={container.sensor.batteryPercent < 20 ? 'zameniti pri sledećem obilasku' : 'u redu'} />
            ) : null}
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="gap-3 p-5 lg:col-span-2">
          <div className="flex items-center gap-2">
            <MessageSquareWarning className="size-4 text-muted-foreground" />
            <p className="font-medium">Otvorene prijave za ovaj kontejner</p>
          </div>
          {linkedReports.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nema otvorenih prijava.</p>
          ) : (
            <ul className="divide-y">
              {linkedReports.map((r) => (
                <li key={r.id}>
                  <Link to={`/operativa/prijave/${r.id}`} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{REPORT_TYPE_LABEL[r.tip]}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.kratki_kod} · {formatRelative(r.primljena_at)}
                      </p>
                    </div>
                    <PriorityPill priority={priorityOf(r)} />
                    <ReportStatusPill status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <MultiMarkerMap
          className="h-56 overflow-hidden rounded-xl border lg:h-auto"
          markers={[
            {
              id: container.id,
              point: container,
              color:
                trusted && container.fillLevel !== null
                  ? FILL_BAND_CSS_VAR[fillBand(container.fillLevel)]
                  : 'var(--muted-foreground)',
            },
          ]}
        />
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, value, hint }: { icon: typeof Truck; label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}
