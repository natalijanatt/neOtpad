import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Json } from '../database/generated/schema';
import { ForecastingService } from '../forecasting/forecasting.service';
import type { GeneratePlanRequestDto } from './dto/generate-plan-request.dto';
import type { ListRoutePlansQueryDto } from './dto/list-route-plans-query.dto';
import type { CiljFunkcijaDto } from './dto/objective.dto';
import type {
  GeneratePlanResponseDto,
  KontejnerStopDto,
  RoutePlanDto,
  RouteStopDto,
  UncoveredStopDto,
} from './dto/route-plan.dto';
import { haversineM } from './optimizer/distance.port';
import {
  DEFAULT_PARAMETERS,
  DEFAULT_WEIGHTS,
  type KontejnerKandidat,
  type ObjectiveWeights,
  type PlannedRoute,
  ROUTE_OPTIMIZER,
  type RouteOptimizer,
  type RoutingParameters,
  type ScoredCandidate,
  type ScoredKontejner,
  type StopCandidate,
} from './optimizer/route-optimizer.port';
import {
  type CandidateSources,
  type NewPlan,
  type PlanRow,
  RoutingRepository,
  type StopRow,
} from './routing.repository';
import { pouzdanoOcitavanje } from '../common/readings';

/** A report with GPS but no container id attaches to the nearest point within this. */
const PRIJAVA_RADIUS_M = 300;
const DAY_MS = 86_400_000;

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(
    private readonly repository: RoutingRepository,
    @Inject(ROUTE_OPTIMIZER) private readonly optimizer: RouteOptimizer,
    private readonly forecasting: ForecastingService,
  ) {}

  async generate(request: GeneratePlanRequestDto, sada = new Date()): Promise<GeneratePlanResponseDto> {
    const tezine: ObjectiveWeights = { ...DEFAULT_WEIGHTS, ...stripUndefined(request.tezine) };
    const parametri: RoutingParameters = { ...DEFAULT_PARAMETERS, ...stripUndefined(request.parametri) };
    const ciljFunkcija: CiljFunkcijaDto = { tezine, parametri };
    // One timestamp for every plan this call writes, not `default now()` per
    // row: it is what makes "this generation" a well-defined, queryable unit
    // instead of each vehicle drifting to whichever run last touched it.
    const generisanAt = new Date();

    // Before anything is scored: a plan built on a forecast from before the last
    // collection would rank a container that has just been emptied. Only what is
    // actually stale is recomputed, so this is normally a no-op — except on a
    // freshly reset database, where it is the whole fleet and the first plan of
    // the day pays for it once.
    await this.forecasting.osveziZastarele(sada);

    const [sources, vozila] = await Promise.all([
      this.repository.loadCandidateSources(request.datum),
      this.repository.loadActiveVehicles(),
    ]);
    const kandidati = assembleCandidates(sources, request.datum);

    const output = await this.optimizer.plan({
      datum: localMidnight(request.datum),
      sada,
      vozila: vozila.map((v) => ({
        id: v.id,
        oznaka: v.oznaka,
        kapacitetM3: Number(v.kapacitet_m3),
        depo: { lat: v.lat, lon: v.lon },
      })),
      kandidati,
      tezine,
      parametri,
    });

    // A vehicle with nothing to do is not a plan; a dispatcher approving an
    // empty route would rightly ask what they are approving.
    const nonEmpty = output.rute.filter((r) => r.stajalista.length > 0);
    const plans: NewPlan[] = nonEmpty.map((r) => toNewPlan(r, request.datum, generisanAt, this.optimizer.algoritam, ciljFunkcija));
    const ids = await this.repository.withTransaction((repo) => repo.insertPlans(plans));

    this.logger.log(
      `plan ${request.datum}: ${kandidati.length} candidates, ${ids.length} routes, ` +
        `${output.nepokriveno.length} uncovered, ${output.preskoceno.length} skipped`,
    );

    return {
      datum: request.datum,
      planovi: await this.loadPlans({ ids }),
      nepokriveno: output.nepokriveno.map(
        (u): UncoveredStopDto => ({ ...stopLocation(u.kandidat, tezine.min_odnos), razlogNepokrivenosti: u.razlog }),
      ),
      preskoceno: output.preskoceno.length,
      preskocenaLista: output.preskoceno
        .slice()
        .sort((a, b) => b.prioritet - a.prioritet)
        .map((c) => stopLocation(c, tezine.min_odnos)),
      ciljFunkcija,
    };
  }

  /**
   * "Today's plan" means the single most recent generation — every vehicle
   * that got a route in that run, nothing stitched in from an earlier one.
   * A vehicle with zero stops in the latest run simply has no card, rather
   * than reappearing with a stale route from before.
   */
  async list(query: ListRoutePlansQueryDto): Promise<RoutePlanDto[]> {
    const datum = query.datum ?? todayIso();
    const generisanAt = await this.repository.findLatestGeneration(datum);
    if (generisanAt === null) return [];
    return this.loadPlans({ datum, generisanAt, status: query.status });
  }

  async get(id: string): Promise<RoutePlanDto> {
    const [plan] = await this.loadPlans({ ids: [id] });
    if (plan === undefined) {
      throw new NotFoundException(`Plan rute ${id} ne postoji.`);
    }
    return plan;
  }

  /** One mapping path for generated and listed plans, so the two never drift. */
  private async loadPlans(filter: {
    ids?: readonly string[];
    datum?: string;
    status?: string;
    generisanAt?: Date;
  }): Promise<RoutePlanDto[]> {
    const plans = await this.repository.findPlans(filter);
    const stops = await this.repository.findStops(plans.map((p) => p.id));
    const byPlan = new Map<string, StopRow[]>();
    for (const s of stops) {
      const list = byPlan.get(s.plan_rute_id) ?? [];
      list.push(s);
      byPlan.set(s.plan_rute_id, list);
    }
    return plans.map((p) => toPlanDto(p, byPlan.get(p.id) ?? []));
  }
}

