import type { Tacka } from '../../common/geo';
import type { AppTipOtpada, AppTrojstvo } from '../../database/generated/schema';

/**
 * Phase 1 ships `GreedyRiskAwarePlanner`; phase 3 swaps in OR-Tools behind the
 * same token (di-use-interfaces-tokens). Nothing else in routing changes.
 */
export const ROUTE_OPTIMIZER = Symbol('ROUTE_OPTIMIZER');

/**
 * One container at a collection point, with everything routing may read about
 * it. The sensor is mounted on the container, not the point, so every signal
 * that can vary by container lives here rather than on `StopCandidate` — a
 * suvi_reciklabilni bin's cycle and a komunalni bin's fill level next to it are
 * never the same number.
 */
export interface KontejnerKandidat {
  kontejnerId: string;
  oznaka: string;
  tipOtpada: AppTipOtpada;
  zapreminaL: number;
  /** `kontejner_stanje.fill_percent`; null when the container has never reported. */
  fillPercent: number | null;
  /**
   * False when the last reading carried a diagnostic code or the device has gone
   * silent. An unreliable fill level is a maintenance task, never a routing
   * signal (`sensor-telemetry.md`), so the priority function zeroes it out.
   */
  pouzdano: boolean;
  /** `prognoza_punjenja.vreme_kriticnog` of the latest forecast, if any. */
  vremeKriticnog: Date | null;
  imaSenzor: boolean;
  poslednjePraznjenje: Date | null;
  /** An open, confirmed citizen report about this specific container, if any. */
  prijava: { id: string; tip: string } | null;
  /** The published schedule for this container's own waste stream lands today. */
  rutinskiDanas: boolean;
  /** `plan_odvoza.ciklus_dana` for this container's stream, when a schedule exists. */
  ciklusDana: number | null;
}

/**
 * A collection point as the optimiser sees it. One candidate per active
 * `sabirno_mesto`: a truck stops once per physical location and empties every
 * container there, so containers sharing a point are never separate stops —
 * but everything below `kontejneri` that could vary per container does.
 */
export interface StopCandidate {
  sabirnoMestoId: string;
  naseljeId: string;
  naziv: string;
  tacka: Tacka;
  brojDomacinstava: number | null;
  organizovanoPrikupljanje: AppTrojstvo;
  kontejneri: KontejnerKandidat[];
  /** Latest `rizik` row for the point, or for its settlement when the point has none. */
  rizik: { skor: number; klasifikacija: string } | null;
}

/** The terms of the priority function, each in 0..1. Kept per stop so the UI can say why. */
export type PrioritetTerm =
  | 'prelivanje'
  | 'rizik'
  | 'prijava'
  | 'pokrivenost'
  | 'domacinstva'
  | 'rutinski'
  | 'bez_senzora';

export const PRIORITET_TERMS: readonly PrioritetTerm[] = [
  'prelivanje',
  'rizik',
  'prijava',
  'pokrivenost',
  'domacinstva',
  'rutinski',
  'bez_senzora',
];

/**
 * `stajaliste_rute.razlog` is a plain `text` column (no CHECK), and this is
 * the vocabulary this optimiser writes into it. `rutinski` means only one
 * thing: today matched a real `plan_odvoza` row for that container's stream —
 * it does not double as a bucket for "some other weak signal fired", which is
 * what `bez_senzora`/`domacinstva` are for. Collapsing those into `rutinski`
 * was the bug: a stop can legitimately be `obavezno: false` (cheap, optional)
 * while still reading "regular schedule", which claims a fixed pickup day
 * that was never actually checked.
 */
export type RazlogStajalista =
  | 'rutinski'
  | 'prelivanje_rizik'
  | 'rizik_divlje_deponije'
  | 'prijava'
  | 'bez_senzora'
  | 'domacinstva'
  | 'usput';

export interface PrioritetKomponenta {
  vrednost: number;
  doprinos: number;
}

export type PrioritetKomponente = Record<PrioritetTerm, PrioritetKomponenta>;

/** One container, scored. Every term above is evaluated against this container alone. */
export interface ScoredKontejner extends KontejnerKandidat {
  prioritet: number;
  obavezno: boolean;
  razlog: RazlogStajalista;
  komponente: PrioritetKomponente;
}

