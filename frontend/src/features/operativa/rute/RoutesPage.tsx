import { useMemo, useState } from 'react';
import { AlertTriangle, Info, Loader2, MapPin, RefreshCw, Truck } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { FillLevelBadge } from '@/components/FillLevelBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { RoutePlan } from '@/data/repo';
import { useGenerateRoutePlan, useRoutePlans } from '@/data/queries';
import { formatNumber, formatTime } from '@/lib/format';
import { routeColor } from '@/lib/routeColors';
import { cn } from '@/lib/utils';
import { RouteMap } from './RouteMap';

/** `YYYY-MM-DD` u lokalnoj zoni — isto što backend traži u `datum`. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Backend now returns exactly one generation (`GET /routes` picks the latest
 * `generisan_at` across every vehicle, `routing.service.ts`), so this is just
 * a stable display order — no more per-vehicle "which one is newest" logic
 * needed here.
 */
function byVehicle(plans: readonly RoutePlan[]): RoutePlan[] {
  return [...plans].sort((a, b) => a.voziloOznaka.localeCompare(b.voziloOznaka));
}

// „Redovan raspored" znači tačno to i ništa drugo — da je pogođen pravi red iz
// plan_odvoza za taj dan. bez_senzora/domacinstva su svoje, slabije opravdanje
// (kontejner nema senzor pa se koristi ciklus; ili prosto opslužuje mnogo
// domaćinstava) i ne smeju da se prikažu kao da je danas zakazan odvoz.
const RAZLOG_LABEL: Record<RoutePlan['stajalista'][number]['razlog'], string> = {
  prelivanje_rizik: 'Prelivanje',
  rizik_divlje_deponije: 'Rizik / pokrivenost',
  prijava: 'Prijava građana',
  rutinski: 'Redovan raspored',
  // Ne "odavno" — to bi tvrdilo poznat datum poslednjeg pražnjenja, a često
  // ga uopšte nema (nikad zabeleženo, ne "zabeleženo pa davno").
  bez_senzora: 'Bez senzora — pražnjenje nije potvrđeno',
  domacinstva: 'Mnogo domaćinstava',
  usput: 'Usput',
};

const RAZLOG_CLASS: Record<RoutePlan['stajalista'][number]['razlog'], string> = {
  prelivanje_rizik: 'bg-priority-critical/15 text-priority-critical',
  rizik_divlje_deponije: 'bg-priority-high/15 text-priority-high',
  prijava: 'bg-priority-medium/20 text-priority-medium',
  rutinski: 'bg-muted text-muted-foreground',
  bez_senzora: 'bg-muted text-muted-foreground',
  domacinstva: 'bg-muted text-muted-foreground',
  usput: 'bg-muted text-muted-foreground',
};

const TIP_OTPADA_LABEL: Record<RoutePlan['stajalista'][number]['kontejneri'][number]['tipOtpada'], string> = {
  komunalni: 'Komunalni',
  suvi_reciklabilni: 'Suvi reciklabilni',
  staklo: 'Staklo',
  pet: 'PET',
  papir: 'Papir',
  metal: 'Metal',
  bio: 'Bio',
  kabasti: 'Kabasti',
  gradjevinski: 'Građevinski',
};

const STATUS_LABEL: Record<string, string> = {
  predlog: 'Predlog',
  odobren: 'Odobren',
  u_toku: 'U toku',
  zavrsen: 'Završen',
  odbijen: 'Odbijen',
};

const TERMIN_LABEL: Record<string, string> = {
  prelivanje: 'Prelivanje (prognoza / popunjenost)',
  rizik: 'Rizik divlje deponije na lokaciji',
  prijava: 'Prijava građana',
  pokrivenost: 'Van organizovanog prikupljanja',
  domacinstva: 'Broj domaćinstava na tački',
  rutinski: 'Redovan raspored za taj otpad',
  bez_senzora: 'Bez senzora — pražnjenje nije potvrđeno',
};

