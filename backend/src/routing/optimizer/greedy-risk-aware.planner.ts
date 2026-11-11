import { Inject, Injectable } from '@nestjs/common';
import type { Tacka } from '../../common/geo';
import { DISTANCE_PROVIDER, type DistanceProvider } from './distance.port';
import { improveTour, tourLength } from './local-search';
import { prioritetOf } from './priority';
import type {
  PlanInput,
  PlanOutput,
  PlannedRoute,
  PlannedStop,
  RouteOptimizer,
  RoutingParameters,
  ScoredCandidate,
  UncoveredStop,
  VehicleCapacity,
} from './route-optimizer.port';

/** Fill assumed on arrival at a point that has never reported reliably. */
const NEPOZNATO_PUNJENJE = 0.8;

interface RouteState {
  vozilo: VehicleCapacity;
  depoIdx: number;
  /** Point indices of the stops, in visiting order; the depot is implicit at both ends. */
  seq: number[];
  loadM3: number;
  putMin: number;
  stajanjeMin: number;
  /** Point index → minutes the route grew by when that stop went in. */
  doprinos: Map<number, number>;
}

interface Insertion {
  route: RouteState;
  pos: number;
  deltaMin: number;
}

/**
 * Phase-1 optimiser: parallel cheapest insertion, then 2-opt/Or-opt per route.
 *
 * The order of operations is the policy. Must-visit stops go in first and are
 * placed by cost alone — cost decides *where* in the day they land, never
 * *whether* they are served. Optional stops then compete on priority per
 * marginal minute until the detour stops paying for itself. That is how a
 * remote village with a forecast overflow ends up on the route while a
 * near-empty container across town does not.
 */
@Injectable()
export class GreedyRiskAwarePlanner implements RouteOptimizer {
  readonly algoritam = 'greedy-risk-aware-v1';

  constructor(@Inject(DISTANCE_PROVIDER) private readonly distance: DistanceProvider) {}

