import type { FillReading, Id, MockContainer, SeasonalEvent, SensorHealth, SettlementKind } from '@/domain/types';
import { settlements } from './settlements';
import { daysFromNow, seeded, toIsoDate } from './random';

const HISTORY_DAYS = 14;
const FORECAST_DAYS = 7;
const CRITICAL_LEVEL = 95;

/** Koliko zajedničkih kontejnera pratimo po tipu naselja. */
const CONTAINERS_PER_KIND: Record<SettlementKind, number> = { grad: 9, prigradsko: 3, selo: 2 };

/** Fiksni raspored odvoza koji sistem zamenjuje (na koliko dana kamion dolazi). */
const FIXED_CYCLE_DAYS: Record<SettlementKind, number> = { grad: 2, prigradsko: 4, selo: 7 };

/** Brzina punjenja u % dnevno — opseg po tipu naselja. */
const FILL_RATE: Record<SettlementKind, [number, number]> = {
  grad: [14, 30],
  prigradsko: [8, 16],
  selo: [4, 11],
};

const LOCATION_NAMES: Record<SettlementKind, string[]> = {
  grad: [
    'Trg Republike',
    'Ulica Srpskih vladara',
    'Kej uz Nišavu',
    'Gradska pijaca',
    'Autobuska stanica',
    'Naselje Senjak',
    'Naselje Tigrovo',
    'Kod bolnice',
    'Ulica Nikole Pašića',
    'Most na Rogozu',
  ],
  prigradsko: ['Centar naselja', 'Kod škole', 'Raskrsnica ka Pirotu'],
  selo: ['Centar sela', 'Kod doma kulture', 'Ulaz u selo', 'Kod crkve', 'Kod prodavnice'],
};

/** Sezonski događaji koji podižu količinu otpada u narednih 7 dana (relativno na danas). */
const SEASONAL_BY_SETTLEMENT: Record<Id, Array<{ inDays: number; kind: SeasonalEvent['kind']; label: string; bump: number }>> = {
  sukovo: [{ inDays: 3, kind: 'slava', label: 'Seoska slava', bump: 25 }],
  krupac: [{ inDays: 5, kind: 'vasar', label: 'Vašar u Krupcu', bump: 30 }],
  temska: [{ inDays: 2, kind: 'vikend', label: 'Vikendaši', bump: 15 }],
  'topli-do': [{ inDays: 2, kind: 'vikend', label: 'Vikendaši i planinari', bump: 20 }],
  'poljska-rzana': [{ inDays: 4, kind: 'berba', label: 'Berba — poljoprivredni otpad', bump: 15 }],
  pirot: [{ inDays: 6, kind: 'praznik', label: 'Gradski praznik', bump: 20 }],
};

const codePrefix = (settlementId: Id) =>
  settlementId
    .split('-')
    .map((part) => part.slice(0, 3).toUpperCase())
    .join('');

function buildContainer(settlementId: Id, kind: SettlementKind, index: number, baseLat: number, baseLon: number): MockContainer {
  const rng = seeded(`${settlementId}-${index}`);
  const code = `${codePrefix(settlementId)}-${String(index + 1).padStart(2, '0')}`;

  const [rateMin, rateMax] = FILL_RATE[kind];
  const ratePerDay = rng.float(rateMin, rateMax);
  const cycle = FIXED_CYCLE_DAYS[kind];
  // Poslednji odvoz: negde unutar poslednjeg ciklusa, ponekad i kasnije (kamion nije stigao).
  const daysSinceCollection = rng.int(1, cycle + 2);

  const events = (SEASONAL_BY_SETTLEMENT[settlementId] ?? []).map((e) => ({
    date: toIsoDate(daysFromNow(e.inDays)),
    kind: e.kind,
    label: e.label,
    bump: e.bump,
    inDays: e.inDays,
  }));

  // Istorija: nivo raste od poslednjeg odvoza; pre njega je bio prethodni ciklus.
  const history: FillReading[] = [];
  for (let daysAgo = HISTORY_DAYS - 1; daysAgo >= 0; daysAgo--) {
    let collectionAgo = daysSinceCollection;
    while (collectionAgo < daysAgo) collectionAgo += cycle;
    const t = collectionAgo - daysAgo;
    const noise = rng.float(-4, 4);
    history.push({
      at: daysFromNow(-daysAgo).toISOString(),
      level: Math.round(Math.max(0, Math.min(100, ratePerDay * t + noise))),
    });
  }
  const fillLevel = history[history.length - 1]?.level ?? 0;

  // Predikcija: nastavak trenda + sezonski skok.
  const forecast: FillReading[] = [];
  for (let inDays = 1; inDays <= FORECAST_DAYS; inDays++) {
    const bump = events.filter((e) => e.inDays <= inDays).reduce((sum, e) => sum + e.bump, 0);
    forecast.push({
      at: daysFromNow(inDays).toISOString(),
      level: Math.round(Math.min(100, fillLevel + ratePerDay * inDays + bump)),
    });
  }

  const nowIso = new Date().toISOString();
  const predictedCriticalAt =
    fillLevel >= CRITICAL_LEVEL ? nowIso : (forecast.find((f) => f.level >= CRITICAL_LEVEL)?.at ?? null);

  // Kontejner koji se u fiksnom ciklusu redovno prepuni ima istoriju prelivanja.
  const overflowsPerCycle = ratePerDay * cycle > 100 ? 1 : 0;
  const overflowsLast90Days = overflowsPerCycle * Math.round(90 / cycle) * rng.float(0.5, 1) + rng.int(0, 1);

  const hasSensor = rng.next() > 0.12;
  // Nekoliko uređaja u demo podacima ima problem: zaprljana optika (čita "puno"),
  // slaba baterija ili tišina — da se vidi da UI i prioritizacija to razlikuju.
  const sensor: SensorHealth | null = hasSensor
    ? (() => {
        const roll = rng.next();
        const batteryPercent = roll < 0.08 ? rng.int(8, 19) : rng.int(45, 98);
        const status: SensorHealth['status'] = [];
        if (batteryPercent < 20) status.push('low_battery');
        if (roll > 0.94) status.push('optics_blocked');
        else if (roll > 0.9) status.push('silent');
        if (status.length === 0) status.push('ok');
        return { batteryPercent, status };
      })()
    : null;

  return {
    id: `c-${code.toLowerCase()}`,
    code,
    settlementId,
    locationName: LOCATION_NAMES[kind][index % LOCATION_NAMES[kind].length] ?? 'Centar',
    lat: baseLat + rng.float(-0.004, 0.004),
    lon: baseLon + rng.float(-0.006, 0.006),
    capacityLiters: kind === 'grad' ? 1100 : rng.pick([1100, 5000]),
    hasSensor,
    sensor,
    fillLevel,
    lastReadingAt: daysFromNow(0, new Date().getHours()).toISOString(),
    lastCollectedAt: daysFromNow(-daysSinceCollection, 8).toISOString(),
    history,
    forecast,
    predictedCriticalAt,
    seasonalEvents: events.map(({ date, kind: eventKind, label }) => ({ date, kind: eventKind, label })),
    overflowsLast90Days: Math.round(overflowsLast90Days),
  };
}

export const containers: MockContainer[] = settlements.flatMap((s) =>
  Array.from({ length: CONTAINERS_PER_KIND[s.kind] }, (_, i) => buildContainer(s.id, s.kind, i, s.lat, s.lon)),
);

export const containerById = new Map(containers.map((c) => [c.id, c]));