// ---------------------------------------------------------------------------
// Candidate assembly: the fan-in of the repository's per-source rows.
// ---------------------------------------------------------------------------

export function assembleCandidates(s: CandidateSources, datum: string): StopCandidate[] {
  const prognoze = new Map(s.prognoze.map((p) => [p.kontejner_id, p.vreme_kriticnog]));
  const praznjenja = new Map(s.praznjenja.map((p) => [p.kontejner_id, p.poslednje]));
  const rizikMesta = new Map<string, { skor: number; klasifikacija: string }>();
  const rizikNaselja = new Map<string, { skor: number; klasifikacija: string }>();
  for (const r of s.rizici) {
    const target = r.subjekat_tip === 'sabirno_mesto' ? rizikMesta : rizikNaselja;
    target.set(r.subjekat_id, { skor: Number(r.skor), klasifikacija: r.klasifikacija });
  }

  const naseljePoMestu = new Map(s.sabirnaMesta.map((sm) => [sm.id, sm.naselje_id]));

  // A report names a container when the citizen could; an SMS gives at best a
  // location. A container-specific report attaches to that container alone —
  // the sensor and the fault it reports live on one bin, not the whole point.
  // A location-only report is shared by every container the truck would empty
  // there, since the citizen never said which one.
  const prijavaPoKontejneru = new Map<string, { id: string; tip: string }>();
  const prijavaPoMestu = new Map<string, { id: string; tip: string }>();
  for (const p of s.prijave) {
    if (p.kontejner_id !== null) {
      if (!prijavaPoKontejneru.has(p.kontejner_id)) prijavaPoKontejneru.set(p.kontejner_id, { id: p.id, tip: p.tip });
      continue;
    }
    if (p.lat === null || p.lon === null) continue;
    const mestoId = nearestWithin(s.sabirnaMesta, { lat: p.lat, lon: p.lon }, PRIJAVA_RADIUS_M);
    if (mestoId !== undefined && !prijavaPoMestu.has(mestoId)) {
      prijavaPoMestu.set(mestoId, { id: p.id, tip: p.tip });
    }
  }

  const kontejneriPoMestu = new Map<string, KontejnerKandidat[]>();
  for (const k of s.kontejneri) {
    // The schedule is per waste stream (`plan_odvoza.tip_otpada`), so a
    // suvi_reciklabilni bin's cycle is never read off a komunalni row at the
    // same point.
    const naseljeId = naseljePoMestu.get(k.sabirno_mesto_id);
    const rasporedi =
      naseljeId === undefined ? [] : s.rasporedi.filter((r) => r.naselje_id === naseljeId && r.tip_otpada === k.tip_otpada);

    const list = kontejneriPoMestu.get(k.sabirno_mesto_id) ?? [];
    list.push({
      kontejnerId: k.id,
      oznaka: k.oznaka,
      tipOtpada: k.tip_otpada,
      zapreminaL: k.zapremina_l,
      fillPercent: k.fill_percent,
      pouzdano: pouzdanoOcitavanje(k.aktivni_status, k.tih_od),
      vremeKriticnog: prognoze.get(k.id) ?? null,
      imaSenzor: s.senzori.has(k.id),
      poslednjePraznjenje: praznjenja.get(k.id) ?? null,
      prijava: prijavaPoKontejneru.get(k.id) ?? prijavaPoMestu.get(k.sabirno_mesto_id) ?? null,
      rutinskiDanas: rasporedi.some((r) => landsOn(r, datum)),
      ciklusDana: rasporedi.length === 0 ? null : Math.min(...rasporedi.map((r) => r.ciklus_dana)),
    });
    kontejneriPoMestu.set(k.sabirno_mesto_id, list);
  }

  return s.sabirnaMesta
    .filter((sm) => kontejneriPoMestu.has(sm.id))
    .map((sm) => ({
      sabirnoMestoId: sm.id,
      naseljeId: sm.naselje_id,
      naziv: sm.naziv,
      tacka: { lat: sm.lat, lon: sm.lon },
      brojDomacinstava: sm.broj_domacinstava,
      organizovanoPrikupljanje: sm.organizovano_prikupljanje,
      kontejneri: kontejneriPoMestu.get(sm.id)!,
      rizik: rizikMesta.get(sm.id) ?? rizikNaselja.get(sm.naselje_id) ?? null,
    }));
}

