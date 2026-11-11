import type {
  Id,
  LocationPrecision,
  Priority,
  Report,
  ReportAction,
  ReportChannel,
  ReportDetail,
  ReportDto,
  ReportHistoryEntry,
  ReportSize,
  ReportStatus,
  ReportType,
} from '@/domain/types';
import { isTextOnlyChannel } from '@/lib/reports';
import { containers } from './containers';

/**
 * Demo prijave za građansku zonu.
 *
 * Operativa čita prave prijave sa backenda (`GET /reports`); ovaj fajl služi
 * ekranima „Moje prijave“ i detalju prijave, koje backend još ne pokriva — javna
 * ruta vraća samo potvrdu sa kratkim kodom (docs/reports-mvp.md). Oblik je zato
 * namerno isti kao u ugovoru: kad se javno čitanje pojavi, menja se izvor
 * podataka, ne ekrani.
 */

const HOUR_MS = 3_600_000;

/**
 * SVG placeholder umesto prave fotografije — demo prijave rade bez interneta
 * i bez object store-a; prava prijava nosi `javni_url` sa backenda.
 */
function placeholderPhoto(label: string, hue = 150): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="hsl(${hue} 35% 78%)"/><stop offset="1" stop-color="hsl(${hue} 30% 55%)"/>
  </linearGradient></defs>
  <rect width="640" height="480" fill="url(#g)"/>
  <rect x="40" y="300" width="560" height="140" rx="12" fill="hsl(${hue} 20% 35%)" opacity="0.55"/>
  <text x="320" y="250" text-anchor="middle" font-family="sans-serif" font-size="30" fill="hsl(${hue} 30% 22%)">${label}</text>
  <text x="320" y="285" text-anchor="middle" font-family="sans-serif" font-size="16" fill="hsl(${hue} 30% 28%)">fotografija iz prijave (demo)</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const PHOTO_HUE: Record<ReportType, number> = {
  pun_kontejner: 150,
  prelivanje: 150,
  divlja_deponija: 30,
  ostecen_kontejner: 210,
  nedostaje_kontejner: 210,
  drugo: 190,
};

const PHOTO_LABEL: Record<ReportType, string> = {
  pun_kontejner: 'Pun kontejner',
  prelivanje: 'Prelivanje kontejnera',
  divlja_deponija: 'Divlja deponija',
  ostecen_kontejner: 'Oštećen kontejner',
  nedostaje_kontejner: 'Nedostaje kontejner',
  drugo: 'Prijava građana',
};

/**
 * Demo fotografija u obliku koji ugovor vraća (`fotografije`), obeležena kao
 * demo na samoj slici. SMS i telefonski poziv je ne nose — pravilo kanala.
 */
function demoPhotosFor(report: Pick<Report, 'kratki_kod' | 'tip' | 'kanal'>, otpremljenaAt: string): Report['fotografije'] {
  if (isTextOnlyChannel(report.kanal)) return [];
  const url = placeholderPhoto(PHOTO_LABEL[report.tip], PHOTO_HUE[report.tip]);
  return [
    {
      id: `foto-${report.kratki_kod}`,
      javni_url: url,
      mime_tip: 'image/svg+xml',
      velicina_bajt: url.length,
      // Demo sloj nema EXIF, a izmišljeno vreme snimanja izgleda isto kao mereno.
      snimljeno_at: null,
      otpremljena_at: otpremljenaAt,
    },
  ];
}

function cid(code: string): Id {
  const container = containers.find((c) => c.code === code);
  if (!container) throw new Error(`Mock prijava upućuje na nepostojeći kontejner ${code}`);
  return container.id;
}

interface ReportSeed {
  kod: string;
  tip: ReportType;
  status: ReportStatus;
  opis: string;
  naselje_id: Id;
  containerCode?: string;
  /** Ako nema kontejnera, lokacija se zadaje ručno. */
  at?: { lat: number; lon: number };
  hoursAgo: number;
  /** Ručni prioritet dispečera; potvrđena prijava ga uvek ima. */
  prioritet?: Priority;
  /** `tip_obrade` izabran pri potvrdi. */
  obrada?: ReportAction;
  velicina?: ReportSize;
  withPhoto?: boolean;
  /** Razlog zatvaranja — obavezan uz `odbijena`, `duplikat` i `resena`. */
  razlog?: string;
  duplikatOd?: string;
  /** Podrazumevano `mobilna` — seed navodi kanal samo kad prijava nije iz aplikacije. */
  kanal?: ReportChannel;
  /** Posrednik koji je preneo prijavu; obavezan uz `kanal: 'posrednik'`. */
  posrednik?: string;
  /** Podrazumevano `gps`; `naselje` znači da tačka nije izmerena. */
  precision?: LocationPrecision;
}

