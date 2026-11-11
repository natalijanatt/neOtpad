import { BookOpen, CalendarDays, Check, ChevronRight, MapPin, Megaphone, Newspaper, Sparkles, Trophy } from 'lucide-react';
import { Link } from 'react-router';
import { Blobs } from '@/components/citizen/Blobs';
import { Illustration } from '@/components/citizen/Illustration';
import { REPORT_TYPE_ICON, REPORT_TYPE_TONE } from '@/components/citizen/reportType';
import { PointsBadge } from '@/components/citizen/PointsBadge';
import { Tile } from '@/components/citizen/Tile';
import { Logo } from '@/components/Logo';
import { ReportStatusPill } from '@/components/StatusPill';
import { Skeleton } from '@/components/ui/skeleton';
import { useMyReports, useSettlementRankings, useSettlements } from '@/data/queries';
import type { Report } from '@/domain/types';
import { formatRelative } from '@/lib/format';
import { REPORT_TYPE_LABEL } from '@/lib/labels';
import { useSettlementPreference } from '@/lib/useSettlementPreference';
import { cn } from '@/lib/utils';

export function HomePage() {
  const { data: reports, isPending } = useMyReports();
  const latest = reports?.[0];

  const [settlementId] = useSettlementPreference();
  const { data: settlements } = useSettlements();
  const { data: rankings } = useSettlementRankings();
  const settlementName = settlements?.find((s) => s.id === settlementId)?.name;
  const myRank = rankings?.find((r) => r.settlementId === settlementId);

  return (
    <div className="space-y-6">
      {/* Logo umesto pozdrava: naslov ekrana je sama aplikacija, a naselje se
          vidi na kartici odvoza odmah ispod. */}
      <header className="flex items-center justify-between gap-3">
        <h1>
          <Logo size="md" />
          <span className="sr-only">(n)eOtpad — početna</span>
        </h1>
        <PointsBadge />
      </header>

      {/* Prijava je jedina radnja koju aplikacija stvarno traži od građanina,
          pa je jedina krupna, koralna kartica; sve ostalo je sekundarno.
          Raspored (sa izborom naselja) ima svoj ekran i pločicu ispod. */}
      <Link
        to="/gradjanin/prijava"
        className="relative flex items-center gap-3 overflow-hidden rounded-3xl bg-forest p-5 text-white shadow-md transition-transform active:scale-[0.99]"
      >
        <Blobs className="opacity-90" />
        <div className="relative min-w-0 flex-1">
          <p className="text-2xl leading-tight font-bold">Prijavi problem</p>
          <p className="mt-1 text-sm text-white/90 text-pretty">Pun kontejner ili divlja deponija — fotografija i lokacija, bez naloga.</p>
          <span className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-full bg-white pr-3 pl-4 text-sm font-semibold text-forest">
            Nova prijava
            <ChevronRight className="size-4" />
          </span>
        </div>
        <Illustration name="prijava" fallback={Megaphone} className="relative -mr-2 size-32 shrink-0" />
      </Link>

      <section className="grid grid-cols-2 gap-3">
        {/* Obojene, ali sa tišom podlogom od hero kartice iznad, da joj ne konkurišu. */}
        <Tile to="/gradjanin/raspored" icon={CalendarDays} tone="jade" label="Raspored" hint="Kada dolazi kamion" muted />
        <Tile to="/gradjanin/mapa" icon={MapPin} tone="sunflower" label="Gde da odložim" hint="Reciklažna mesta" muted />
        <Tile to="/gradjanin/vodic" icon={BookOpen} tone="apple" label="Vodič za otpad" hint="Šta gde ide" muted />
        <Tile to="/gradjanin/vesti" icon={Newspaper} tone="forest" label="Novosti" hint="Obaveštenja JKP-a" muted />
      </section>

      {myRank && settlementName ? (
        <Link
          to="/gradjanin/profil"
          className="flex items-center gap-3 rounded-2xl bg-sunflower/30 px-4 py-3 text-sm ring-1 ring-sunflower/50"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sunflower text-warning-foreground">
            <Trophy className="size-4" />
          </span>
          <p className="min-w-0 flex-1 text-pretty">
            <span className="font-semibold">{settlementName}</span> je <span className="font-semibold">{myRank.rank}.</span>{' '}
            na rang listi ovog meseca
          </p>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      ) : null}

      <section className="space-y-2">
        <SectionHeading title="Poslednja prijava" to="/gradjanin/prijave" linkLabel="Sve prijave" />
        {isPending ? (
          <Skeleton className="h-36 w-full rounded-3xl" />
        ) : latest ? (
          <LastReportCard report={latest} />
        ) : (
          <div className="flex items-center gap-4 rounded-3xl bg-card p-4 shadow-sm ring-1 ring-foreground/5">
            <Illustration name="hvala" fallback={Sparkles} className="size-20 shrink-0" />
            <p className="text-sm text-muted-foreground text-pretty">
              Još nema prijava sa ovog uređaja. Kad primetiš pun kontejner ili deponiju, prijava traje minut.
            </p>
          </div>
        )}
      </section>

    </div>
  );
}

