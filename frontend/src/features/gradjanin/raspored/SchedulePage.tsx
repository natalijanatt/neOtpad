import { AlertTriangle, Clock, MapPinned, MessageCircleMore, PhoneCall, Truck, Users } from 'lucide-react';
import { Link } from 'react-router';
import { Blobs } from '@/components/citizen/Blobs';
import { Illustration } from '@/components/citizen/Illustration';
import { PointsBadge } from '@/components/citizen/PointsBadge';
import { ScreenHeader } from '@/components/citizen/ScreenHeader';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useSchedule, useSettlements } from '@/data/queries';
import type { Weekday } from '@/domain/types';
import { formatDaysUntil, formatWeekdayDate } from '@/lib/format';
import { WEEKDAY_SHORT } from '@/lib/labels';
import { useSettlementPreference } from '@/lib/useSettlementPreference';
import { cn } from '@/lib/utils';

const ALL_WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

export function SchedulePage() {
  const { data: settlements, isPending: settlementsPending } = useSettlements();
  const [settlementId, setSettlementId] = useSettlementPreference();
  const { data: schedule, isPending: schedulePending } = useSchedule(settlementId);

  const settlement = settlements?.find((s) => s.id === settlementId);
  const showNoCollection = settlementId && settlement && !settlement.hasOrganizedCollection;

  return (
    <div className="space-y-5">
      <ScreenHeader title="Kada dolazi kamion" description="Izaberi naselje i vidi raspored odvoza." aside={<PointsBadge />} />

      <div className="space-y-1.5">
        <Label htmlFor="settlement-picker" className="px-1 text-xs text-muted-foreground">
          Naselje
        </Label>
        {settlementsPending ? (
          <Skeleton className="h-12 w-full rounded-full" />
        ) : (
          <Select {...(settlementId ? { value: settlementId } : {})} onValueChange={(v) => setSettlementId(v)}>
            <SelectTrigger
              id="settlement-picker"
              className="h-12! w-full rounded-full border-0 bg-card px-4 text-base shadow-sm ring-1 ring-foreground/5"
            >
              <span className="flex items-center gap-2">
                <MapPinned className="size-4 text-forest" />
                <SelectValue placeholder="Izaberi naselje…" />
              </span>
            </SelectTrigger>
            <SelectContent>
              {settlements?.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!settlementId ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Illustration name="kamion" fallback={Truck} className="size-36" />
          <p className="max-w-60 text-sm text-muted-foreground text-pretty">
            Kad izabereš naselje, ovde stoji datum sledećeg odvoza i nedeljni raspored.
          </p>
        </div>
      ) : schedulePending ? (
        <Skeleton className="h-48 w-full rounded-3xl" />
      ) : showNoCollection ? (
        <div className="relative overflow-hidden rounded-3xl bg-sunflower p-5 text-warning-foreground shadow-sm">
          <Blobs variant="corner" className="opacity-40" />
          <div className="relative flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/50">
              <AlertTriangle className="size-5" />
            </span>
            <div>
              <p className="text-base font-bold">{settlement.name} nema organizovan odvoz</p>
              <p className="mt-1 text-sm text-pretty opacity-90">
                Kamion trenutno ne obilazi ovo naselje po rasporedu. Ako primetiš prepunjen kontejner ili divlju
                deponiju, prijavi je — prijave iz naselja bez odvoza imaju prioritet u planiranju.
              </p>
            </div>
          </div>
          <Button asChild className="relative mt-4 h-11 w-full rounded-full bg-rose text-white hover:bg-rose/90">
            <Link to="/gradjanin/prijava">Prijavi problem</Link>
          </Button>
        </div>
      ) : schedule ? (
        <>
          <div className="relative overflow-hidden rounded-3xl bg-forest p-5 text-white shadow-md">
            <Blobs />
            <div className="relative">
              <p className="flex items-center gap-1.5 text-xs font-medium text-white/80">
                <Truck className="size-3.5" /> Sledeći odvoz
              </p>
              <p className="mt-1 text-2xl leading-tight font-bold capitalize">{formatWeekdayDate(schedule.nextPickupAt)}</p>
              {/* Čipovi kao „statistike“ na kartici: jedan pogled, dva odgovora — kad i u koliko sati. */}
              <div className="mt-4 flex flex-wrap gap-2">
                <Stat icon={Clock} label={schedule.timeWindow} />
                <Stat label={formatDaysUntil(schedule.nextPickupAt)} />
              </div>
            </div>
          </div>

          <section className="rounded-3xl bg-card p-4 shadow-sm ring-1 ring-foreground/5">
            <p className="mb-3 text-sm font-semibold">Nedeljni raspored</p>
            <div className="flex justify-between gap-1">
              {ALL_WEEKDAYS.map((day) => {
                const active = schedule.weekdays.includes(day);
                return (
                  <span key={day} className="flex flex-col items-center gap-1.5">
                    <span
                      className={cn(
                        'flex size-10 items-center justify-center rounded-full text-sm font-semibold capitalize transition-colors',
                        active ? 'bg-forest text-white shadow-sm' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {WEEKDAY_SHORT[day].slice(0, 2)}
                    </span>
                    {active ? <Truck className="size-3.5 text-forest" aria-label="odvoz" /> : <span className="size-3.5" />}
                  </span>
                );
              })}
            </div>
            {schedule.note ? <p className="mt-3 text-xs text-muted-foreground text-pretty">{schedule.note}</p> : null}
          </section>
        </>
      ) : null}

      {/* Ekran je jedan kanal; selo bez pametnog telefona iste informacije
          dobija SMS-om, Viberom ili preko predsednika MZ (CLAUDE.md). */}
      <section className="relative overflow-hidden rounded-3xl bg-card p-4 shadow-sm ring-1 ring-foreground/5">
        <Blobs variant="corner" />
        <div className="relative flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-sour-apple text-forest">
            <PhoneCall className="size-4" />
          </span>
          <p className="text-sm font-semibold">Raspored i bez aplikacije</p>
        </div>
        <p className="relative mt-2 text-sm text-muted-foreground text-pretty">
          Za komšije i ukućane bez pametnog telefona — isti raspored i prijava problema stižu SMS-om, Viberom ili
          preko mesne zajednice. Prosledi im:
        </p>
        <ul className="relative mt-3 space-y-2.5 text-sm">
          <li className="flex items-start gap-2.5">
            <MessageCircleMore className="mt-0.5 size-4 shrink-0 text-forest" />
            <p>
              SMS sa nazivom naselja na <span className="font-semibold">063 0100</span> — odgovor je datum sledećeg
              odvoza i broj za prijavu problema.
            </p>
          </li>
          <li className="flex items-start gap-2.5">
            <MessageCircleMore className="mt-0.5 size-4 shrink-0 text-forest" />
            <p>
              Viber zajednica <span className="font-semibold">„(n)eOtpad“</span> šalje podsetnik pred svaki odvoz i
              prima prijave sa fotografijom.
            </p>
          </li>
          <li className="flex items-start gap-2.5">
            <Users className="mt-0.5 size-4 shrink-0 text-forest" />
            <p>Predsednik mesne zajednice može da prijavi problem u ime svakog ko nije na mreži.</p>
          </li>
        </ul>
      </section>
    </div>
  );
}

function Stat({ icon: Icon, label }: { icon?: typeof Clock; label: string }) {
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/15 px-3 text-sm font-medium backdrop-blur-sm">
      {Icon ? <Icon className="size-3.5" /> : null}
      {label}
    </span>
  );
}