/**
 * Istorija je u bazi nepromenljiva i svaka akcija podiže `verzija`
 * (docs/reports-mvp.md), pa je i mock gradi istim redom umesto da pamti samo
 * poslednje stanje.
 */
function buildHistory(seed: ReportSeed, report: ReportDto, createdAt: number): ReportHistoryEntry[] {
  const snapshot = (over: Partial<ReportDto>): ReportDto => ({ ...report, ...over });
  const nova = snapshot({ status: 'nova', prioritet: null, tip_obrade: null, potvrdjena_at: null, resena_at: null, verzija: 1 });
  const history: ReportHistoryEntry[] = [
    {
      akcija: 'kreirana',
      nastalo_at: new Date(createdAt).toISOString(),
      korisnik_id: null,
      razlog: null,
      verzija: 1,
      prethodno: null,
      novo: nova,
    },
  ];
  if (seed.status === 'nova') return history;

  const confirmedAt = createdAt + 3 * HOUR_MS;
  if (seed.status === 'odbijena' || seed.status === 'duplikat') {
    history.push({
      akcija: seed.status,
      nastalo_at: new Date(confirmedAt).toISOString(),
      korisnik_id: 'demo-dispecer',
      razlog: seed.razlog ?? 'Odluka dispečera.',
      verzija: 2,
      prethodno: nova,
      novo: snapshot({ verzija: 2 }),
    });
    return history;
  }

  const potvrdjena = snapshot({ status: 'potvrdjena', resena_at: null, verzija: 2 });
  history.push({
    akcija: 'potvrdjena',
    nastalo_at: new Date(confirmedAt).toISOString(),
    korisnik_id: 'demo-dispecer',
    razlog: 'Prijava proverena i potvrđena.',
    verzija: 2,
    prethodno: nova,
    novo: potvrdjena,
  });

  if (seed.status === 'resena') {
    history.push({
      akcija: 'resena',
      nastalo_at: new Date(createdAt + 26 * HOUR_MS).toISOString(),
      korisnik_id: 'demo-dispecer',
      razlog: seed.razlog ?? 'Posao završen na terenu.',
      verzija: 3,
      prethodno: potvrdjena,
      novo: snapshot({ verzija: 3 }),
    });
  }
  return history;
}

function build(seed: ReportSeed, index: number): ReportDetail {
  const createdAt = Date.now() - seed.hoursAgo * HOUR_MS;
  const kontejner_id = seed.containerCode ? cid(seed.containerCode) : null;
  const container = kontejner_id ? containers.find((c) => c.id === kontejner_id) : undefined;
  const kanal = seed.kanal ?? 'mobilna';
  const preciznost_lokacije = seed.precision ?? 'gps';
  // Prijava bez izmerene tačke nema koordinatu: centroid naselja je lokacija
  // naselja, ne mesta problema, i backend ga zato nikad ne podmeće.
  const tacka =
    preciznost_lokacije === 'naselje'
      ? null
      : (seed.at ?? (container ? { lat: container.lat + 0.0004, lon: container.lon - 0.0003 } : null));
  if (preciznost_lokacije !== 'naselje' && !tacka) throw new Error(`Mock prijava ${seed.kod} nema lokaciju`);
  if (kanal === 'posrednik' && !seed.posrednik) throw new Error(`Mock prijava ${seed.kod} preko posrednika nema posrednika`);

  const closed = seed.status === 'resena' || seed.status === 'odbijena' || seed.status === 'duplikat';
  const confirmed = seed.status === 'potvrdjena' || seed.status === 'resena';
  const verzija = seed.status === 'nova' ? 1 : seed.status === 'resena' ? 3 : 2;

  const base: ReportDto = {
    id: `r-${String(index + 1).padStart(3, '0')}`,
    kratki_kod: seed.kod,
    tip: seed.tip,
    status: seed.status,
    opis: seed.opis,
    opis_lokacije: null,
    naselje_id: seed.naselje_id,
    kontejner_id,
    // Popunjava ga tek potvrda prijave kao divlje deponije, na serveru.
    kanonska_id: null,
    kanal,
    posrednik_id: seed.posrednik ?? null,
    preciznost_lokacije,
    tacka,
    velicina: seed.velicina ?? null,
    prioritet: confirmed ? (seed.prioritet ?? 3) : null,
    tip_obrade: confirmed ? (seed.obrada ?? null) : null,
    duplikat_od: seed.duplikatOd ?? null,
    primljena_at: new Date(createdAt).toISOString(),
    potvrdjena_at: confirmed ? new Date(createdAt + 3 * HOUR_MS).toISOString() : null,
    resena_at: seed.status === 'resena' ? new Date(createdAt + 26 * HOUR_MS).toISOString() : null,
    azurirana_at: new Date(createdAt + (closed ? 26 : confirmed ? 3 : 0) * HOUR_MS).toISOString(),
    verzija,
  };

  return {
    ...base,
    fotografije: seed.withPhoto === false ? [] : demoPhotosFor(base, base.primljena_at),
    istorija: buildHistory(seed, base, createdAt),
    // Predlog klasifikatora je podatak za operativu i stiže sa backenda; ove
    // demo prijave hrane građansku stranu, koja ga nikad ne prikazuje.
    klasifikacija: null,
  };
}