function nearestWithin(
  mesta: readonly { id: string; lat: number; lon: number }[],
  tacka: { lat: number; lon: number },
  radiusM: number,
): string | undefined {
  let best: { id: string; d: number } | null = null;
  for (const m of mesta) {
    const d = haversineM(tacka, { lat: m.lat, lon: m.lon });
    if (d <= radiusM && (best === null || d < best.d)) best = { id: m.id, d };
  }
  return best?.id;
}

/**
 * Does a schedule row fire on `datum`? Weekday must match; for anything longer
 * than weekly, the anchor date decides which week it is (`plan_odvoza` comment).
 */
export function landsOn(
  r: { dan_u_nedelji: number; ciklus_dana: number; referentni_datum: Date | null },
  datum: string,
): boolean {
  const day = utcMidnight(datum);
  const isoDow = ((day.getUTCDay() + 6) % 7) + 1;
  if (isoDow !== r.dan_u_nedelji) return false;
  if (r.ciklus_dana <= 7) return true;
  if (r.referentni_datum === null) return false;
  const anchor = utcMidnight(isoDate(r.referentni_datum));
  const days = Math.round((day.getTime() - anchor.getTime()) / DAY_MS);
  return days % r.ciklus_dana === 0;
}

// ---------------------------------------------------------------------------
// Row ↔ DTO mapping.
// ---------------------------------------------------------------------------

/**
 * Which container is the reason the stop exists — the one whose own score
 * equals the stop's (`prioritetOf` copies it from there). Used wherever a
 * stop-level field (the `prijava_id` FK, the summary DTO) needs one container's
 * answer rather than the full per-container breakdown.
 */
function najgoriKontejner(c: ScoredCandidate): ScoredKontejner {
  return c.kontejneri.find((k) => k.prioritet === c.prioritet) ?? c.kontejneri[0];
}

/**
 * Display only: the truck still empties every container physically at the
 * point (capacity and timing in the optimiser count all of them, unchanged).
 * This is what the stop *shows* — a container whose own priority never
 * cleared the noise floor (`min_odnos`, the same constant an optional stop
 * competes on) doesn't belong in a list of "why is the truck here", even
 * though it rides along for free once the truck is already stopping.
 * Never empties out entirely: the container that put the stop on the route
 * always stays, whatever its own number is.
 */
export function relevantKontejneri(c: ScoredCandidate, minOdnos: number): ScoredKontejner[] {
  const relevant = c.kontejneri.filter((k) => k.prioritet >= minOdnos);
  return relevant.length > 0 ? relevant : [najgoriKontejner(c)];
}

function kontejnerStopOf(k: ScoredKontejner): KontejnerStopDto {
  return {
    kontejnerId: k.kontejnerId,
    oznaka: k.oznaka,
    tipOtpada: k.tipOtpada,
    ocekivanoPunjenje: k.pouzdano && k.fillPercent !== null ? k.fillPercent : 0,
    imaOcitavanje: k.pouzdano && k.fillPercent !== null,
    razlog: k.razlog,
    prioritet: round3(k.prioritet),
    obavezno: k.obavezno,
    komponente: k.komponente,
    ...(k.prijava === null ? {} : { prijavaId: k.prijava.id }),
  };
}

