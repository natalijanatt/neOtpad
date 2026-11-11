/**
 * Domenski tipovi aplikacije.
 *
 * Dva su sloja, namerno različita:
 *
 * - Sve što backend već ima u ugovoru (prijave, šifarnici, nalog radnika) se
 *   izvodi iz `src/api/generated/schema.ts`. Front prati backend; tip se ne
 *   prepisuje ručno jer prepis prestaje da prati ugovor istog trenutka.
 * - Sve što backend još nema (kontejneri sa senzorima, kamioni, rute, žarišta,
 *   raspored) ostaje definisano ovde i dolazi iz mock sloja. Kad ugovor dobije
 *   te rute, taj deo se briše odavde na isti način.
 */
import type { components } from '@/api/generated/schema';

export type Id = string;

/** ISO 8601 datum-vreme, npr. "2026-09-18T07:30:00.000Z". */
export type IsoDateTime = string;

/** ISO datum bez vremena, npr. "2026-09-18". */
export type IsoDate = string;

export interface GeoPoint {
  lat: number;
  lon: number;
}

// ---------------------------------------------------------------------------
// Naselja
// ---------------------------------------------------------------------------

export type SettlementKind = 'grad' | 'prigradsko' | 'selo';

export interface Settlement extends GeoPoint {
  id: Id;
  name: string;
  kind: SettlementKind;
  households: number;
  /** Da li JKP organizovano odvozi otpad iz naselja. */
  hasOrganizedCollection: boolean;
}

/** Veličinska klasa naselja iz LPUO 2021-2031 (t. 117): I > 1000 stanovnika ... IV < 10. */
export type LpuoClass = 'grad' | 'I' | 'II' | 'III' | 'IV';

/**
 * Jedno od 72 naselja grada Pirota sa zastavicom pokrivenosti — skup na kom
 * stoji mapa pokrivenosti. Odvojeno od `Settlement` namerno: `Settlement` je
 * demo skup sa procenjenim brojem domaćinstava, ovo je prepis izvora, pa se
 * brojka koja stoji uz pin može citirati.
 */
export interface SettlementCoverage extends GeoPoint {
  /** Slug naziva, isti oblik kao `Settlement.id`. */
  id: Id;
  name: string;
  lpuoClass: LpuoClass;
  /** Da li JKP organizovano odvozi otpad iz naselja (plan iznošenja za 2018). */
  hasOrganizedCollection: boolean;
  /** Dokument iz kog zastavica dolazi — i za `da` i za `ne`, jer je `ne` zaključak. */
  coverageSource: string;
  coverageSourceUrl: string | null;
  coverageYear: number | null;
  /**
   * Da li je naselje na spisku sela sa postavljenim kontejnerima iz izveštaja za 2024.
   * `false` znači samo da ga tabela ne navodi — ne i da naselje nema uslugu, jer isti
   * izveštaj pominje i tri vozila za iznošenje otpada iz kanti. `null` je grad: tabela
   * je o selima i o njemu ne tvrdi ništa.
   */
  containers2024: boolean | null;
  containers2024Source: string | null;
  containers2024Year: number | null;
  /** Broj odvoza nedeljno iz plana za 2018; null za grad i za nepokrivena naselja. */
  pickupsPerWeek: number | null;
  /** Popisne brojke iz plana, ne broj korisnika usluge. */
  households: number | null;
  containers1100: number | null;
  population2011: number | null;
  /** Poreklo koordinate (OSM, centroid iz dataseta deponija, registarska tačka). */
  geoSource: string;
}

// ---------------------------------------------------------------------------
// Kontejneri i senzori
// ---------------------------------------------------------------------------

/** Pojas popunjenosti: <50 / 50–79 / 80–94 / >=95. */
export type FillLevelBand = 'low' | 'mid' | 'high' | 'critical';

export interface FillReading {
  at: IsoDateTime;
  /** Popunjenost u procentima, 0–100. */
  level: number;
}

export type SeasonalEventKind = 'vikend' | 'praznik' | 'slava' | 'vasar' | 'berba' | 'drugo';

