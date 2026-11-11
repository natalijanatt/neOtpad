import { Check, CircleDot, Copy, ImageOff, Truck, XCircle } from 'lucide-react';
import type { ReportDetail, ReportHistoryEntry } from '@/domain/types';
import { formatDateTime } from '@/lib/format';
import { REPORT_HISTORY_LABEL } from '@/lib/labels';
import { cn } from '@/lib/utils';

/**
 * Tok prijave iz `prijava_istorija`. Backend beleži svaku akciju sa verzijom,
 * razlogom i snimkom stanja, i nikad je ne menja (docs/reports-mvp.md), pa se
 * prikazuje ono što se stvarno dogodilo umesto pretpostavljenih koraka.
 */
const ICON: Record<ReportHistoryEntry['akcija'], typeof Check> = {
  kreirana: CircleDot,
  potvrdjena: Check,
  odbijena: XCircle,
  duplikat: Copy,
  resena: Truck,
};

const TONE: Record<ReportHistoryEntry['akcija'], string> = {
  kreirana: 'bg-muted text-muted-foreground',
  potvrdjena: 'bg-warning/25 text-warning-foreground',
  odbijena: 'bg-destructive/15 text-destructive',
  duplikat: 'bg-muted text-muted-foreground',
  resena: 'bg-success/15 text-success',
};

/**
 * Uklanjanje fotografije backend beleži kao `foto_uklonjena`
 * (docs/media-storage.md), a enum u ugovoru je još ne navodi — istorija je
 * nepromenljiva, pa nepoznata akcija ne sme da sruši ceo tok, samo da se
 * prikaže neutralno.
 */
const UNKNOWN_ACTION = {
  foto_uklonjena: { label: 'Fotografija uklonjena', icon: ImageOff, tone: 'bg-muted text-muted-foreground' },
} as const;

function presentation(akcija: string): { label: string; icon: typeof Check; tone: string } {
  if (akcija in ICON) {
    const known = akcija as ReportHistoryEntry['akcija'];
    return { label: REPORT_HISTORY_LABEL[known], icon: ICON[known], tone: TONE[known] };
  }
  const extra = UNKNOWN_ACTION[akcija as keyof typeof UNKNOWN_ACTION];
  return extra ?? { label: akcija, icon: CircleDot, tone: 'bg-muted text-muted-foreground' };
}

export function ReportTimeline({ report }: { report: Pick<ReportDetail, 'istorija' | 'primljena_at'> }) {
  const entries = [...report.istorija].sort((a, b) => a.verzija - b.verzija);

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Prijava je primljena {formatDateTime(report.primljena_at)}.</p>;
  }

  return (
    <ol>
      {entries.map((entry, i) => {
        const { label, icon: Icon, tone } = presentation(entry.akcija);
        const last = i === entries.length - 1;
        return (
          <li key={`${entry.verzija}-${entry.akcija}`} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full', tone)}>
                <Icon className="size-3.5" />
              </span>
              {!last ? <span className="w-px flex-1 bg-border" /> : null}
            </div>
            <div className={cn(!last && 'pb-4')}>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(entry.nastalo_at)}
                {/* Javna prijava nema korisnika; sve ostalo je uradio neko iz JKP-a. */}
                {entry.korisnik_id ? ' · operativa' : ' · prijava građanina'}
              </p>
              {entry.razlog ? <p className="mt-0.5 text-xs text-muted-foreground text-pretty">{entry.razlog}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