/**
 * A stop, scored. `prioritet`/`obavezno`/`razlog`/`komponente` are the worst
 * (highest-priority) container's — visiting the point is driven by whichever
 * container needs it most, and the rest ride along since the truck is already
 * there. `kontejneri` keeps every container's own score for the UI, so "why is
 * the truck here" never has to guess which container actually triggered it.
 */
export interface ScoredCandidate extends Omit<StopCandidate, 'kontejneri'> {
  kontejneri: ScoredKontejner[];
  prioritet: number;
  /** Goes into the plan before any distance is looked at. */
  obavezno: boolean;
  razlog: RazlogStajalista;
  komponente: PrioritetKomponente;
  /** Fill the truck should expect on arrival, 0..100; the max over the point's containers. */
  ocekivanoPunjenje: number;
}

/**
 * Weights of the priority terms plus the two thresholds that turn a score into a
 * decision. Stored verbatim in `plan_rute.cilj_funkcija`: "cost and the
 * ecological goal are one objective" is only checkable if the weights are kept.
 */
export interface ObjectiveWeights extends Record<PrioritetTerm, number> {
  /** Priority at or above which a stop is visited regardless of distance. */
  prag_obaveznog: number;
  /**
   * Minimum priority-per-marginal-minute for an optional stop. Below it the
   * detour is the "wasted stop" the fixed schedule produces today.
   */
  min_odnos: number;
}

/** The cost model. Also stored in `cilj_funkcija`, next to the weights. */
export interface RoutingParameters {
  /** Road distance ≈ straight line × this. Ignored by a road-network provider. */
  faktor_puta: number;
  brzina_kmh: number;
  trajanje_stajanja_min: number;
  /** Per container beyond the first at the same point. */
  trajanje_po_kontejneru_min: number;
  /** Compactor ratio: collected volume ÷ this is what the body holds. */
  koeficijent_sabijanja: number;
  /** Shift length, return to the depot included. */
  radno_vreme_min: number;
  /** Shift start, `HH:MM`, local time. */
  pocetak_smene: string;
}

export const DEFAULT_WEIGHTS: ObjectiveWeights = {
  prelivanje: 0.35,
  rizik: 0.2,
  prijava: 0.2,
  pokrivenost: 0.1,
  domacinstva: 0.05,
  rutinski: 0.05,
  bez_senzora: 0.05,
  prag_obaveznog: 0.6,
  min_odnos: 0.01,
};

export const DEFAULT_PARAMETERS: RoutingParameters = {
  faktor_puta: 1.35,
  brzina_kmh: 32,
  trajanje_stajanja_min: 5,
  trajanje_po_kontejneru_min: 2,
  koeficijent_sabijanja: 3,
  radno_vreme_min: 480,
  pocetak_smene: '06:00',
};

export interface VehicleCapacity {
  id: string;
  oznaka: string;
  kapacitetM3: number;
  depo: Tacka;
}

export interface PlannedStop {
  redosled: number;
  kandidat: ScoredCandidate;
  planiraniDolazak: Date;
  /** Minutes the route grew by when this stop was inserted. */
  doprinosCeniMin: number;
}

export interface PlannedRoute {
  vozilo: VehicleCapacity;
  stajalista: PlannedStop[];
  ukupnaDistancaM: number;
  ukupnoTrajanjeMin: number;
  /** Depot, every stop in order, depot again. */
  putanja: Tacka[];
}

export type RazlogNepokrivenosti = 'kapacitet' | 'radno_vreme' | 'nema_vozila';

/** A must-visit stop that no vehicle could take. Reported, never silently dropped. */
export interface UncoveredStop {
  kandidat: ScoredCandidate;
  razlog: RazlogNepokrivenosti;
}

export interface PlanInput {
  /** The day being planned; shift start is derived from it and `pocetak_smene`. */
  datum: Date;
  /** "Now" for the forecast horizon; injected so tests are deterministic. */
  sada: Date;
  vozila: VehicleCapacity[];
  kandidati: StopCandidate[];
  tezine: ObjectiveWeights;
  parametri: RoutingParameters;
}

export interface PlanOutput {
  rute: PlannedRoute[];
  nepokriveno: UncoveredStop[];
  /** Candidates left out because the detour was not worth it; not an error. */
  preskoceno: ScoredCandidate[];
}

export interface RouteOptimizer {
  readonly algoritam: string;
  plan(input: PlanInput): Promise<PlanOutput>;
}