/** Sezonski događaj koji utiče na predikciju (slava, vašar, berba...). */
export interface SeasonalEvent {
  date: IsoDate;
  kind: SeasonalEventKind;
  label: string;
}

/** Kodovi stanja uređaja — lista, jer uređaj može biti i slab na bateriji i zaprljan (docs/sensor-telemetry.md). */
export type SensorStatusCode = 'ok' | 'optics_blocked' | 'low_battery' | 'tipped' | 'silent';

export interface SensorHealth {
  batteryPercent: number;
  status: SensorStatusCode[];
}

/**
 * Kontejner kakav ga vidi operativa. Popunjava se iz ugovora
 * (`ContainerListItemDto`) u src/data/repo.ts — ovo je prikazni model, a ne
 * ručno pisan tip odgovora.
 *
 * Nullable polja su nullable jer ih baza takva i vraća: kontejner bez senzora
 * nema popunjenost, a nedostatak merenja nije prazan kontejner
 * (docs/sensor-telemetry.md).
 */
export interface Container extends GeoPoint {
  id: Id;
  /** Oznaka na samom kontejneru, npr. "PI-KRU-004". */
  code: string;
  settlementId: Id;
  /** Naziv sabirnog mesta, npr. "Krupac - centar sela". */
  locationName: string;
  capacityLiters: number;
  hasSensor: boolean;
  /** Stanje senzora; null kad kontejner nema senzor. Kod greške merenje NE podiže prioritet. */
  sensor: SensorHealth | null;
  /** Poslednja pouzdana popunjenost u procentima; null znači „nema merenja“, ne 0%. */
  fillLevel: number | null;
  /** Procentnih poena dnevno iz keširanog stanja. */
  trendPpPerDay: number | null;
  lastReadingAt: IsoDateTime | null;
  lastCollectedAt: IsoDateTime | null;
  /** Kada model očekuje da popunjenost pređe 95%; null ako ne u horizontu predikcije. */
  predictedCriticalAt: IsoDateTime | null;
  /** Očekivana popunjenost za 24h i 48h, sa krive prognoze. */
  expected24h: number | null;
  expected48h: number | null;
  /** Koliko istorije stoji iza krive; null kad prognoze nema. */
  forecastConfidence: ForecastConfidence | null;
  /** Kada je prognoza izračunata — zastarela prognoza mora da se vidi. */
  forecastAt: IsoDateTime | null;
  /** Koliko puta se u poslednjih 90 dana kontejner prelio. */
  overflowsLast90Days: number;
}

export type ForecastConfidence = 'visoka' | 'srednja' | 'niska';

/** Jedna tačka krive prognoze: p50 je predikcija, p10/p90 su opseg. */
export interface ForecastPoint {
  at: IsoDateTime;
  p10: number;
  p50: number;
  p90: number;
}

/** Kontejner sa izmerenom istorijom i krivom — za stranicu detalja. */
export interface ContainerDetail extends Container {
  /** Izmerena očitavanja, najstarije prvo. */
  history: ContainerReading[];
  forecast: ForecastPoint[];
  /** Sezonski događaji u horizontu; prazno dok se kalendar ne napuni. */
  seasonalEvents: SeasonalEvent[];
}

export interface ContainerReading extends FillReading {
  /** False kad je očitavanje stiglo sa dijagnostičkim kodom — prikazuje se, ali ne diže prioritet. */
  trusted: boolean;
  /** `emptying` je pražnjenje koje resetuje krivu; `tipped` je incident. */
  orientation: string | null;
}

/**
 * Stari oblik kontejnera, koji još koriste mock plan ruta i demo prijave.
 * Nestaje kad i te dve stvari pređu na ugovor.
 */