/**
 * Koraci kroz koje prijava prolazi, onako kako ih backend beleži: primljena,
 * potvrđena u trijaži, rešena. Odbijena i duplikat su završna stanja bez
 * rešavanja, pa se prikazuju kao zatvoren tok, ne kao „zaglavljen“ korak.
 */
const TRACK_STEPS = ['Primljena', 'Potvrđena', 'Rešena'] as const;
const STATUS_STEP: Record<Report['status'], number> = { nova: 1, potvrdjena: 2, resena: 3, odbijena: 1, duplikat: 1 };

function LastReportCard({ report }: { report: Report }) {
  const Icon = REPORT_TYPE_ICON[report.tip];
  const reached = STATUS_STEP[report.status];
  const closedEarly = report.status === 'odbijena' || report.status === 'duplikat';

  return (
    <Link to={`/gradjanin/prijave/${report.id}`} className="block rounded-3xl bg-card p-4 shadow-sm ring-1 ring-foreground/5">
      <div className="flex items-center gap-3">
        <span className={cn('flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl', REPORT_TYPE_TONE[report.tip])}>
          <Illustration name={`tip-${report.tip}`} fallback={Icon} plain className="size-full" iconClassName="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{REPORT_TYPE_LABEL[report.tip]}</p>
          <p className="truncate text-xs text-muted-foreground">
            {report.kratki_kod} · {formatRelative(report.primljena_at)}
          </p>
        </div>
        <ReportStatusPill status={report.status} />
      </div>

      {/* Tok kao „praćenje pošiljke“: tačke povezane linijom, dostignute su zelene. */}
      <ol className="mt-4 flex items-start">
        {TRACK_STEPS.map((label, i) => {
          const step = i + 1;
          const done = step <= reached;
          const current = step === reached;
          return (
            <li key={label} className="relative flex flex-1 flex-col items-center gap-1.5">
              {step < TRACK_STEPS.length ? (
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-[9px] left-[calc(50%+10px)] h-0.5 w-[calc(100%-20px)] rounded-full',
                    step < reached ? 'bg-forest' : 'bg-muted',
                  )}
                />
              ) : null}
              <span
                className={cn(
                  'relative flex size-5 items-center justify-center rounded-full ring-4 ring-card',
                  done ? 'bg-forest text-white' : 'bg-muted',
                  current && !closedEarly && 'shadow-[0_0_0_3px_var(--sour-apple)]',
                )}
              >
                {done ? <Check className="size-3" strokeWidth={3} /> : null}
              </span>
              <span className={cn('text-[11px] leading-none', done ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{label}</span>
            </li>
          );
        })}
      </ol>
      {closedEarly ? (
        <p className="mt-3 rounded-2xl bg-muted px-3 py-2 text-xs text-muted-foreground">
          Prijava je zatvorena bez izlaska na teren — detalji i razlog su u toku prijave.
        </p>
      ) : null}
    </Link>
  );
}

function SectionHeading({ title, to, linkLabel }: { title: string; to: string; linkLabel: string }) {
  return (
    <div className="flex items-center justify-between px-1">
      <h2 className="text-sm font-semibold">{title}</h2>
      <Link to={to} className="text-xs font-semibold text-forest">
        {linkLabel}
      </Link>
    </div>
  );
}