/**
 * Zašto je stanica kandidat, koji prag je presudio da uđe, i zašto je na tom
 * mestu u redosledu — ista pitanja koja bi dispečer postavio, odgovorena iz
 * onoga što backend već vraća (docs/routing-heuristic.md, „Prag #1"/„Prag #2").
 * `stop.komponente`/`razlog`/`prioritet`/`obavezno` su već najgoreg kontejnera
 * na toj tački (routing.service.ts), ne treba ih ponovo računati ovde.
 */
function StopExplanation({ stop, tezine }: { stop: RoutePlan['stajalista'][number]; tezine: RoutePlan['ciljFunkcija']['tezine'] }) {
  const termini = Object.entries(stop.komponente)
    .filter(([, v]) => v.vrednost > 0)
    .sort(([, a], [, b]) => b.doprinos - a.doprinos);
  const odnos = stop.doprinosCeniMin > 0 ? stop.prioritet / stop.doprinosCeniMin : Infinity;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Objašnjenje stanice">
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-80 text-left">
        <div className="space-y-2">
          <div>
            <p className="font-medium">Zašto je kandidat</p>
            {termini.length === 0 ? (
              <p className="text-background/80">Nijedan signal nije aktivan — na ruti je „usput".</p>
            ) : (
              <ul className="mt-0.5 space-y-0.5">
                {termini.map(([term, v]) => (
                  <li key={term} className="flex justify-between gap-3 text-background/80">
                    <span>{TERMIN_LABEL[term] ?? term}</span>
                    <span className="tabular-nums">
                      {v.vrednost.toFixed(2)} × težina = {v.doprinos.toFixed(3)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-background/80">
              Ukupan prioritet {stop.prioritet.toFixed(3)} — najjači razlog je „{RAZLOG_LABEL[stop.razlog]}".
            </p>
          </div>
          <div>
            <p className="font-medium">{stop.obavezno ? 'Zašto je OBAVEZNA' : 'Zašto je OPCIONA — ušla jer je jeftina'}</p>
            {stop.obavezno ? (
              <p className="text-background/80">
                Prioritet {stop.prioritet.toFixed(3)} {stop.prioritet >= tezine.prag_obaveznog ? '≥' : '<'} prag{' '}
                {tezine.prag_obaveznog.toFixed(2)}
                {stop.prioritet < tezine.prag_obaveznog
                  ? ' — prag nije pređen, ali je ispunjen direktan uslov (prognoza ≤48h, pouzdano ≥80%, ili otvorena prijava).'
                  : '.'}{' '}
                Ulazi bez obzira na udaljenost.
              </p>
            ) : (
              <p className="text-background/80">
                Prioritet ÷ trošak umetanja = {stop.prioritet.toFixed(3)} ÷ {stop.doprinosCeniMin.toFixed(1)} min ={' '}
                {odnos.toFixed(4)} — {odnos >= tezine.min_odnos ? '≥' : '<'} prag {tezine.min_odnos.toFixed(3)}. Konačan
                redosled zatim bira najkraće ukupno vreme vožnje (2-opt / Or-opt), ne redosled kojim su stanice
                ubacivane.
              </p>
            )}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Jedini ekran koji čita pravi backend (`GreedyRiskAwarePlanner`) umesto
 * src/data/mock — vidi docs/routing-heuristic.md za algoritam iza ovoga.
 */
export function RoutesPage() {
  const [datum, setDatum] = useState(todayIso());
  const { data: planovi, isPending, isError } = useRoutePlans(datum);
  const generate = useGenerateRoutePlan();

  const lastResult = generate.data?.datum === datum ? generate.data : undefined;
  // Generisanje pravi nov predlog svaki put (istorija se čuva namerno), ali
  // GET /routes vraća samo poslednju celu generaciju za taj dan — nikad
  // pomešano sa nekim starijim pozivom čije je vozilo ovog puta ostalo prazno.
  const shown = byVehicle(lastResult?.planovi ?? planovi ?? []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rute"
        description="Dnevni plan po vozilu — stanice biraju hitnost prelivanja, rizik i prijave; redosled bira vreme vožnje."
        actions={
          <>
            <Label htmlFor="datum" className="sr-only">
              Datum
            </Label>
            <Input id="datum" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} className="w-40" />
            <Button onClick={() => generate.mutate(datum)} disabled={generate.isPending}>
              {generate.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Generiši plan
            </Button>
          </>
        }
      />

      {isError ? <p className="text-sm text-destructive">Planovi trenutno nisu dostupni — backend ne odgovara.</p> : null}
      {generate.isError ? <p className="text-sm text-destructive">Generisanje plana nije uspelo.</p> : null}

      {lastResult ? (
        <p className="text-xs text-muted-foreground">
          Generisano upravo sada · algoritam: {shown[0]?.algoritam ?? '—'} · {formatNumber(shown.length)} vozil
          {shown.length === 1 ? 'o' : 'a'} dobilo rutu
        </p>
      ) : null}

      {lastResult && lastResult.preskocenaLista.length > 0 ? (
        <details className="rounded-lg border text-sm">
          <summary className="cursor-pointer px-4 py-2.5 text-muted-foreground select-none">
            {lastResult.preskoceno} opcion{lastResult.preskoceno === 1 ? 'a stanica nije ušla' : 'e stanice nisu ušle'} u plan — nije se
            isplatilo skretanje
          </summary>
          <div className="space-y-1 border-t px-4 py-2.5">
            {lastResult.preskocenaLista.map((c) => (
              <div key={c.sabirnoMestoId} className="flex items-center justify-between gap-2">
                <span>{c.naziv}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span
                    className={cn(
                      'inline-flex h-5 items-center rounded-full px-2 font-medium whitespace-nowrap',
                      RAZLOG_CLASS[c.razlog],
                    )}
                  >
                    {RAZLOG_LABEL[c.razlog]}
                  </span>
                  prioritet {c.prioritet.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {lastResult && lastResult.nepokriveno.length > 0 ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="size-4" />
              {lastResult.nepokriveno.length} obavezn{lastResult.nepokriveno.length === 1 ? 'a stanica nije' : 'e stanice nisu'} stala
              {lastResult.nepokriveno.length === 1 ? 'a' : 'e'} u plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {lastResult.nepokriveno.map((u) => (
              <div key={u.sabirnoMestoId} className="flex items-center justify-between gap-2">
                <span>{u.naziv}</span>
                <Badge variant="destructive">
                  {u.razlogNepokrivenosti === 'kapacitet'
                    ? 'nema kapaciteta'
                    : u.razlogNepokrivenosti === 'radno_vreme'
                      ? 'nema vremena u smeni'
                      : 'nema aktivnog vozila'}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="Nema plana za ovaj datum"
          description="Klikni „Generiši plan“ — heuristika bira stanice po riziku od prelivanja, prijavama i pokrivenosti naselja, pa ih redom obilazi najkraćim putem."
          action={
            <Button onClick={() => generate.mutate(datum)} disabled={generate.isPending}>
              {generate.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Generiši plan
            </Button>
          }
        />
      ) : (
        <Tabs defaultValue="lista">
          <TabsList>
            <TabsTrigger value="lista">Lista</TabsTrigger>
            <TabsTrigger value="mapa">Mapa</TabsTrigger>
          </TabsList>
          <TabsContent value="lista" className="space-y-4">
            {shown.map((plan) => (
              <RoutePlanCard key={plan.id} plan={plan} />
            ))}
          </TabsContent>
          <TabsContent value="mapa">
            <RouteMapSection plans={shown} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

/**
 * Tvoja lokacija + sve rute odjednom, svaka u svojoj boji (`lib/routeColors`)
 * — kad ima više vozila, čipovi ih pale/gase kao slojeve na `MapPage`-u.
 * Boja se dodeljuje po redosledu iz `plans` (stabilnom, `byVehicle` u
 * `RoutesPage`), pa vozilo ne menja boju kad se neko drugo sakrije.
 */
function RouteMapSection({ plans }: { plans: readonly RoutePlan[] }) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const colored = useMemo(() => plans.map((plan, i) => ({ plan, color: routeColor(i) })), [plans]);
  const visible = colored.filter(({ plan }) => !hidden.has(plan.id));
  const anyStops = plans.some((p) => p.stajalista.length > 0);

  return (
    <div className="space-y-3">
      {plans.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          {colored.map(({ plan, color }) => {
            const isHidden = hidden.has(plan.id);
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => toggle(plan.id)}
                aria-pressed={!isHidden}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  isHidden ? 'text-muted-foreground hover:bg-muted' : 'border-transparent text-white',
                )}
                style={isHidden ? undefined : { backgroundColor: color }}
              >
                <span className="size-2.5 rounded-full" style={{ backgroundColor: isHidden ? color : 'white' }} />
                {plan.voziloOznaka}
                <span className={cn('rounded-full px-1.5 text-[10px]', isHidden ? 'bg-muted' : 'bg-white/25')}>{plan.stajalista.length}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {!anyStops ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Nema stanica ni u jednoj ruti.</p>
      ) : visible.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Sva vozila su sakrivena — klikni na čip da vratiš rutu.</p>
      ) : (
        <RouteMap routes={visible} className="h-[60vh] min-h-[420px]" />
      )}
    </div>
  );
}

function RoutePlanCard({ plan }: { plan: RoutePlan }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Truck className="size-4 text-muted-foreground" />
          {plan.voziloOznaka}
        </CardTitle>
        <Badge variant={plan.status === 'predlog' ? 'secondary' : 'outline'}>{STATUS_LABEL[plan.status] ?? plan.status}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{formatNumber(Math.round(plan.ukupnaDistancaM / 1000))} km</span>
          <span>{plan.ukupnoTrajanjeMin} min</span>
          <span>{plan.stajalista.length} stanica</span>
        </div>

        {plan.stajalista.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Nema stanica u ovoj ruti.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-6">#</TableHead>
                <TableHead>Sabirno mesto</TableHead>
                <TableHead>Kontejner</TableHead>
                <TableHead>Razlog</TableHead>
                <TableHead>Punjenje</TableHead>
                <TableHead>Dolazak</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plan.stajalista.flatMap((stop) => {
                // Red je kontejner, ne stanica — senzor je na kontejneru, ne na
                // sabirnom mestu, pa svaki nosi sopstveni razlog/punjenje.
                // Kolone koje su zajedničke za tačku (redosled, naziv, dolazak)
                // se spajaju preko svih kontejnera na njoj.
                const kontejneri = stop.kontejneri.length > 0 ? stop.kontejneri : null;
                const rowSpan = kontejneri?.length ?? 1;
                return (kontejneri ?? [null]).map((k, i) => (
                  <TableRow key={`${plan.id}-${stop.redosled}-${k?.kontejnerId ?? 'nepoznato'}`}>
                    {i === 0 ? (
                      <>
                        <TableCell rowSpan={rowSpan} className="align-top text-muted-foreground tabular-nums">
                          {stop.redosled}
                        </TableCell>
                        <TableCell rowSpan={rowSpan} className="align-top">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{stop.naziv}</span>
                            <StopExplanation stop={stop} tezine={plan.ciljFunkcija.tezine} />
                          </div>
                        </TableCell>
                      </>
                    ) : null}
                    {k === null ? (
                      <TableCell colSpan={3} className="text-sm text-muted-foreground">
                        Nema podataka o kontejneru.
                      </TableCell>
                    ) : (
                      <>
                        <TableCell>
                          <div className="flex flex-col leading-tight">
                            <span className="font-medium">{k.oznaka}</span>
                            <span className="text-xs text-muted-foreground">{TIP_OTPADA_LABEL[k.tipOtpada]}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-0.5">
                            <span className={cn('inline-flex h-5 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap', RAZLOG_CLASS[k.razlog])}>
                              {RAZLOG_LABEL[k.razlog]}
                            </span>
                            <span
                              className={cn(
                                'text-[10px] font-medium uppercase tracking-wide',
                                k.obavezno ? 'text-priority-critical' : 'text-muted-foreground',
                              )}
                            >
                              {k.obavezno ? 'Obavezno' : 'Opciono'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {k.imaOcitavanje ? (
                            <FillLevelBadge level={k.ocekivanoPunjenje} />
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Nema očitavanja</span>
                          )}
                        </TableCell>
                      </>
                    )}
                    {i === 0 ? (
                      <TableCell rowSpan={rowSpan} className="align-top text-muted-foreground">
                        {formatTime(stop.planiraniDolazak)}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ));
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