export interface MockContainer extends GeoPoint {
  id: Id;
  code: string;
  settlementId: Id;
  locationName: string;
  capacityLiters: number;
  hasSensor: boolean;
  sensor: SensorHealth | null;
  fillLevel: number;
  lastReadingAt: IsoDateTime;
  lastCollectedAt: IsoDateTime;
  history: FillReading[];
  forecast: FillReading[];
  predictedCriticalAt: IsoDateTime | null;
  seasonalEvents: SeasonalEvent[];
  overflowsLast90Days: number;
}
// ---------------------------------------------------------------------------
// Prijave građana
// ---------------------------------------------------------------------------

/**
 * Prijave više nemaju svoj oblik na frontu: tipovi se izvode iz ugovora
 * (`contracts/openapi.json` → `src/api/generated/schema.ts`). Kad backend doda
 * status ili tip problema, `npm run api:generate` ga donese ovde i TypeScript
 * pokaže svako mesto koje ga ne pokriva — ručno prepisana enumeracija bi to
 * ćutke propustila.
 *
 * Imena polja ostaju srpska jer su takva i u bazi i u ugovoru
 * (docs/domain-glossary.md).
 */
export type ReportDto = components['schemas']['ReportResponseDto'];

/** Prijava sa istorijom izmena — vraća je samo `GET /reports/{id}`. */
export type ReportDetailDto = components['schemas']['ReportDetailDto'];

export type ReportHistoryEntry = components['schemas']['ReportHistoryDto'];

export type ReportType = ReportDto['tip'];

/** `nova → potvrdjena → resena`; `odbijena` i `duplikat` su završna stanja. */
export type ReportStatus = ReportDto['status'];

/**
 * Kako je prijava stigla. Prijava preko posrednika (predsednik MZ, škola) je
 * ravnopravna putanja, ne zaobilaznica — bez nje sela bez pametnih telefona ne
 * učestvuju uopšte.
 */
export type ReportChannel = ReportDto['kanal'];

/**
 * Koliko je lokacija prijave pouzdana. SMS nema GPS, pa `naselje` (centroid)
 * mora ostati validan odgovor ili je cela seoska putanja isprojektovana napolje.
 * Ista podela kao `geo_preciznost` kod deponija: izmereno / opisano / centroid.
 */
export type LocationPrecision = ReportDto['preciznost_lokacije'];

/** Šta je operativa odlučila da se radi — bira se pri potvrdi prijave. */
export type ReportAction = NonNullable<ReportDto['tip_obrade']>;

export type ReportSize = NonNullable<ReportDto['velicina']>;

/** Ručni prioritet dispečera: 1 najhitnije … 5 najmanje hitno; null do trijaže. */
export type Priority = 1 | 2 | 3 | 4 | 5;

/**
 * Fotografija vezana za prijavu. `javni_url` je javna adresa u object store-u
 * — svako sa linkom je vidi, zauvek (docs/media-storage.md), pa dispečer ima
 * dugme da je ukloni kad na njoj ima lice, tablica ili kućni broj.
 */
export type Photo = components['schemas']['PhotoDto'];

/**
 * Potvrda otpremljene fotografije. `foto_id` je jednokratan i važi do
 * `istice_at`: prijava koja ga ne preuzme u tom roku ostaje bez slike, a
 * slika se briše. Ovo je ceo razlog što se fotografija šalje PRE prijave —
 * anonimni prijavilac nikad ne sazna `id` prijave, samo kratki kod.
 */
export type PhotoReceipt = components['schemas']['PhotoReceiptDto'];

/** Telo `POST /reports/{id}/photos/{fotoId}/remove` — razlog ide u istoriju. */
export type RemovePhotoInput = components['schemas']['RemovePhotoDto'];

/**
 * Prijava kakvu UI prikazuje u redu i na mapi: isti oblik kao `ReportResponseDto`
 * plus `fotografije`, koje `GET /reports` vraća uz svaku stavku.
 */
export type Report = components['schemas']['ReportListItemDto'];

export type ReportDetail = ReportDetailDto;

/**
 * Ono što građanin šalje iz čarobnjaka — telo `POST /reports`, uz potvrde
 * otpremljenih fotografija. `foto_ids` za backend izvodi repo sloj; potvrde
 * ostaju cele da bi „Moje prijave“ imale `javni_url` za prikaz, jer javna
 * ruta posle slanja ne vraća prijavu nazad.
 */
