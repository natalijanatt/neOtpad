import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowDown, ArrowUp, ArrowUpDown, BrainCircuit, Camera, Search } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { PriorityPill, ReportStatusPill } from '@/components/StatusPill';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useLookupNames, useReports, useSettlementOptions } from '@/data/queries';
import type { Report, ReportStatus, ReportType } from '@/domain/types';
import { formatRelative } from '@/lib/format';
import { REPORT_ACTION_LABEL, REPORT_CHANNEL_LABEL, REPORT_STATUS_LABEL, REPORT_TYPE_LABEL } from '@/lib/labels';
import { PRIORITY_CLASS } from '@/lib/levels';
import { freshProposal, isOpenReport, priorityOf } from '@/lib/reports';
import { matchesQuery } from '@/lib/search';
import { cn } from '@/lib/utils';

type StatusFilter = ReportStatus | 'otvorene' | 'sve';
type SortKey = 'prioritet' | 'primljena_at' | 'naselje';
type SortDir = 'asc' | 'desc';

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'otvorene', label: 'Otvorene' },
  { value: 'sve', label: 'Sve prijave' },
  ...(['nova', 'potvrdjena', 'resena', 'odbijena', 'duplikat'] as ReportStatus[]).map((s) => ({
    value: s,
    label: REPORT_STATUS_LABEL[s],
  })),
];

const TYPE_OPTIONS = Object.entries(REPORT_TYPE_LABEL) as Array<[ReportType, string]>;

const COLUMNS: Array<{ key?: SortKey; label: string; className?: string }> = [
  { key: 'prioritet', label: 'Prioritet', className: 'w-40' },
  { label: 'Prijava' },
  { key: 'naselje', label: 'Naselje' },
  { label: 'Obrada / predlog' },
  { key: 'primljena_at', label: 'Primljeno' },
  { label: 'Status' },
];

/**
 * Red prijava iz `GET /reports`. Status, tip i naselje filtrira backend (to su
 * parametri rute), a pretraga po tekstu radi nad učitanom stranicom — ugovor
 * pretragu po opisu nema.
 */
