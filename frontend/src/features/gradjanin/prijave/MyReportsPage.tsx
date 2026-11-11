import { useState } from 'react';
import { ChevronRight, Inbox } from 'lucide-react';
import { Link } from 'react-router';
import { PillTabs } from '@/components/citizen/PillTabs';
import { PointsBadge } from '@/components/citizen/PointsBadge';
import { REPORT_TYPE_ICON, REPORT_TYPE_TONE } from '@/components/citizen/reportType';
import { ScreenHeader } from '@/components/citizen/ScreenHeader';
import { EmptyState } from '@/components/EmptyState';
import { ReportStatusPill } from '@/components/StatusPill';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMyReports, useSettlementLabel } from '@/data/queries';
import type { Report } from '@/domain/types';
import { formatRelative } from '@/lib/format';
import { REPORT_TYPE_LABEL } from '@/lib/labels';
import { isOpenReport } from '@/lib/reports';
import { cn } from '@/lib/utils';

type Filter = 'sve' | 'otvorene' | 'zatvorene';

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'sve', label: 'Sve' },
  { value: 'otvorene', label: 'Otvorene' },
  { value: 'zatvorene', label: 'Zatvorene' },
];

function matchesFilter(report: Report, filter: Filter): boolean {
  if (filter === 'sve') return true;
  return filter === 'zatvorene' ? !isOpenReport(report) : isOpenReport(report);
}

/**
 * Prijave ovog uređaja. Backend nema javno čitanje prijava — javna ruta vraća
 * samo potvrdu sa kratkim kodom (docs/reports-mvp.md) — pa ovaj spisak radi
 * nad lokalnim zapisom. Status se menja tek kad javna putanja postoji.
 */
export function MyReportsPage() {
  const { data: reports, isPending } = useMyReports();
  const settlementLabel = useSettlementLabel();
  const [filter, setFilter] = useState<Filter>('sve');

  const filtered = reports?.filter((r) => matchesFilter(r, filter)) ?? [];

  return (
    <div className="space-y-4">
      <ScreenHeader
        title="Moje prijave"
        description="Poslate sa ovog uređaja i njihov poslednji poznati status."
        backTo="/gradjanin"
        aside={<PointsBadge />}
      />

      <PillTabs value={filter} onChange={setFilter} options={FILTERS} label="Filter prijava" />

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          className="border-0 bg-card/70"
          title="Nema prijava"
          description={filter === 'sve' ? 'Još nisi poslao/la nijednu prijavu.' : 'Nema prijava u ovoj kategoriji.'}
          action={
            filter === 'sve' ? (
              <Button asChild className="h-10 rounded-full bg-rose px-5 text-white hover:bg-rose/90">
                <Link to="/gradjanin/prijava">Prijavi problem</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((report) => {
            const Icon = REPORT_TYPE_ICON[report.tip];
            return (
              <li key={report.id}>
                <Link
                  to={`/gradjanin/prijave/${report.id}`}
                  className="flex items-center gap-3 rounded-2xl bg-card p-3.5 shadow-sm ring-1 ring-foreground/5 transition-colors hover:bg-card/80"
                >
                  <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-2xl', REPORT_TYPE_TONE[report.tip])}>
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{REPORT_TYPE_LABEL[report.tip]}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {settlementLabel(report.naselje_id)} · {report.kratki_kod} · {formatRelative(report.primljena_at)}
                    </p>
                  </div>
                  <ReportStatusPill status={report.status} />
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="px-1 text-xs text-muted-foreground text-pretty">
        Prijave su anonimne. Kratki kod je jedini trag — sačuvaj ga ako o prijavi pitaš telefonom.
      </p>
    </div>
  );
}