export type NewReportInput = Omit<components['schemas']['CreateReportDto'], 'foto_ids'> & {
  fotografije?: PhotoReceipt[];
};

/** Telo `POST /reports/assisted` — dispečer unosi telefonsku prijavu. */
export type AssistedReportInput = components['schemas']['AssistedReportDto'];

/**
 * Automatski predlog trijaže (`docs/report-classification.md`).
 *
 * SAVETODAVAN. Prijava je ono što je dispečer odlučio, ne ono što je
 * klasifikator predložio: zato ovo stoji u zasebnom objektu, a ne u poljima
 * prijave. `ishod` beleži da li se dispečer složio, i to je jedini način da se
 * tačnost izmeri umesto da se pretpostavi.
 */
export type ReportClassification = components['schemas']['ClassificationDto'];

/** Šta je predlog imalo pod nogama: najbliži kontejner, pokrivenost, crna tačka. */
export type ClassificationSignals = components['schemas']['ClassificationSignalsDto'];

/** Finija podela ispod `tip`; od nje zavisi koja ekipa i koja mehanizacija izlazi. */
export type ReportSubcategory = NonNullable<ReportClassification['predlozena_podkategorija']>;

/** `model` je OpenAI, `pravila` su ključne reči — rade bez ključa i kad model padne. */
export type ClassificationSource = NonNullable<ReportClassification['izvor']>;

export type ClassificationOutcome = NonNullable<ReportClassification['ishod']>;

/** Telo `POST /reports/{id}/triage`. */
export type TriageInput = components['schemas']['TriageReportDto'];

/** Telo `POST /reports/{id}/resolve`. */
export type ResolveInput = components['schemas']['ResolveReportDto'];

/** Potvrda prijema koju građanin dobija; jedino što javna ruta vraća. */
export type ReportReceipt = components['schemas']['ReportReceiptDto'];

/** Stavka šifarnika (naselje, kontejner, posrednik) — id + naziv, bez kontakata. */
export type LookupItem = components['schemas']['LookupItemDto'];

export type LookupPage = components['schemas']['LookupPageDto'];

/** Stranica reda prijava koju vraca `GET /reports`. */
export type ReportPage = components['schemas']['ReportPageDto'];

/** Ulogovani radnik JKP-a. */
export type Staff = components['schemas']['StaffDto'];

// ---------------------------------------------------------------------------
// Kamioni i rute
// ---------------------------------------------------------------------------

export type TruckStatus = 'na_terenu' | 'u_bazi' | 'servis';

export interface Truck {
  id: Id;
  /** Registarska oznaka ili interni broj, npr. "PI 021-AB". */
  code: string;
  name: string;
  capacityKg: number;
  driverName: string;
  status: TruckStatus;
}

export type StopReason =
  | 'predvidjeno_prelivanje'
  | 'prijava_gradjana'
  | 'rizik_deponije'
  | 'redovan_obilazak';

export interface RouteStop {
  order: number;
  containerId: Id;
  settlementId: Id;
  reason: StopReason;
  /** Procenjeno vreme dolaska. */
  eta: IsoDateTime;
  done: boolean;
  /** Prijava zbog koje je stanica dodata, ako postoji. */
  reportId?: Id;
}

export interface TruckRoute {
  id: Id;
  date: IsoDate;
  truckId: Id;
  stops: RouteStop[];
  distanceKm: number;
  durationMin: number;
  /** Tačke za crtanje polilinije na mapi. */
  path: GeoPoint[];
}

export interface PlanMetrics {
  distanceKm: number;
  stops: number;
  fuelLiters: number;
  /** Koliki deo kontejnera pod rizikom (prelivanje u 48h, >=80%, otvorena prijava) plan obilazi, 0–100. */
  riskCoveredPct: number;
  /** Kontejneri pod rizikom koje plan NE obilazi — očekivana prelivanja. */
  expectedOverflows: number;
  /** Obilasci kontejnera ispod 40% — vožnja bez potrebe. */
  wastedStops: number;
  /** Naselja koja plan preskače jer trenutno nema potrebe. */
  settlementsSkipped: number;
}

