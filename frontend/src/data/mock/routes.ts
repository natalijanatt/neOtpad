import type {
  MockContainer,
  DailyPlan,
  GeoPoint,
  Id,
  PlanMetrics,
  Report,
  RouteStop,
  StopReason,
  TruckRoute,
  Weekday,
} from '@/domain/types';
import { DEPOT, distanceKm, roadDistanceKm } from '@/lib/geo';
import { isOpenReport, priorityOf } from '@/lib/reports';
import { isReadingTrusted } from '@/lib/sensors';
import { containers } from './containers';
import { hotspots } from './hotspots';
import { scheduleBySettlement } from './schedules';
import { settlementById } from './settlements';
import { trucks } from './trucks';
import { DAY_MS, toIsoDate } from './random';

const HOUR_MS = 3_600_000;
const FUEL_L_PER_KM = 0.35;
const MINUTES_PER_STOP = 6;
const AVG_SPEED_KMH = 32;
const HOTSPOT_RADIUS_KM = 0.5;

interface Urgency {
  container: MockContainer;
  score: number;
  reason: StopReason;
  reportId?: Id;
  /** Prelivanje u 48h, već >= 80% ili otvorena prijava — ovo plan mora da pokrije. */
  atRisk: boolean;
}

/**
 * Koliko je hitno posetiti kontejner. Ovo je mock „optimizacione funkcije“:
 * popunjenost + predikcija + prijave građana + istorija prelivanja + blizina žarišta.
 */
function urgencyOf(container: MockContainer, openReports: Report[], now: number): Urgency {
  // Zaprljana optika čita kao "puno", tišina znači rupu u podacima — ni jedno ni
  // drugo nije merenje, pa popunjenost ne ulazi u skor (docs/sensor-telemetry.md).
  const readingTrusted = isReadingTrusted(container);
  let score = readingTrusted ? container.fillLevel * 0.5 : 0;
  const factors: Array<{ reason: StopReason; weight: number; reportId?: Id }> = [];

  if (readingTrusted && container.predictedCriticalAt) {
    const hours = (new Date(container.predictedCriticalAt).getTime() - now) / HOUR_MS;
    const weight = hours <= 48 ? 30 : hours <= 7 * 24 ? 8 : 0;
    score += weight;
    if (hours <= 48 || container.fillLevel >= 80) {
      factors.push({ reason: 'predvidjeno_prelivanje', weight: weight + container.fillLevel * 0.5 });
    }
  }

  // Prioritet je 1 (najhitnije) do 5; netrijazirana prijava jos nema prioritet
  // i racuna se kao srednja, jer cinjenica da je prijavljena vec nosi tezinu.
  const report = openReports.find((r) => r.kontejner_id === container.id);
  if (report) {
    const weight = 15 + (6 - (priorityOf(report) ?? 3)) * 2;
    score += weight;
    factors.push({ reason: 'prijava_gradjana', weight, reportId: report.id });
  }

  const nearestRisk = hotspots
    .filter((h) => h.riskScore >= 70 && distanceKm(h, container) <= HOTSPOT_RADIUS_KM)
    .sort((a, b) => b.riskScore - a.riskScore)[0];
  const overflowWeight = Math.min(container.overflowsLast90Days, 3) * 5;
  score += overflowWeight;
  if (nearestRisk) {
    score += 15;
    factors.push({ reason: 'rizik_deponije', weight: 15 + overflowWeight + nearestRisk.riskScore * 0.2 });
  }

  const criticalSoon =
    readingTrusted &&
    container.predictedCriticalAt !== null &&
    (new Date(container.predictedCriticalAt).getTime() - now) / HOUR_MS <= 48;
  const top = factors.sort((a, b) => b.weight - a.weight)[0];
  return {
    container,
    score,
    reason: top?.reason ?? 'redovan_obilazak',
    ...(top?.reportId ? { reportId: top.reportId } : {}),
    atRisk: criticalSoon || (readingTrusted && container.fillLevel >= 80) || report !== undefined,
  };
}