function toNewPlan(r: PlannedRoute, datum: string, generisanAt: Date, algoritam: string, cilj: CiljFunkcijaDto): NewPlan {
  return {
    datum,
    vozilo_id: r.vozilo.id,
    generisan_at: generisanAt,
    algoritam,
    cilj_funkcija: cilj as unknown as Json,
    ukupna_distanca_m: r.ukupnaDistancaM,
    ukupno_trajanje_min: r.ukupnoTrajanjeMin,
    stajalista: r.stajalista.map((s) => ({
      redosled: s.redosled,
      sabirno_mesto_id: s.kandidat.sabirnoMestoId,
      prijava_id: najgoriKontejner(s.kandidat).prijava?.id ?? null,
      planirani_dolazak: s.planiraniDolazak,
      ocekivano_punjenje: Math.round(s.kandidat.ocekivanoPunjenje),
      razlog: s.kandidat.razlog,
      doprinos_ceni: round2(s.doprinosCeniMin),
      prioritet: round3(s.kandidat.prioritet),
      // No columns for the per-container breakdown, the mandatory flag or the
      // has-a-reading flag, so all three ride inside the same jsonb the
      // point-level terms already use — reserved keys, read back by toStopDto.
      komponente: {
        ...s.kandidat.komponente,
        kontejneri: relevantKontejneri(s.kandidat, cilj.tezine.min_odnos).map(kontejnerStopOf),
        obavezno: s.kandidat.obavezno,
        imaOcitavanje: s.kandidat.kontejneri.some((k) => k.pouzdano && k.fillPercent !== null),
      } as unknown as Json,
    })),
  };
}

function stopLocation(c: ScoredCandidate, minOdnos: number) {
  const top = najgoriKontejner(c);
  return {
    sabirnoMestoId: c.sabirnoMestoId,
    naseljeId: c.naseljeId,
    naziv: c.naziv,
    lat: c.tacka.lat,
    lon: c.tacka.lon,
    razlog: c.razlog,
    prioritet: round3(c.prioritet),
    obavezno: c.obavezno,
    komponente: c.komponente,
    kontejneri: relevantKontejneri(c, minOdnos).map(kontejnerStopOf),
    ...(top.prijava === null ? {} : { prijavaId: top.prijava.id }),
  };
}

function toPlanDto(p: PlanRow, stops: readonly StopRow[]): RoutePlanDto {
  const depo = { lat: p.depo_lat, lon: p.depo_lon };
  const stajalista = stops.map(toStopDto);
  return {
    id: p.id,
    datum: p.datum,
    voziloId: p.vozilo_id,
    voziloOznaka: p.vozilo_oznaka,
    status: p.status,
    algoritam: p.algoritam,
    generisanAt: p.generisan_at.toISOString(),
    ukupnaDistancaM: p.ukupna_distanca_m ?? 0,
    ukupnoTrajanjeMin: p.ukupno_trajanje_min ?? 0,
    stajalista,
    putanja: [depo, ...stajalista.map((s) => ({ lat: s.lat, lon: s.lon })), depo],
    ciljFunkcija: p.cilj_funkcija as unknown as CiljFunkcijaDto,
  };
}

function toStopDto(s: StopRow): RouteStopDto {
  // The inverse of toNewPlan's embedding: split the per-container breakdown,
  // the mandatory flag and the has-a-reading flag back out of the jsonb blob
  // they were stored in. Rows written before these fields existed simply have
  // no key for them — default to false rather than claim a mandatory stop
  // wasn't one, or that a real reading exists when none was ever recorded.
  const { kontejneri, obavezno, imaOcitavanje, ...komponente } = (s.komponente ?? {}) as {
    kontejneri?: KontejnerStopDto[];
    obavezno?: boolean;
    imaOcitavanje?: boolean;
  } & Record<string, unknown>;

  return {
    redosled: s.redosled,
    // A stop always points at a sabirno_mesto in phase 1 (the service writes
    // nothing else), so the joined columns are only null for a row somebody
    // wrote by hand; degrade to placeholders rather than fail the whole plan.
    sabirnoMestoId: s.sabirno_mesto_id ?? '',
    naseljeId: s.naselje_id ?? '',
    naziv: s.naziv ?? '',
    lat: s.lat ?? 0,
    lon: s.lon ?? 0,
    razlog: s.razlog as RouteStopDto['razlog'],
    prioritet: s.prioritet === null ? 0 : Number(s.prioritet),
    obavezno: obavezno ?? false,
    komponente: komponente as RouteStopDto['komponente'],
    kontejneri: kontejneri ?? [],
    ocekivanoPunjenje: s.ocekivano_punjenje ?? 0,
    imaOcitavanje: imaOcitavanje ?? false,
    planiraniDolazak: (s.planirani_dolazak ?? new Date(0)).toISOString(),
    doprinosCeniMin: s.doprinos_ceni === null ? 0 : Number(s.doprinos_ceni),
    ...(s.prijava_id === null ? {} : { prijavaId: s.prijava_id }),
  };
}

// ---------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------

function stripUndefined<T extends object>(value: T | undefined): Partial<T> {
  if (value === undefined) return {};
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** `YYYY-MM-DD` as local midnight: the shift starts on the depot's clock. */
function localMidnight(datum: string): Date {
  const [y, m, d] = datum.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function utcMidnight(datum: string): Date {
  const [y, m, d] = datum.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayIso(): string {
  return isoDate(new Date());
}

const round2 = (x: number): number => Math.round(x * 100) / 100;
const round3 = (x: number): number => Math.round(x * 1000) / 1000;