export interface DailyPlan {
  date: IsoDate;
  generatedAt: IsoDateTime;
  routes: TruckRoute[];
  comparison: {
    /** Šta bi bilo sa fiksnim rasporedom. */
    fixed: PlanMetrics;
    /** Šta sistem predlaže. */
    optimized: PlanMetrics;
  };
}

// ---------------------------------------------------------------------------
// Istorijska žarišta (divlje deponije)
// ---------------------------------------------------------------------------

export type HotspotRecurrence = 'da' | 'ne' | 'nepoznato';

export type HotspotStatus = 'aktivna' | 'prijavljeno' | 'ocisceno' | 'u_sanaciji' | 'evidentirana';

export interface Hotspot extends GeoPoint {
  /** Kanonski ID iz dataseta, npr. "K-26". */
  id: Id;
  name: string;
  /** Naziv naselja iz izvora (može biti više, razdvojeno " / "). */
  settlementName: string;
  /** Povezano naselje iz našeg šifarnika, ako je prepoznato. */
  settlementId: Id | null;
  /** Koliko je koordinata pouzdana (registarska_tacka = zvanična, ostalo = geokodirano). */
  geoPrecision: string;
  firstSeenYear: number;
  lastSeenYear: number;
  yearsRecorded: number[];
  observations: number;
  sources: string[];
  areaM2: number | null;
  volumeM3: number | null;
  tonnes: number | null;
  cleanedAt: string | null;
  recurs: HotspotRecurrence;
  status: HotspotStatus;
  statusNote: string;
  /** Izvedeni skor rizika 0–100 (ponavljanje, dužina serije, skorašnjost). */
  riskScore: number;
}

// ---------------------------------------------------------------------------
// Raspored odvoza i mesta za odlaganje
// ---------------------------------------------------------------------------

/** 1 = ponedeljak ... 7 = nedelja. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface CollectionSchedule {
  settlementId: Id;
  weekdays: Weekday[];
  /** Okvirno vreme dolaska, npr. "07:00–10:00". */
  timeWindow: string;
  nextPickupAt: IsoDateTime;
  note?: string;
}

export type DisposalSiteType =
  | 'reciklazno_dvoriste'
  | 'staklo'
  | 'plastika'
  | 'papir'
  | 'kabasti'
  | 'elektronski'
  | 'baterije'
  | 'gume'
  | 'zeleni';

/**
 * Mesto za odlaganje na građanskoj mapi — iz baze (`GET /disposal/sites`),
 * samo stvarna mesta sa izvorom. Pretraga poredi prepoznati materijal sa
 * `materijali` svakog mesta, pa nijedan spisak „koji materijal ima filter“ ne
 * postoji u kodu. `DisposalSiteType` gore je nešto drugo: kategorije vodiča.
 */
export type DisposalSite = components['schemas']['DisposalSiteDto'];

/** Šta mesto jeste (ikona, boja, čip filtera) — ne šta prima. */
export type MapSiteType = DisposalSite['tip'];

export interface WasteGuideEntry {
  id: Id;
  /** Vrsta otpada, npr. "Baterije i akumulatori". */
  wasteType: string;
  keywords: string[];
  howTo: string;
  siteTypes: DisposalSiteType[];
  /** Šta se ne sme raditi. */
  dontDo?: string;
}

// ---------------------------------------------------------------------------
// Vesti (novosti JKP-a za građane)
// ---------------------------------------------------------------------------

/**
 * Vesti su od ugovora nadalje backend funkcija, pa se tipovi izvode iz
 * `src/api/generated/schema.ts` kao i prijave. Imena polja ostaju srpska jer su
 * takva i u bazi i u ugovoru (docs/domain-glossary.md).
 *
 * `sms_tekst` nije ukras: feed pretpostavlja internet, a selo bez pametnog
 * telefona mora da dobije istu vest (CLAUDE.md, „Do not assume a smartphone“).
 * `null` znači da objava svesno ostaje samo u aplikaciji.
 */
