import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Search, TrendingDown, TrendingUp } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { FillLevelBadge, FillLevelBar } from '@/components/FillLevelBadge';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useContainers, useLookupNames, useSettlementOptions } from '@/data/queries';
import type { Container, FillLevelBand } from '@/domain/types';
import { formatDaysUntil, formatRelative } from '@/lib/format';
import { FILL_BAND_LABEL, fillBand } from '@/lib/levels';
import { matchesQuery } from '@/lib/search';
import { isReadingTrusted, SENSOR_STATUS_LABEL, sensorIssue } from '@/lib/sensors';
import { cn } from '@/lib/utils';

type SortKey = 'code' | 'settlement' | 'fillLevel' | 'trend' | 'critical' | 'lastCollected';
type SortDir = 'asc' | 'desc';

/**
 * Brzina punjenja u procentnim poenima dnevno, iz keširanog stanja kontejnera.
 * Nema je kontejner bez pouzdanog merenja — tada se u tabeli ne izmišlja nula.
 */
function trendOf(container: Container): number | null {
  return container.trendPpPerDay;
}

function criticalMs(container: Container): number {
  if (!isReadingTrusted(container)) return Number.POSITIVE_INFINITY;
  return container.predictedCriticalAt ? new Date(container.predictedCriticalAt).getTime() : Number.POSITIVE_INFINITY;
}

const COLUMNS: Array<{ key: SortKey; label: string; className?: string }> = [
  { key: 'code', label: 'Kontejner' },
  { key: 'settlement', label: 'Naselje' },
  { key: 'fillLevel', label: 'Popunjenost', className: 'w-44' },
  { key: 'trend', label: 'Trend' },
  { key: 'critical', label: 'Kritično' },
  { key: 'lastCollected', label: 'Poslednji odvoz' },
];

export function ContainersPage() {
  const navigate = useNavigate();
  const { data: containers, isPending } = useContainers();
  const { data: settlements } = useSettlementOptions();
  const settlementLabel = useLookupNames(settlements);

  const [query, setQuery] = useState('');
  const [settlementId, setSettlementId] = useState('sve');
  const [band, setBand] = useState<FillLevelBand | 'sve' | 'problem'>('sve');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'critical', dir: 'asc' });

  const rows = useMemo(() => {
    const list = (containers ?? []).filter((c) => {
      if (settlementId !== 'sve' && c.settlementId !== settlementId) return false;
      if (band === 'problem') return sensorIssue(c) !== null;
      // Kontejner bez merenja ne pripada nijednom pojasu — ne pada u „nisko“.
      if (band !== 'sve' && (c.fillLevel === null || fillBand(c.fillLevel) !== band)) return false;
      return matchesQuery([c.code, c.locationName, settlementLabel(c.settlementId)], query);
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    const value = (c: Container): number | string => {
      switch (sort.key) {
        case 'code':
          return c.code;
        case 'settlement':
          return settlementLabel(c.settlementId);
        case 'fillLevel':
          return c.fillLevel ?? -1;
        case 'trend':
          return trendOf(c) ?? -1;
        case 'critical':
          return criticalMs(c);
        case 'lastCollected':
          return c.lastCollectedAt === null ? 0 : new Date(c.lastCollectedAt).getTime();
      }
    };
    return list.sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb, 'sr-Latn') * dir;
      return ((va as number) - (vb as number)) * dir;
    });
  }, [containers, settlementId, band, query, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'fillLevel' || key === 'trend' ? 'desc' : 'asc' }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kontejneri"
        description="Popunjenost, trend i predviđeno kritično vreme za svaki praćeni kontejner."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Kod ili lokacija…" value={query} onChange={(e) => setQuery(e.target.value)} className="w-48 pl-8" />
            </div>
            <Select value={settlementId} onValueChange={setSettlementId}>
              <SelectTrigger className="w-40">
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
            <Select value={band} onValueChange={(v) => setBand(v as typeof band)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sve">Sve popunjenosti</SelectItem>
                {(['critical', 'high', 'mid', 'low'] as FillLevelBand[]).map((b) => (
                  <SelectItem key={b} value={b}>
                    {FILL_BAND_LABEL[b]}
                  </SelectItem>
                ))}
                <SelectItem value="problem">Problem sa senzorom</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {isPending ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : rows.length === 0 ? (
        <EmptyState title="Nema kontejnera za zadate filtere" />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                {COLUMNS.map((col) => (
                  <TableHead key={col.key} className={col.className}>
                    <button type="button" onClick={() => toggleSort(col.key)} className="inline-flex items-center gap-1 hover:text-foreground">
                      {col.label}
                      {sort.key === col.key ? (
                        sort.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                      ) : (
                        <ArrowUpDown className="size-3 opacity-40" />
                      )}
                    </button>
                  </TableHead>
                ))}
                <TableHead>Senzor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => {
                const trend = trendOf(c);
                const issue = sensorIssue(c);
                const trusted = isReadingTrusted(c);
                return (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/operativa/kontejneri/${c.id}`)}>
                    <TableCell>
                      <Link to={`/operativa/kontejneri/${c.id}`} className="block" onClick={(e) => e.stopPropagation()}>
                        <span className="font-medium">{c.code}</span>
                        <span className="block text-xs text-muted-foreground">{c.locationName}</span>
                      </Link>
                    </TableCell>
                    <TableCell>{settlementLabel(c.settlementId)}</TableCell>
                    <TableCell>
                      <div className={cn('flex items-center gap-2', !trusted && 'opacity-50')}>
                        <FillLevelBar level={c.fillLevel} className="w-20" />
                        <FillLevelBadge level={c.fillLevel} />
                      </div>
                    </TableCell>
                    <TableCell>
                      {trend === null ? (
                        <span className="text-xs text-muted-foreground">nema merenja</span>
                      ) : (
                        <span className={cn('inline-flex items-center gap-1 tabular-nums', trend >= 20 ? 'text-level-high' : 'text-muted-foreground')}>
                          {trend > 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                          {trend > 0 ? `+${trend.toFixed(1)} pp/dan` : 'ne puni se'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {!trusted ? (
                        <span className="text-xs text-muted-foreground">nepouzdano merenje</span>
                      ) : (
                        <span className={cn(criticalMs(c) - Date.now() <= 48 * 3_600_000 && 'font-medium text-level-critical')}>
                          {formatDaysUntil(c.predictedCriticalAt)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatRelative(c.lastCollectedAt)}</TableCell>
                    <TableCell>
                      {!c.hasSensor ? (
                        <span className="text-xs text-muted-foreground">bez senzora</span>
                      ) : issue ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-level-high">
                          <AlertTriangle className="size-3" /> {SENSOR_STATUS_LABEL[issue]}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">ok · {c.sensor?.batteryPercent}%</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {rows.length} od {containers?.length ?? 0} kontejnera · klik na kod otvara detalj
      </p>
    </div>
  );
}