const seeds: ReportSeed[] = [
  {
    kod: 'PR-2026-0131',
    tip: 'divlja_deponija',
    status: 'nova',
    opis: 'Iza poslednjih kuća ka Gradištu, neko istovario prikolicu građevinskog šuta i kese sa kućnim otpadom. Smrdi, psi razvlače.',
    naselje_id: 'gradasnica',
    at: { lat: 43.1818, lon: 22.6008 },
    velicina: 'velika',
    hoursAgo: 6,
  },
  {
    kod: 'PR-2026-0130',
    tip: 'prelivanje',
    status: 'nova',
    opis: 'Kontejner u centru sela je pun već dva dana, kese stoje pored. Za vikend je slava, biće još gore.',
    naselje_id: 'sukovo',
    containerCode: 'SUK-01',
    velicina: 'srednja',
    hoursAgo: 9,
  },
  {
    kod: 'PR-2026-0129',
    tip: 'divlja_deponija',
    status: 'nova',
    opis: 'Pored puta ka Belavi ponovo se stvara gomila — kese, stara stolarija, cerada.',
    naselje_id: 'gnjilan',
    at: { lat: 43.1694, lon: 22.5483 },
    velicina: 'velika',
    hoursAgo: 26,
  },
  {
    kod: 'PR-2026-0128',
    tip: 'pun_kontejner',
    status: 'nova',
    opis: 'Đubre izvan kontejnera u Ustaničkoj, kod broja 14.',
    naselje_id: 'tijabara',
    containerCode: 'TIJ-01',
    hoursAgo: 5,
    kanal: 'web',
  },
  {
    kod: 'PR-2026-0127',
    tip: 'prelivanje',
    status: 'nova',
    opis: 'KONTEJNER KOD PRODAVNICE SE NE PRAZNI, PRELIO SE I PROSLE NEDELJE',
    naselje_id: 'stanicenje',
    containerCode: 'STA-01',
    hoursAgo: 30,
    // SMS: bez fotografije i bez GPS-a — dispečer je vezao kontejner po opisu,
    // ali prijava ostaje bez koordinate.
    kanal: 'sms',
    precision: 'naselje',
  },
  {
    kod: 'PR-2026-0126',
    tip: 'divlja_deponija',
    status: 'potvrdjena',
    opis: 'Divlja deponija na ulazu u selo, uz put. Selo nema kontejnere pa ljudi bacaju tu.',
    naselje_id: 'petrovac',
    at: { lat: 43.0782, lon: 22.6171 },
    velicina: 'velika',
    prioritet: 1,
    obrada: 'ciscenje',
    hoursAgo: 50,
    // Naselje bez organizovanog odvoza: prijava je stigla preko predsednika MZ,
    // što je za ova sela jedini kanal koji stvarno radi.
    kanal: 'posrednik',
    posrednik: 'Predsednik MZ Petrovac',
    precision: 'opisana',
  },
  {
    kod: 'PR-2026-0125',
    tip: 'divlja_deponija',
    status: 'potvrdjena',
    opis: 'Pored Nišave, kod kompenzacionog bazena, opet nabacano — plastika i kabasti otpad, deo je već u vodi.',
    naselje_id: 'poljska-rzana',
    at: { lat: 43.1281, lon: 22.6265 },
    velicina: 'velika',
    prioritet: 1,
    obrada: 'ciscenje',
    hoursAgo: 70,
    kanal: 'viber',
  },
  {
    kod: 'PR-2026-0124',
    tip: 'pun_kontejner',
    status: 'potvrdjena',
    opis: 'Vikendom je kontejner kod crkve pretrpan, dolaze vikendaši i ostavljaju sve pored.',
    naselje_id: 'temska',
    containerCode: 'TEM-02',
    velicina: 'srednja',
    prioritet: 2,
    obrada: 'odvoz',
    hoursAgo: 28,
  },
  {
    kod: 'PR-2026-0123',
    tip: 'drugo',
    status: 'potvrdjena',
    opis: 'Neko ostavio stari nameštaj i dušek pored puta ka Krupcu.',
    naselje_id: 'trnjana',
    containerCode: 'TRN-01',
    prioritet: 4,
    obrada: 'ciscenje',
    hoursAgo: 48,
    kanal: 'web',
  },
  {
    kod: 'PR-2026-0122',
    tip: 'divlja_deponija',
    status: 'potvrdjena',
    opis: 'Na raskrsnici Cara Dušana opet gomila pored kontejnera — šut od renoviranja.',
    naselje_id: 'pirot',
    at: { lat: 43.1609, lon: 22.5957 },
    velicina: 'srednja',
    prioritet: 2,
    obrada: 'ciscenje',
    hoursAgo: 75,
  },
  {
    kod: 'PR-2026-0121',
    tip: 'divlja_deponija',
    status: 'potvrdjena',
    opis: 'Divlja deponija iza groblja, kese i plastika. (zabeleženo po prijavi telefonom)',
    naselje_id: 'izvor',
    at: { lat: 43.1479, lon: 22.6356 },
    velicina: 'srednja',
    prioritet: 3,
    obrada: 'ciscenje',
    hoursAgo: 96,
    kanal: 'telefon',
    precision: 'opisana',
  },
  {
    kod: 'PR-2026-0120',
    tip: 'drugo',
    status: 'nova',
    opis: 'Na keju kod mosta neko ostavio dva džaka sa lišćem i granama.',
    naselje_id: 'pirot',
    containerCode: 'PIR-03',
    hoursAgo: 44,
    withPhoto: false,
  },
  {
    kod: 'PR-2026-0119',
    tip: 'prelivanje',
    status: 'resena',
    opis: 'Kontejner u centru pun, kese pored.',
    naselje_id: 'krupac',
    containerCode: 'KRU-01',
    prioritet: 2,
    obrada: 'odvoz',
    razlog: 'Kontejner ispražnjen, okolni otpad uklonjen.',
    hoursAgo: 6 * 24,
  },
  {
    kod: 'PR-2026-0118',
    tip: 'pun_kontejner',
    status: 'resena',
    opis: 'KONTEJNER KOD SKOLE PREPUN',
    naselje_id: 'berilovac',
    containerCode: 'BER-02',
    prioritet: 3,
    obrada: 'odvoz',
    razlog: 'Odvezeno u redovnoj ruti.',
    hoursAgo: 8 * 24,
    kanal: 'sms',
    precision: 'naselje',
  },
  {
    kod: 'PR-2026-0117',
    tip: 'prelivanje',
    status: 'resena',
    opis: 'Kontejneri u Senjaku prepuni posle vikenda.',
    naselje_id: 'pirot',
    containerCode: 'PIR-06',
    prioritet: 3,
    obrada: 'odvoz',
    razlog: 'Ispražnjena oba kontejnera.',
    hoursAgo: 10 * 24,
  },
  {
    kod: 'PR-2026-0116',
    tip: 'divlja_deponija',
    status: 'duplikat',
    opis: 'Eko problem u Barje Čifliku, otpad pored potoka.',
    naselje_id: 'barje-ciflik',
    hoursAgo: 7 * 24,
    // Duplikat, ne odbijanje: backend traži `duplikat_od` i lanac ka originalu.
    duplikatOd: 'r-003',
    razlog: 'Ista lokacija je već prijavljena — vezano za stariju prijavu. Preneto školi na dalje.',
    withPhoto: false,
    kanal: 'posrednik',
    posrednik: 'OŠ „Sveti Sava“, Barje Čiflik',
    precision: 'naselje',
  },
];

/** Početno stanje prijava; store.ts ga kopira i dalje menja. */
export const initialReports: ReportDetail[] = seeds.map(build);

const NEXT_CODE_START = 132;
let nextCodeNumber = NEXT_CODE_START;

/** Kratki kod dodeljuje backend; mock ga generiše samo za lokalno poslate prijave. */
export function nextReportCode(): string {
  const code = `PR-2026-${String(nextCodeNumber).padStart(4, '0')}`;
  nextCodeNumber += 1;
  return code;
}
