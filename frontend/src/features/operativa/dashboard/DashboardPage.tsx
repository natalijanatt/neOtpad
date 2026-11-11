import { Link } from 'react-router';
import { AlertTriangle, ArrowRight, Container, MessageSquareWarning, Truck } from 'lucide-react';
import { FillLevelBadge } from '@/components/FillLevelBadge';
import { PageHeader } from '@/components/PageHeader';
import { PriorityPill } from '@/components/StatusPill';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useContainers, useDashboardSummary, useReports, useSettlementLabel } from '@/data/queries';
import { formatDaysUntil, formatRelative } from '@/lib/format';
import { REPORT_TYPE_LABEL } from '@/lib/labels';
import { priorityOf, prioritySortValue } from '@/lib/reports';
import { isReadingTrusted } from '@/lib/sensors';
import { cn } from '@/lib/utils';

const TOP_N = 5;

export function DashboardPage() {
  const { data, isPending, isError } = useDashboardSummary();
  const { data: containers } = useContainers();
  const { data: openReports } = useReports({ status: 'otvorene' });
  const settlementLabel = useSettlementLabel();

  // Najhitniji kontejneri: prvo po predviđenom kritičnom vremenu, pa po popunjenosti.
  // Nepouzdana merenja (zaprljana optika, tišina) ne ulaze u listu.
  const urgentContainers = (containers ?? [])
    .filter((c) => isReadingTrusted(c) && (c.predictedCriticalAt !== null || (c.fillLevel ?? 0) >= 80))
    .sort((a, b) => {
      const ta = a.predictedCriticalAt ? new Date(a.predictedCriticalAt).getTime() : Infinity;
      const tb = b.predictedCriticalAt ? new Date(b.predictedCriticalAt).getTime() : Infinity;
      return ta - tb || (b.fillLevel ?? 0) - (a.fillLevel ?? 0);
    })
    .slice(0, TOP_N);

  // Prioritet 1 je najhitniji, a netrijazirana prijava (bez prioriteta) ceka
  // odluku - zato stoji na vrhu, ne na dnu.
  const urgentReports = [...(openReports ?? [])]
    .sort(
      (a, b) =>
        prioritySortValue(a) - prioritySortValue(b) || new Date(b.primljena_at).getTime() - new Date(a.primljena_at).getTime(),
    )
    .slice(0, TOP_N);

  const kpis = [
    {
      label: 'Kontejneri ≥ 80%',
      value: data?.containersAbove80,
      hint: `od ${data?.totalContainers ?? '–'} praćenih`,
      icon: Container,
      tone: 'text-level-high',
    },
    {
      label: 'Prelivanja u 48h',
      value: data?.predictedOverflows48h,
      hint: 'predviđeno modelom',
      icon: AlertTriangle,
      tone: 'text-level-critical',
    },
    {
      label: 'Aktivne prijave',
      value: data?.activeReports,
      hint: 'nove i u toku',
      icon: MessageSquareWarning,
      tone: 'text-priority-low',
    },
    {
      label: 'Kamioni na terenu',
      value: data?.trucksOnRoute,
      hint: `od ${data?.totalTrucks ?? '–'} u voznom parku`,
      icon: Truck,
      tone: 'text-primary',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Stanje sistema danas — kontejneri, predikcije, prijave i vozni park." />

      {isError ? <p className="text-sm text-destructive">Podaci trenutno nisu dostupni.</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ label, value, hint, icon: Icon, tone }) => (
          <Card key={label} className="gap-2 p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{label}</p>
              <Icon className={cn('size-4', tone)} />
            </div>
            {isPending ? (
              <Skeleton className="h-9 w-16" />
            ) : (
              <p className="text-3xl font-semibold tabular-nums">{value ?? '–'}</p>
            )}
            <p className="text-xs text-muted-foreground">{hint}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-3 p-5">
          <div className="flex items-center justify-between">
            <p className="font-medium">Hitno — kontejneri</p>
            <Button asChild variant="ghost" size="sm">
              <Link to="/operativa/kontejneri">
                Svi <ArrowRight />
              </Link>
            </Button>
          </div>
          {urgentContainers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nijedan kontejner nije kritičan u narednih 7 dana.</p>
          ) : (
            <ul className="divide-y">
              {urgentContainers.map((c) => (
                <li key={c.id}>
                  <Link to={`/operativa/kontejneri/${c.id}`} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {c.code} <span className="font-normal text-muted-foreground">· {settlementLabel(c.settlementId)}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.predictedCriticalAt ? `kritično ${formatDaysUntil(c.predictedCriticalAt)}` : 'visoka popunjenost'}
                        {c.forecastConfidence === 'niska' ? ' · prognoza niske pouzdanosti' : ''}
                      </p>
                    </div>
                    <FillLevelBadge level={c.fillLevel} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="gap-3 p-5">
          <div className="flex items-center justify-between">
            <p className="font-medium">Hitno — prijave</p>
            <Button asChild variant="ghost" size="sm">
              <Link to="/operativa/prijave">
                Sve <ArrowRight />
              </Link>
            </Button>
          </div>
          {urgentReports.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nema otvorenih prijava.</p>
          ) : (
            <ul className="divide-y">
              {urgentReports.map((r) => (
                <li key={r.id}>
                  <Link to={`/operativa/prijave/${r.id}`} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {REPORT_TYPE_LABEL[r.tip]} <span className="font-normal text-muted-foreground">· {settlementLabel(r.naselje_id)}</span>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.kratki_kod} · {formatRelative(r.primljena_at)}
                      </p>
                    </div>
                    <PriorityPill priority={priorityOf(r)} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
