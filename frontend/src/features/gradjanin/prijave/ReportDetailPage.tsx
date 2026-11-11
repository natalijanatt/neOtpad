import { Copy, Hash } from 'lucide-react';
import { useParams } from 'react-router';
import { toast } from 'sonner';
import { REPORT_TYPE_ICON, REPORT_TYPE_TONE } from '@/components/citizen/reportType';
import { ScreenHeader } from '@/components/citizen/ScreenHeader';
import { ReportPhotos } from '@/components/ReportPhotos';
import { ReportTimeline } from '@/components/ReportTimeline';
import { ReportStatusPill } from '@/components/StatusPill';
import { Skeleton } from '@/components/ui/skeleton';
import { useMyReport, useSettlementLabel } from '@/data/queries';
import { REPORT_SIZE_LABEL, REPORT_TYPE_LABEL } from '@/lib/labels';
import { cn } from '@/lib/utils';

export function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: report, isPending, isError } = useMyReport(id ?? '');
  const settlementLabel = useSettlementLabel();

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40 rounded-full" />
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-32 w-full rounded-3xl" />
      </div>
    );
  }

  if (isError || !report) {
    return (
      <div className="space-y-4">
        <ScreenHeader title="Prijava nije pronađena" backTo="/gradjanin/prijave" />
        <p className="px-1 text-sm text-muted-foreground">Možda je poslata sa drugog uređaja — proveri kratki kod.</p>
      </div>
    );
  }

  const Icon = REPORT_TYPE_ICON[report.tip];

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(report.kratki_kod);
      toast.success('Broj prijave je kopiran');
    } catch {
      toast.error('Kopiranje nije uspelo — prepiši broj ručno.');
    }
  };

  return (
    <div className="space-y-4">
      <ScreenHeader title="Prijava" backTo="/gradjanin/prijave" aside={<ReportStatusPill status={report.status} className="h-7 px-3" />} />

      <div className="rounded-3xl bg-card p-4 shadow-sm ring-1 ring-foreground/5">
        <div className="flex items-center gap-3">
          <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-2xl', REPORT_TYPE_TONE[report.tip])}>
            <Icon className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold">{REPORT_TYPE_LABEL[report.tip]}</p>
            <p className="text-xs text-muted-foreground">
              {settlementLabel(report.naselje_id)}
              {report.velicina ? ` · ${REPORT_SIZE_LABEL[report.velicina].toLowerCase()} količina` : ''}
            </p>
          </div>
        </div>

        {/* Prijava je anonimna: bez naloga nema obaveštenja, pa kod mora da ostane kod građanina. */}
        <button
          type="button"
          onClick={copyCode}
          className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-green-tea px-4 py-3 text-left transition-colors hover:bg-muted"
        >
          <Hash className="size-4 text-forest" />
          <span className="flex-1">
            <span className="block text-[11px] text-muted-foreground">Broj prijave — za proveru telefonom</span>
            <span className="block font-mono text-lg font-semibold tracking-wider">{report.kratki_kod}</span>
          </span>
          <Copy className="size-4 text-muted-foreground" />
        </button>
      </div>

      {report.fotografije.length > 0 ? <ReportPhotos photos={report.fotografije} /> : null}

      {report.opis || report.opis_lokacije ? (
        <div className="space-y-3 rounded-3xl bg-card p-4 shadow-sm ring-1 ring-foreground/5">
          {report.opis ? (
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Opis</p>
              <p className="mt-0.5 text-sm text-pretty">{report.opis}</p>
            </div>
          ) : null}
          {report.opis_lokacije ? (
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Orijentir</p>
              <p className="mt-0.5 text-sm text-pretty">{report.opis_lokacije}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-3xl bg-card p-4 shadow-sm ring-1 ring-foreground/5">
        <p className="mb-3 text-sm font-semibold">Tok prijave</p>
        <ReportTimeline report={report} />
      </div>
    </div>
  );
}