export type NewsItem = components['schemas']['NewsResponseDto'] & {
  /**
   * Demo reakcije građana. Backend lajkove i komentare nema, pa ih dodaje mock
   * sloj u `repo.ts` — isti obrazac kao `photoUrl` na prijavi. Opciono, jer
   * objava koja se vraća iz izmene ili ide u pregled forme nema odakle da ih nosi.
   */
  engagement?: NewsEngagement;
};

/** Brojači ispod objave. Samo prikaz: nijedan klik se ne čuva. */
export interface NewsEngagement {
  likes: number;
  comments: number;
}

export type NewsCategory = NewsItem['kategorija'];

/** Telo `POST /news`. */
export type NewsInput = components['schemas']['CreateNewsDto'];

/** Telo `PATCH /news/{id}` — izostavljeno polje ostaje, `null` ga briše. */
export type NewsPatch = components['schemas']['UpdateNewsDto'];

/** Stranica feeda koju vraća `GET /news`. */
export type NewsPage = components['schemas']['NewsPageDto'];

// ---------------------------------------------------------------------------
// Pretraga „gde da odložim“ i sakupljači sekundarnih sirovina
// ---------------------------------------------------------------------------

/**
 * Odgovor na slobodan upit („imam star šporet“). Materijal prepoznaje backend
 * (OpenAI, uz rezervu po ključnim rečima); da li ga pokriva filter na mapi
 * odlučuje front, jer mesta na mapi žive ovde (mock), ne na backendu.
 */
export type DisposalSuggestion = components['schemas']['DisposalSuggestionDto'];

/** Materijal iz upita; prvih osam vrednosti su i filteri na mapi. */
export type WasteMaterial = NonNullable<DisposalSuggestion['materijal']>;

/** Sakupljač koji preuzima ono što JKP ne preuzima; broj telefona je javan namerno. */
export type Collector = components['schemas']['CollectorDto'];

/** Uvek prisutan kontakt: JKP „Regionalna deponija Pirot“. */
export type DefaultContact = components['schemas']['DefaultContactDto'];

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardSummary {
  containersAbove80: number;
  predictedOverflows48h: number;
  activeReports: number;
  trucksOnRoute: number;
  totalContainers: number;
  totalTrucks: number;
}

// ---------------------------------------------------------------------------
// Zajednica: bodovi građanina i takmičenje naselja (CLAUDE.md, tačka 6)
// ---------------------------------------------------------------------------

export type BadgeKind = 'prva_prijava' | 'oko_sokolovo' | 'akcija_ciscenja' | 'razvrstavanje' | 'komsija';

export interface CitizenBadge {
  kind: BadgeKind;
  /** `null` dok bedž nije osvojen — prikazuje se zasivljen, kao cilj. */
  earnedAt: IsoDate | null;
}

export interface PointsEntry {
  id: Id;
  at: IsoDateTime;
  points: number;
  /** Šta je nagrađeno: potvrđena prijava, učešće u akciji, razvrstavanje. */
  reason: string;
}

/**
 * Profil je vezan za uređaj, ne za nalog: prijave su anonimne, pa su i bodovi
 * (docs/reports-mvp.md). Zato nema imena — samo naselje koje je građanin izabrao.
 */
export interface CommunityProfile {
  points: number;
  /** Pozicija u naselju, 1 = najbolji. */
  rankInSettlement: number;
  settlementMembers: number;
  badges: CitizenBadge[];
  history: PointsEntry[];
}

/**
 * Red na rang listi „najčistije naselje meseca“. Bodovanje je na merljivim
 * pokazateljima, ne na broju prijava — da se ne nagrađuje prijavljivanje
 * radi prijavljivanja.
 */
export interface SettlementRanking {
  settlementId: Id;
  rank: number;
  score: number;
  /** Promena u odnosu na prošli mesec: + gore, − dole, 0 isto. */
  delta: number;
  newDumps: number;
  recurrences: number;
  cleanupActions: number;
}