/** Najbliži-sused obilazak od baze: dovoljno dobar za demo, nije pravi VRP. */
function orderByNearest(items: Urgency[]): Urgency[] {
  const remaining = [...items];
  const ordered: Urgency[] = [];
  let current: GeoPoint = DEPOT;
  while (remaining.length) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    remaining.forEach((item, i) => {
      const d = roadDistanceKm(current, item.container);
      if (d < bestDistance) {
        bestDistance = d;
        bestIndex = i;
      }
    });
    const [next] = remaining.splice(bestIndex, 1);
    if (!next) break;
    ordered.push(next);
    current = next.container;
  }
  return ordered;
}

function buildRoute(id: string, date: string, truckId: Id, items: Urgency[], startHour: number): TruckRoute {
  const ordered = orderByNearest(items);
  const path: GeoPoint[] = [DEPOT];
  const stops: RouteStop[] = [];
  let distance = 0;
  let minutes = 0;
  let prev: GeoPoint = DEPOT;
  const start = new Date(date);
  start.setHours(startHour, 0, 0, 0);

  ordered.forEach((item, i) => {
    const leg = roadDistanceKm(prev, item.container);
    distance += leg;
    minutes += (leg / AVG_SPEED_KMH) * 60 + MINUTES_PER_STOP;
    path.push({ lat: item.container.lat, lon: item.container.lon });
    stops.push({
      order: i + 1,
      containerId: item.container.id,
      settlementId: item.container.settlementId,
      reason: item.reason,
      eta: new Date(start.getTime() + minutes * 60_000).toISOString(),
      done: false,
      ...(item.reportId ? { reportId: item.reportId } : {}),
    });
    prev = item.container;
  });
  const back = roadDistanceKm(prev, DEPOT);
  distance += back;
  minutes += (back / AVG_SPEED_KMH) * 60;
  path.push(DEPOT);

  return {
    id,
    date,
    truckId,
    stops,
    distanceKm: Math.round(distance * 10) / 10,
    durationMin: Math.round(minutes),
    path,
  };
}

/** Grupisanje po zoni: kamioni za grad, kamioni za sela — da rute ne cik-cakuju. */
function splitAmongTrucks(items: Urgency[], truckIds: Id[]): Map<Id, Urgency[]> {
  const buckets = new Map<Id, Urgency[]>(truckIds.map((id) => [id, []]));
  const sortedByLon = [...items].sort((a, b) => a.container.lon - b.container.lon);
  const perTruck = Math.ceil(sortedByLon.length / truckIds.length);
  truckIds.forEach((truckId, i) => {
    buckets.set(truckId, sortedByLon.slice(i * perTruck, (i + 1) * perTruck));
  });
  return buckets;
}

function metricsOf(routes: TruckRoute[], allUrgency: Urgency[], visited: Set<Id>): PlanMetrics {
  const distanceKm = routes.reduce((sum, r) => sum + r.distanceKm, 0);
  const stops = routes.reduce((sum, r) => sum + r.stops.length, 0);
  const atRisk = allUrgency.filter((u) => u.atRisk);
  const atRiskCovered = atRisk.filter((u) => visited.has(u.container.id));
  const WASTED_BELOW = 40;
  const wastedStops = allUrgency.filter((u) => visited.has(u.container.id) && u.container.fillLevel < WASTED_BELOW).length;
  const visitedSettlements = new Set(
    allUrgency.filter((u) => visited.has(u.container.id)).map((u) => u.container.settlementId),
  );
  const servedSettlements = new Set(
    containers.filter((c) => settlementById.get(c.settlementId)?.hasOrganizedCollection).map((c) => c.settlementId),
  );
  return {
    distanceKm: Math.round(distanceKm),
    stops,
    fuelLiters: Math.round(distanceKm * FUEL_L_PER_KM),
    riskCoveredPct: atRisk.length ? Math.round((atRiskCovered.length / atRisk.length) * 100) : 100,
    expectedOverflows: atRisk.length - atRiskCovered.length,
    wastedStops,
    settlementsSkipped: [...servedSettlements].filter((id) => !visitedSettlements.has(id)).length,
  };
}