  async plan(input: PlanInput): Promise<PlanOutput> {
    const { vozila, tezine, parametri } = input;
    const kandidati = input.kandidati
      .map((c) => prioritetOf(c, tezine, input.sada))
      // Deterministic: equal scores fall back to the id, so two runs on the same
      // data produce the same plan and a diff between them means something.
      .sort((a, b) => b.prioritet - a.prioritet || a.sabirnoMestoId.localeCompare(b.sabirnoMestoId));

    if (vozila.length === 0) {
      return {
        rute: [],
        nepokriveno: kandidati.filter((c) => c.obavezno).map((kandidat) => ({ kandidat, razlog: 'nema_vozila' })),
        preskoceno: kandidati.filter((c) => !c.obavezno),
      };
    }

    const points: Tacka[] = [...vozila.map((v) => v.depo), ...kandidati.map((c) => c.tacka)];
    const d = await this.distance.matrix(points, parametri.faktor_puta);
    const pointOf = (i: number): number => vozila.length + i;
    const kandidatOf = (point: number): ScoredCandidate => kandidati[point - vozila.length];

    const routes: RouteState[] = vozila.map((vozilo, i) => ({
      vozilo,
      depoIdx: i,
      seq: [],
      loadM3: 0,
      putMin: 0,
      stajanjeMin: 0,
      doprinos: new Map(),
    }));

    const minutesOf = (metres: number): number => (metres / 1000 / parametri.brzina_kmh) * 60;

    const stajanje = (c: ScoredCandidate): number =>
      parametri.trajanje_stajanja_min + Math.max(0, c.kontejneri.length - 1) * parametri.trajanje_po_kontejneru_min;

    const teret = (c: ScoredCandidate): number =>
      c.kontejneri.reduce((sum, k) => {
        const fill = k.pouzdano && k.fillPercent !== null ? k.fillPercent / 100 : NEPOZNATO_PUNJENJE;
        return sum + (k.zapreminaL / 1000) * fill;
      }, 0) / parametri.koeficijent_sabijanja;

    /** Cheapest feasible position over every route; `deltaMin` includes the stop itself. */
    const bestInsertion = (point: number, c: ScoredCandidate): Insertion | null => {
      let best: Insertion | null = null;
      const load = teret(c);
      const service = stajanje(c);
      for (const route of routes) {
        if (route.loadM3 + load > route.vozilo.kapacitetM3) continue;
        const budgetLeft = parametri.radno_vreme_min - route.putMin - route.stajanjeMin - service;
        if (budgetLeft < 0) continue;
        for (let pos = 0; pos <= route.seq.length; pos++) {
          const prev = pos === 0 ? route.depoIdx : route.seq[pos - 1];
          const next = pos === route.seq.length ? route.depoIdx : route.seq[pos];
          const deltaMin = minutesOf(d[prev][point] + d[point][next] - d[prev][next]) + service;
          if (deltaMin - service > budgetLeft) continue;
          // Strict: on a tie the earlier vehicle keeps the stop, so a fleet
          // sharing one depot fills up in a fixed order rather than at random.
          if (best === null || deltaMin < best.deltaMin) {
            best = { route, pos, deltaMin };
          }
        }
      }
      return best;
    };

    const insert = (point: number, c: ScoredCandidate, ins: Insertion): void => {
      const prev = ins.pos === 0 ? ins.route.depoIdx : ins.route.seq[ins.pos - 1];
      const next = ins.pos === ins.route.seq.length ? ins.route.depoIdx : ins.route.seq[ins.pos];
      ins.route.seq.splice(ins.pos, 0, point);
      ins.route.loadM3 += teret(c);
      ins.route.putMin += minutesOf(d[prev][point] + d[point][next] - d[prev][next]);
      ins.route.stajanjeMin += stajanje(c);
      ins.route.doprinos.set(point, ins.deltaMin);
    };

    const nepokriveno: UncoveredStop[] = [];
    const preskoceno: ScoredCandidate[] = [];
    const optional: number[] = [];

    kandidati.forEach((c, i) => {
      const point = pointOf(i);
      if (!c.obavezno) {
        optional.push(point);
        return;
      }
      const ins = bestInsertion(point, c);
      if (ins === null) {
        // Which constraint bit: if some truck could still carry the load, it
        // was the working day that ran out.
        const load = teret(c);
        const fitsSomewhere = routes.some((r) => r.loadM3 + load <= r.vozilo.kapacitetM3);
        nepokriveno.push({ kandidat: c, razlog: fitsSomewhere ? 'radno_vreme' : 'kapacitet' });
        return;
      }
      insert(point, c, ins);
    });

    const remaining = new Set(optional);
    while (remaining.size > 0) {
      let bestPoint = -1;
      let bestIns: Insertion | null = null;
      let bestRatio = -Infinity;
      for (const point of remaining) {
        const c = kandidatOf(point);
        const ins = bestInsertion(point, c);
        if (ins === null) continue;
        const ratio = c.prioritet / ins.deltaMin;
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestIns = ins;
          bestPoint = point;
        }
      }
      if (bestIns === null || bestRatio < tezine.min_odnos) break;
      insert(bestPoint, kandidatOf(bestPoint), bestIns);
      remaining.delete(bestPoint);
    }
    for (const point of remaining) preskoceno.push(kandidatOf(point));

    const pocetak = shiftStart(input.datum, parametri);
    const rute = routes.map((route): PlannedRoute => {
      const tour = improveTour([route.depoIdx, ...route.seq, route.depoIdx], d);
      const stops = tour.slice(1, -1);

      let clock = pocetak.getTime();
      let prev = route.depoIdx;
      const stajalista: PlannedStop[] = stops.map((point, i) => {
        const kandidat = kandidatOf(point);
        clock += minutesOf(d[prev][point]) * 60_000;
        const planiraniDolazak = new Date(clock);
        clock += stajanje(kandidat) * 60_000;
        prev = point;
        return { redosled: i + 1, kandidat, planiraniDolazak, doprinosCeniMin: route.doprinos.get(point) ?? 0 };
      });

      const ukupnaDistancaM = tourLength(tour, d);
      return {
        vozilo: route.vozilo,
        stajalista,
        ukupnaDistancaM,
        ukupnoTrajanjeMin: Math.round(minutesOf(ukupnaDistancaM) + route.stajanjeMin),
        putanja: tour.map((p) => points[p]),
      };
    });

    return { rute, nepokriveno, preskoceno };
  }
}

/** `datum` at `pocetak_smene`, in the server's local time — the depot's clock. */
function shiftStart(datum: Date, parametri: RoutingParameters): Date {
  const [h, m] = parametri.pocetak_smene.split(':').map(Number);
  const start = new Date(datum);
  start.setHours(h, m, 0, 0);
  return start;
}