export function ReportsQueuePage() {
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('otvorene');
  const [tip, setTip] = useState<ReportType | 'sve'>('sve');
  const [naseljeId, setNaseljeId] = useState('sve');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'prioritet', dir: 'asc' });

  const settlements = useSettlementOptions();
  const settlementName = useLookupNames(settlements.data);

  const {
    data: reports,
    isPending,
    isError,
    error,
  } = useReports({
    ...(status === 'sve' ? {} : { status }),
    ...(tip === 'sve' ? {} : { tip }),
    ...(naseljeId === 'sve' ? {} : { naselje_id: naseljeId }),
  });

  // Jedan prolaz umesto tri filtera nad istom listom (`js-combine-iterations`).
  const counts = useMemo(() => {
    const tally = { nova: 0, potvrdjena: 0, hitne: 0, bezPrioriteta: 0 };
    for (const r of reports ?? []) {
      if (r.status === 'nova') tally.nova += 1;
      else if (r.status === 'potvrdjena') tally.potvrdjena += 1;
      const p = priorityOf(r);
      if (p !== null && p <= 2 && isOpenReport(r)) tally.hitne += 1;
      if (p === null && isOpenReport(r)) tally.bezPrioriteta += 1;
    }
    return tally;
  }, [reports]);

  const rows = useMemo(() => {
    const list = (reports ?? []).filter((r) =>
      matchesQuery(
        [r.kratki_kod, r.opis ?? '', r.opis_lokacije ?? '', settlementName(r.naselje_id), REPORT_CHANNEL_LABEL[r.kanal]],
        query,
      ),
    );
    const dir = sort.dir === 'asc' ? 1 : -1;
    const value = (r: Report): number | string => {
      switch (sort.key) {
        case 'prioritet':
          // Netrijažirana prijava nema prioritet, a upravo ona čeka odluku —
          // zato ide ispred svih brojeva umesto na kraj liste.
          return priorityOf(r) ?? 0;
        case 'primljena_at':
          return new Date(r.primljena_at).getTime();
        case 'naselje':
          return settlementName(r.naselje_id);
      }
    };
    return list.sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb, 'sr-Latn') * dir;
      // Isti prioritet: novija prijava ide prva.
      return ((va as number) - (vb as number)) * dir || new Date(b.primljena_at).getTime() - new Date(a.primljena_at).getTime();
    });
  }, [reports, query, sort, settlementName]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'prioritet' ? 'asc' : 'desc' }));

  const summary = [
    { label: 'Nove', value: counts.nova, onClick: () => setStatus('nova'), active: status === 'nova' },
    { label: 'Potvrđene', value: counts.potvrdjena, onClick: () => setStatus('potvrdjena'), active: status === 'potvrdjena' },
    { label: 'Prioritet 1–2', value: counts.hitne, tone: 'text-priority-critical' },
    { label: 'Čeka trijažu', value: counts.bezPrioriteta },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Prijave građana"
        description="Red prijava sa backenda. Prioritet 1–5 postavlja dispečer pri potvrdi; nova prijava ga nema dok se ne trijažira."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Kod, opis, lokacija…" value={query} onChange={(e) => setQuery(e.target.value)} className="w-48 pl-8" />
            </div>
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tip} onValueChange={(v) => setTip(v as typeof tip)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sve">Svi tipovi</SelectItem>
                {TYPE_OPTIONS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={naseljeId} onValueChange={setNaseljeId}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sve">Sva naselja</SelectItem>
                {settlements.data?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.naziv}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map(({ label, value, onClick, active, tone }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            disabled={!onClick}
            className={cn(
              'rounded-xl border bg-card p-4 text-left transition-colors',
              onClick && 'hover:bg-accent/50',
              active && 'border-primary bg-primary/5',
              !onClick && 'cursor-default',
            )}
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            {isPending ? <Skeleton className="mt-1 h-7 w-10" /> : <p className={cn('text-2xl font-semibold tabular-nums', tone)}>{value}</p>}
          </button>
        ))}
      </div>

      {isPending ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : isError ? (
        <EmptyState title="Red prijava nije učitan" description={error.message} />
      ) : rows.length === 0 ? (
        <EmptyState title="Nema prijava za zadate filtere" description="Promeni status ili naselje, ili obriši pretragu." />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                {COLUMNS.map((col) => (
                  <TableHead key={col.label} className={col.className}>
                    {col.key ? (
                      <button type="button" onClick={() => toggleSort(col.key!)} className="inline-flex items-center gap-1 hover:text-foreground">
                        {col.label}
                        {sort.key === col.key ? (
                          sort.dir === 'asc' ? (
                            <ArrowUp className="size-3" />
                          ) : (
                            <ArrowDown className="size-3" />
                          )
                        ) : (
                          <ArrowUpDown className="size-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      col.label
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const prioritet = priorityOf(r);
                // Predlog je u `GET /reports` uz svaku stavku upravo zato da bi
                // se red mogao pregledati bez otvaranja svake prijave.
                const predlog = freshProposal(r);
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/operativa/prijave/${r.id}`)}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={cn('w-4 text-right text-sm font-semibold tabular-nums', prioritet ? PRIORITY_CLASS[prioritet].text : 'text-muted-foreground')}>
                          {prioritet ?? '–'}
                        </span>
                        <PriorityPill priority={prioritet} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link to={`/operativa/prijave/${r.id}`} className="block" onClick={(e) => e.stopPropagation()}>
                        <span className="flex items-center gap-1.5 font-medium">
                          {REPORT_TYPE_LABEL[r.tip]}
                          {r.fotografije.length > 0 ? (
                            <Camera
                              className="size-3.5 text-muted-foreground"
                              aria-label={r.fotografije.length === 1 ? 'sa fotografijom' : `${r.fotografije.length} fotografije`}
                            />
                          ) : null}
                        </span>
                        {/* Kanal stoji uz kod jer određuje kuda odlazi odgovor — SMS i posrednik nemaju nalog u aplikaciji. */}
                        <span className="block text-xs text-muted-foreground">
                          {r.kratki_kod} · {REPORT_CHANNEL_LABEL[r.kanal]}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>{settlementName(r.naselje_id) || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      {r.tip_obrade ? (
                        REPORT_ACTION_LABEL[r.tip_obrade]
                      ) : predlog?.predlozeni_tip_obrade ? (
                        // Samo dok obrada nije određena: čim dispečer odluči,
                        // prikazuje se odluka, a ne predlog koji joj je prethodio.
                        <span className="flex flex-col">
                          <span className="flex items-center gap-1 text-sm">
                            <BrainCircuit className="size-3.5 text-primary" aria-hidden />
                            {REPORT_ACTION_LABEL[predlog.predlozeni_tip_obrade]}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            predlog · {Math.round((predlog.pouzdanost ?? 0) * 100)}%
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">nije određena</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatRelative(r.primljena_at)}</TableCell>
                    <TableCell>
                      <ReportStatusPill status={r.status} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {rows.length} od {reports?.length ?? 0} učitanih prijava · klik na red otvara detalj sa trijažom
      </p>
    </div>
  );
}