/**
 * Dnevni plan za zadati datum. Fiksni raspored obilazi sve kontejnere naselja
 * čiji je dan; optimizovani bira po hitnosti i preskače naselja bez potrebe.
 */
export function buildDailyPlan(date: string, reports: Report[]): DailyPlan {
  const now = Date.now();
  const openReports = reports.filter(isOpenReport);
  // Ruta uzima samo potvrdjene prijave sa obradom `odvoz` - potvrda sa
  // ciscenjem je posao za posebnu ekipu, ne za komunalno vozilo
  // (docs/reports-mvp.md).
  const forcedContainerIds = new Set(
    openReports.filter((r) => r.tip_obrade === 'odvoz' && r.kontejner_id).map((r) => r.kontejner_id as Id),
  );

  const allUrgency = containers.map((c) => urgencyOf(c, openReports, now));
  const activeTrucks = trucks.filter((t) => t.status === 'na_terenu').map((t) => t.id);

  // --- optimizovano: samo kontejneri kojima je odvoz zaista potreban ------------
  //  * pod rizikom (prelivanje u 48h, >= 80%, otvorena prijava) ili visok skor (>= 70)
  //    ide u plan bez obzira na udaljenost — ekološki cilj ima prednost nad kilometražom
  //  * umeren rizik (skor >= 55 ili popunjenost >= 60%) samo ako je blizu baze,
  //    inače čeka — trošak vožnje mora da se isplati
  //  * sve što je operativa ručno dodala iz prijava
  const HIGH_RISK_SCORE = 70;
  const MODERATE_SCORE = 55;
  const NEAR_KM = 15;
  const chosen = [...allUrgency]
    .sort((a, b) => b.score - a.score)
    .filter((u) => {
      if (forcedContainerIds.has(u.container.id)) return true;
      if (u.atRisk || u.score >= HIGH_RISK_SCORE) return true;
      const near = roadDistanceKm(DEPOT, u.container) <= NEAR_KM;
      return near && (u.score >= MODERATE_SCORE || u.container.fillLevel >= 60);
    });
  const optimizedBuckets = splitAmongTrucks(chosen, activeTrucks);
  const routes = activeTrucks.map((truckId, i) =>
    buildRoute(`route-${date}-${truckId}`, date, truckId, optimizedBuckets.get(truckId) ?? [], 6 + (i % 2)),
  );
  const optimizedVisited = new Set(chosen.map((u) => u.container.id));

  // --- fiksni raspored: sva naselja čiji je dan, bez obzira na stanje ------------
  const jsDay = new Date(date).getDay();
  const weekday = (jsDay === 0 ? 7 : jsDay) as Weekday;
  const fixedItems = allUrgency.filter((u) => scheduleBySettlement.get(u.container.settlementId)?.weekdays.includes(weekday));
  const fixedBuckets = splitAmongTrucks(fixedItems, activeTrucks);
  const fixedRoutes = activeTrucks.map((truckId) =>
    buildRoute(`fixed-${date}-${truckId}`, date, truckId, fixedBuckets.get(truckId) ?? [], 6),
  );
  const fixedVisited = new Set(fixedItems.map((u) => u.container.id));

  return {
    date,
    generatedAt: new Date().toISOString(),
    routes,
    comparison: {
      fixed: metricsOf(fixedRoutes, allUrgency, fixedVisited),
      optimized: metricsOf(routes, allUrgency, optimizedVisited),
    },
  };
}

export const todayIso = () => toIsoDate(new Date());
export const tomorrowIso = () => toIsoDate(new Date(Date.now() + DAY_MS));
