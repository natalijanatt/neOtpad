/**
 * Sloj podataka. UI poziva SAMO funkcije odavde (preko hook-ova u
 * src/data/queries.ts) i nikad ne uvozi src/data/mock direktno.
 *
 * Dve grupe funkcija, namerno razdvojene:
 *
 * 1. **Backend** — prijave, trijaža i šifarnici idu na prave rute iz ugovora,
 *    kroz `api` iz src/api/client.ts. To je izvor istine.
 * 2. **Mock** — kamioni, dnevni plan, raspored, vodič i zajednica; ugovor ih još
 *    nema. Svaka takva funkcija je ovde označena, pa se vidi šta ostaje da se
 *    poveže.
 *
 * Kad se pojavi nova ruta, menja se telo funkcije, ne UI.
 */
import { api } from '@/api/client';
import { ApiError, idempotencyKey, unwrap } from '@/api/errors';
import type { components } from '@/api/generated/schema';
import type {
  AssistedReportInput,
  CollectionSchedule,
  CommunityProfile,
  Container,
  ContainerDetail,
  ContainerReading,
  DailyPlan,
  DashboardSummary,
  DisposalSite,
  DisposalSuggestion,
  Hotspot,
  HotspotRecurrence,
  HotspotStatus,
  Id,
  LookupItem,
  LookupPage,
  NewReportInput,
  NewsCategory,
  NewsInput,
  NewsItem,
  NewsPatch,
  PhotoReceipt,
  RemovePhotoInput,
  Report,
  ReportClassification,
  ReportChannel,
  ReportDetail,
  ReportDto,
  ReportPage,
  ReportReceipt,
  ForecastConfidence,
  ForecastPoint,
  ReportStatus,
  ReportType,
  ResolveInput,
  SensorHealth,
  SensorStatusCode,
  Settlement,
  SettlementCoverage,
  SettlementRanking,
  TriageInput,
  Truck,
  WasteGuideEntry,
} from '@/domain/types';
import { myCommunityProfile, settlementRankings } from './mock/community';
import { wasteGuide } from './mock/disposal';
import { demoEngagementFor } from './mock/engagement';
import { schedules } from './mock/schedules';
import { naselja } from './mock/naselja';
import { settlements } from './mock/settlements';
import { store } from './mock/store';
import { trucks } from './mock/trucks';
import { hotspotRiskScore } from '@/lib/hotspots';
import { isOpenReport } from '@/lib/reports';
import { isReadingTrusted } from '@/lib/sensors';

/** Simulirana mrežna latencija mock poziva, da loading stanja budu vidljiva. */
const MOCK_DELAY_MS = 250;

function respond<T>(value: T, delay = MOCK_DELAY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), delay));
}

function notFound(what: string, id: Id): never {
  throw new Error(`${what} „${id}“ ne postoji.`);
}

// ---------------------------------------------------------------------------
// Šifarnici (backend)
// ---------------------------------------------------------------------------

/** Najveći `limit` koji ugovor dozvoljava; više od 5 stranica ne treba nijednom šifarniku. */
const LOOKUP_LIMIT = 100;
const MAX_LOOKUP_PAGES = 5;

async function collectPages(load: (page: number) => Promise<LookupPage>): Promise<LookupItem[]> {
  const items: LookupItem[] = [];
  for (let page = 1; page <= MAX_LOOKUP_PAGES; page++) {
    const chunk = await load(page);
    items.push(...chunk.items);
    if (!chunk.hasMore) break;
  }
  return items;
}

/**
 * Naselja iz baze: identifikatori koje backend prihvata u `naselje_id`.
 * Mock naselja (`getSettlements`) imaju koordinate i broj domaćinstava, ali i
 * svoje lokalne ID-jeve — nikad se ne šalju u API.
 */
export function getSettlementOptions(search?: string): Promise<LookupItem[]> {
  return collectPages(async (page) =>
    unwrap(await api.GET('/settlements', { params: { query: { page, limit: LOOKUP_LIMIT, ...(search ? { search } : {}) } } })),
  );
}

/** Aktivni kontejneri za trijažu; opciono suženi na jedno naselje. */
export function getContainerOptions(naselje_id?: Id): Promise<LookupItem[]> {
  return collectPages(async (page) =>
    unwrap(
      await api.GET('/containers', { params: { query: { page, limit: LOOKUP_LIMIT, ...(naselje_id ? { naselje_id } : {}) } } }),
    ),
  );
}

/** Posrednici (predsednici MZ, škole) — bez telefona, backend ih ne serijalizuje. */
export function getIntermediaries(): Promise<LookupItem[]> {
  return collectPages(async (page) => unwrap(await api.GET('/intermediaries', { params: { query: { page, limit: LOOKUP_LIMIT } } })));
}

// ---------------------------------------------------------------------------
// Prijave — operativa (backend)
// ---------------------------------------------------------------------------

export interface ReportFilter {
  /** `otvorene` nije status backenda: red se tada puni u dva poziva. */
  status?: ReportStatus | 'otvorene';
  naselje_id?: Id;
  tip?: ReportType;
  kanal?: ReportChannel;
  kratki_kod?: string;
  page?: number;
  limit?: number;
}

const DEFAULT_LIMIT = 50;

async function fetchReportPage(filter: ReportFilter, status?: ReportStatus): Promise<ReportPage> {
  return unwrap(
    await api.GET('/reports', {
      params: {
        query: {
          page: filter.page ?? 1,
          limit: filter.limit ?? DEFAULT_LIMIT,
          ...(status ? { status } : {}),
          ...(filter.naselje_id ? { naselje_id: filter.naselje_id } : {}),
          ...(filter.tip ? { tip: filter.tip } : {}),
          ...(filter.kanal ? { kanal: filter.kanal } : {}),
          ...(filter.kratki_kod ? { kratki_kod: filter.kratki_kod } : {}),
        },
      },
    }),
  );
}

/**
 * Red prijava. Backend filtrira po jednom statusu, a operativi najviše treba
 * „sve što još traži akciju“ — to su dva statusa, pa se spajaju ovde, sortirano
 * kao i na serveru (najnovije prvo).
 */
export async function getReports(filter: ReportFilter = {}): Promise<Report[]> {
  if (filter.status === 'otvorene') {
    const [nove, potvrdjene] = await Promise.all([
      fetchReportPage(filter, 'nova'),
      fetchReportPage(filter, 'potvrdjena'),
    ]);
    // Prijava potvrđena između dva poziva pojavljuje se u oba odgovora; bez
    // uklanjanja dupliranja dobila bi dva reda u tabeli.
    const byId = new Map([...nove.items, ...potvrdjene.items].map((r) => [r.id, r]));
    return [...byId.values()].sort((a, b) => new Date(b.primljena_at).getTime() - new Date(a.primljena_at).getTime());
  }
  const page = await fetchReportPage(filter, filter.status);
  return page.items;
}

export async function getReport(id: Id): Promise<ReportDetail> {
  return unwrap(await api.GET('/reports/{id}', { params: { path: { id } } }));
}

/**
 * Trijaža: potvrda, odbijanje ili duplikat. `verzija` je obavezna i mora biti
 * ona iz poslednjeg čitanja — zastarela vraća 409 i znači da je neko drugi
 * već menjao prijavu (docs/reports-mvp.md).
 */
export async function triageReport(id: Id, body: TriageInput): Promise<ReportDto> {
  return unwrap(await api.POST('/reports/{id}/triage', { params: { path: { id } }, body }));
}

/**
 * Ponovna klasifikacija prijave, odmah.
 *
 * Savetodavno: prijava se ne menja, dispečer i dalje potvrđuje kroz trijažu.
 * Backend na prvi neuspeh modela pada na klasifikaciju po ključnim rečima, pa
 * ovaj poziv uvek vrati predlog umesto da ostavi spinner
 * (docs/report-classification.md).
 */
export async function classifyReport(id: Id): Promise<ReportClassification> {
  return unwrap(await api.POST('/reports/{id}/classify', { params: { path: { id } } }));
}

/** Zatvaranje potvrđene prijave beleškom o urađenom poslu. */
export async function resolveReport(id: Id, body: ResolveInput): Promise<ReportDto> {
  return unwrap(await api.POST('/reports/{id}/resolve', { params: { path: { id } }, body }));
}

/** Telefonska prijava ili prijava preko posrednika, koju unosi dispečer. */
export async function createAssistedReport(body: AssistedReportInput): Promise<ReportReceipt> {
  return unwrap(
    await api.POST('/reports/assisted', { params: { header: { 'Idempotency-Key': idempotencyKey() } }, body }),
  );
}

/**
 * Uklanjanje fotografije sa prijave — za lice, tablicu, kućni broj. Bucket je
 * javan i brisanje je jedina zaštita koja postoji (docs/media-storage.md).
 * POST, ne DELETE, jer je razlog obavezan i ide u istoriju; `verzija` prijave
 * se ne menja, pa panel trijaže ne mora da se resetuje.
 */
export async function removeReportPhoto(id: Id, fotoId: Id, body: RemovePhotoInput): Promise<void> {
  const result = await api.POST('/reports/{id}/photos/{fotoId}/remove', { params: { path: { id, fotoId } }, body });
  // 204 nema telo, pa `unwrap` (koji traži `data`) ovde ne može da posluži.
  if (!result.response.ok) unwrap(result);
}

// ---------------------------------------------------------------------------
// Prijave — građanin
// ---------------------------------------------------------------------------

/**
 * Otpremanje fotografije PRE slanja prijave (`POST /reports/photos`). Vraća
 * jednokratan `foto_id` koji prijava preuzima kroz `foto_ids`; neiskorišćen
 * ističe posle 24 h i slika se briše (docs/media-storage.md). Bajtovi idu kroz
 * API, nikad direktno u object store — front nema nikakav ključ za njega.
 */
export async function uploadReportPhoto(file: File): Promise<PhotoReceipt> {
  return unwrap(
    await api.POST('/reports/photos', {
      // Generator binarno polje tipizira kao `string`; fajl se ipak šalje kao
      // deo multipart tela, a Content-Type sa boundary-jem postavlja pregledač.
      body: { foto: file as unknown as string },
      bodySerializer: (body) => {
        const form = new FormData();
        form.append('foto', body.foto as unknown as File);
        return form;
      },
    }),
  );
}

/**
 * Slanje prijave. Javna ruta vraća samo potvrdu (kratki kod, vreme, status), pa
 * se prijava dodatno zapisuje lokalno da bi „Moje prijave“ imale šta da prikažu
 * dok backend nema javno čitanje. Backend preuzima sve `foto_ids` ili odbija
 * celu prijavu — nema prijave kojoj je slika ćutke ispala.
 */
export async function createReport(input: NewReportInput): Promise<ReportDetail> {
  const { fotografije = [], ...rest } = input;
  const body = { ...rest, ...(fotografije.length ? { foto_ids: fotografije.map((f) => f.foto_id) } : {}) };
  const receipt = unwrap(
    await api.POST('/reports', { params: { header: { 'Idempotency-Key': idempotencyKey() } }, body }),
  );
  return store.addLocalReport(body, receipt, fotografije);
}

/** MOCK: građanin nema nalog ni javnu rutu za čitanje — lokalni zapis prijava. */
export function getMyReports(): Promise<ReportDetail[]> {
  return respond(store.getReports());
}

/** MOCK: isto kao gore, po ID-ju lokalnog zapisa. */
export function getMyReport(id: Id): Promise<ReportDetail> {
  return respond(store.getReport(id) ?? notFound('Prijava', id));
}

// ---------------------------------------------------------------------------
// MOCK: naselja sa koordinatama
// ---------------------------------------------------------------------------

/** MOCK: ugovor daje samo id i naziv; koordinate i domaćinstva su demo podaci. */
export function getSettlements(): Promise<Settlement[]> {
  return respond(settlements);
}

/**
 * MOCK: svih 72 naselja grada Pirota sa zastavicom pokrivenosti. Nije demo
 * skup nego prepis izvora (`waste-scraper/data/pirot_naselja.csv`, generisan u
 * `src/data/mock/naselja.ts`) — ugovor za ovo još nema rutu, jer `/settlements`
 * je šifarnik id + naziv.
 */
export function getSettlementCoverage(): Promise<SettlementCoverage[]> {
  return respond(naselja);
}

// ---------------------------------------------------------------------------
// Kontejneri (backend)
//
// `sa_stanjem` uključuje lokaciju, keširano stanje i sažetak prognoze; bez
// njega je isti endpoint šifarnik koji koristi čarobnjak za prijave. Kriva
// prognoze ide zasebno, jer je u listi niko ne crta.
// ---------------------------------------------------------------------------

type ContainerRow = components['schemas']['ContainerListItemDto'];
type ForecastRow = components['schemas']['ForecastDto'];
type ReadingRow = components['schemas']['ContainerReadingDto'];

/** Najveći `limit` koji ugovor dozvoljava — cela flota sa senzorom staje u jednu stranicu. */
const CONTAINER_LIMIT = 500;

/**
 * Statusi uređaja iz `aktivni_status` su slobodan tekst u bazi; UI poznaje
 * zatvoren skup. Nepoznat kod se ne izmišlja u „ok“, nego ispada — jedino
 * `tih_od` dodaje `silent`, koji stanje ne nosi kao kod.
 */
const SENSOR_CODES: SensorStatusCode[] = ['ok', 'optics_blocked', 'low_battery', 'tipped', 'silent'];

function sensorOf(row: ContainerRow): SensorHealth | null {
  const stanje = row.stanje;
  if (!row.ima_senzor || !stanje) return null;

  const codes = stanje.aktivni_status.filter((c): c is SensorStatusCode =>
    (SENSOR_CODES as string[]).includes(c),
  );
  if (stanje.tih_od !== null && !codes.includes('silent')) codes.push('silent');

  return { batteryPercent: stanje.baterija_percent ?? 0, status: codes.length > 0 ? codes : ['ok'] };
}

function toContainer(row: ContainerRow): Container {
  return {
    id: row.id,
    code: row.naziv,
    settlementId: row.naselje_id,
    locationName: row.mesto_naziv ?? '',
    capacityLiters: row.zapremina_l ?? 0,
    hasSensor: row.ima_senzor ?? false,
    sensor: sensorOf(row),
    fillLevel: row.stanje?.fill_percent ?? null,
    trendPpPerDay: row.stanje?.trend_pp_po_danu ?? null,
    lastReadingAt: row.stanje?.measured_at ?? null,
    lastCollectedAt: row.poslednje_praznjenje ?? null,
    predictedCriticalAt: row.prognoza?.vreme_kriticnog ?? null,
    expected24h: row.prognoza?.ocekivano_24h ?? null,
    expected48h: row.prognoza?.ocekivano_48h ?? null,
    forecastConfidence: (row.prognoza?.pouzdanost as ForecastConfidence | undefined) ?? null,
    forecastAt: row.prognoza?.izracunata_at ?? null,
    overflowsLast90Days: row.prelivanja_90d ?? 0,
    lat: row.lokacija?.lat ?? 0,
    lon: row.lokacija?.lon ?? 0,
  };
}

export interface ContainerFilter {
  naselje_id?: Id;
  /** Samo kontejneri sa montiranim senzorom — to je flota koju mapa prikazuje. */
  samo_sa_senzorom?: boolean;
  /** Samo oni za koje model očekuje prelazak preko 95% pre ovog trenutka. */
  kriticno_do?: string;
}

export async function getContainers(filter: ContainerFilter = {}): Promise<Container[]> {
  const page = unwrap(
    await api.GET('/containers', {
      params: { query: { page: 1, limit: CONTAINER_LIMIT, sa_stanjem: true, ...filter } },
    }),
  );
  return page.items.map(toContainer);
}

export async function getContainer(id: Id): Promise<ContainerDetail> {
  const [row, readings, forecast] = await Promise.all([
    unwrap(await api.GET('/containers/{id}', { params: { path: { id } } })),
    getContainerReadings(id),
    getContainerForecast(id),
  ]);

  return {
    ...toContainer(row),
    history: readings,
    forecast,
    // Kalendar sezonalnosti još nije popunjen (docs/fill-forecasting.md), pa
    // ovde nema šta da se prikaže; polje ostaje da UI ne mora da se menja.
    seasonalEvents: [],
  };
}

export async function getContainerReadings(id: Id, dana = 14): Promise<ContainerReading[]> {
  const rows = unwrap(await api.GET('/containers/{id}/readings', { params: { path: { id }, query: { dana } } }));

  // Merenje bez izračunate vrednosti nema šta da doprinese krivoj; nepouzdano
  // ostaje, jer se prikazuje prigušeno umesto da nestane u rupu.
  return rows
    .filter((r: ReadingRow) => r.fill_percent !== null)
    .map((r: ReadingRow) => ({
      at: r.measured_at,
      level: r.fill_percent as number,
      trusted: r.pouzdano,
      orientation: r.orientation,
    }));
}

export async function getContainerForecast(id: Id): Promise<ForecastPoint[]> {
  const odgovor = unwrap(await api.GET('/containers/{id}/forecast', { params: { path: { id } } }));
  const serija = odgovor.prognoza?.serija ?? [];

  return serija.map((t: ForecastRow['serija'][number]) => ({ at: t.t, p10: t.p10, p50: t.p50, p90: t.p90 }));
}

// ---------------------------------------------------------------------------
// Žarišta (aktivne divlje deponije) — pravi registar iz baze
//
// Registar ima 52 kanonske lokacije spojene iz SEPA, LPUO, Eko Alerta i akcija
// čišćenja; `GET /dumps` vraća 40 koje i dalje stoje. Ranije mock generisan iz
// istog CSV-a skriptom `scripts/build-hotspots.mjs`; sada ide kroz ugovor, pa se
// ponovni uvoz vidi bez regenerisanja fajla.
// ---------------------------------------------------------------------------

type DumpRow = components['schemas']['DumpDto'];

/** Najveći `limit` koji ugovor dozvoljava; ceo registar staje u jednu stranicu. */
const DUMP_LIMIT = 500;

export interface HotspotFilter {
  /** `true` vraća i očišćene i one u sanaciji — ceo registar, ne samo ono što stoji. */
  sve?: boolean;
}

function toHotspot(row: DumpRow, lokacija: NonNullable<DumpRow['lokacija']>): Hotspot {
  const years = row.godine_evidentirana;
  // Bez kastova: ugovor ove dve vrednosti tipizuje kao iste unije koje nosi
  // `domain/types.ts`, pa bi novo stanje na backendu palo kao greška prevođenja
  // umesto da se tiho provuče.
  const status: HotspotStatus = row.stanje;
  const recurs: HotspotRecurrence = row.ponovo_se_stvara;
  // Skalari mogu biti prazni kad ih izvor nije dao; niz godina je tada jedino
  // što stvarno znamo, pa se raspon čita iz njega umesto da se izmisli nula.
  const lastSeen = row.poslednji_put_zabelezena ?? (years.length ? Math.max(...years) : 0);
  const firstSeen = row.prvi_put_zabelezena ?? (years.length ? Math.min(...years) : 0);

  return {
    // Kanonski ID (`K-07`) je identitet koji registar i UI citiraju; UUID reda
    // ne znači nikome ko gleda mapu.
    id: row.kanonski_id,
    name: row.naziv ?? row.kanonski_id,
    // Naziv iz našeg šifarnika, ne iz izvora. Deo lokacija se nije spojio ni sa
    // jednim naseljem, i to se kaže umesto da ostane prazno polje.
    settlementName: row.naselje_naziv ?? 'naselje nije prepoznato',
    settlementId: row.naselje_id,
    lat: lokacija.lat,
    lon: lokacija.lon,
    geoPrecision: row.geo_preciznost,
    firstSeenYear: firstSeen,
    lastSeenYear: lastSeen,
    yearsRecorded: years,
    observations: row.broj_opservacija,
    sources: row.izvori,
    areaM2: row.povrsina_m2,
    volumeM3: row.zapremina_m3,
    tonnes: row.kolicina_t,
    cleanedAt: row.ociscena_datum,
    recurs,
    status,
    statusNote: row.status ?? '',
    riskScore: hotspotRiskScore({ recurs, years, lastSeen, status }),
  };
}

/**
 * Podrazumevano samo one koje i dalje stoje: očišćene i one u sanaciji backend
 * izostavlja (osim ako izvor kaže da se očišćena ponovo stvara). Mapa pita šta
 * je tamo sada, a ne šta je ikad bilo evidentirano — `sve` traži i istoriju,
 * za pregled celog registra.
 *
 * Lokacije bez koordinate takođe ne izlaze odavde: `Hotspot` je tačka na mapi, a
 * deponija sa `geo_preciznost = 'nepoznato'` nema gde da se nacrta ni od čega da
 * se meri rastojanje. Oba filtera traže se od backenda, pa se broj dobijenih
 * redova poklapa sa brojem nacrtanih.
 */
export async function getHotspots({ sve = false }: HotspotFilter = {}): Promise<Hotspot[]> {
  const page = unwrap(await api.GET('/dumps', { params: { query: { page: 1, limit: DUMP_LIMIT, sa_lokacijom: true, sve } } }));

  return page.items.flatMap((row) => (row.lokacija ? [toHotspot(row, row.lokacija)] : []));
}

export async function getHotspot(id: Id): Promise<Hotspot> {
  return (await getHotspots()).find((h) => h.id === id) ?? notFound('Žarište', id);
}

// ---------------------------------------------------------------------------
// MOCK: kamioni i rute
// ---------------------------------------------------------------------------

export function getTrucks(): Promise<Truck[]> {
  return respond(trucks);
}

export function getDailyPlan(date: string): Promise<DailyPlan> {
  return respond(store.getPlan(date));
}

/** „Generiši plan“ — mock traje duže da bi animacija imala smisla. */
export function generateDailyPlan(date: string): Promise<DailyPlan> {
  return respond(store.regeneratePlan(date), 1400);
}

// ---------------------------------------------------------------------------
// Optimizovane rute (pravi backend — GreedyRiskAwarePlanner)
//
// Jedno od mesta u aplikaciji gde se poziva pravi ugovor umesto mock sloja
// (frontend/.claude/skills/consume-endpoint): backend za ovo tek postoji,
// ostatak aplikacije i dalje čita src/data/mock.
// ---------------------------------------------------------------------------

export type RoutePlan = components['schemas']['RoutePlanDto'];
export type GeneratedRoutePlan = components['schemas']['GeneratePlanResponseDto'];

export async function getRoutePlans(datum: string): Promise<RoutePlan[]> {
  return unwrap(await api.GET('/routes', { params: { query: { datum } } }));
}

export async function generateRoutePlan(datum: string): Promise<GeneratedRoutePlan> {
  return unwrap(await api.POST('/routes/plan', { body: { datum } }));
}

// ---------------------------------------------------------------------------
// MOCK: raspored, mesta za odlaganje, vodič
// ---------------------------------------------------------------------------

export function getSchedules(): Promise<CollectionSchedule[]> {
  return respond(schedules);
}

export function getSchedule(settlementId: Id): Promise<CollectionSchedule | null> {
  return respond(schedules.find((s) => s.settlementId === settlementId) ?? null);
}

/**
 * Stvarna mesta sa izvorom, iz baze. Ranije mock spisak; sada svako mesto
 * nosi i šta prima (`materijali`), pa ga pretraga nalazi po podacima.
 */
export async function getDisposalSites(): Promise<DisposalSite[]> {
  return unwrap(await api.GET('/disposal/sites'));
}

export function getWasteGuide(): Promise<WasteGuideEntry[]> {
  return respond(wasteGuide);
}

// ---------------------------------------------------------------------------
// MOCK: zajednica (bodovi, bedževi, rang lista naselja)
// ---------------------------------------------------------------------------

export function getMyCommunityProfile(): Promise<CommunityProfile> {
  return respond(myCommunityProfile);
}

export function getSettlementRankings(): Promise<SettlementRanking[]> {
  return respond(settlementRankings);
}

// ---------------------------------------------------------------------------
// Vesti (backend)
// ---------------------------------------------------------------------------

/** Najviše objava po stranici koje ugovor dozvoljava. */
const NEWS_LIMIT = 100;

export interface NewsFilter {
  /** Naselje: backend uz njegove objave vraća i opštinske, i to je namerno. */
  naselje_id?: Id;
  kategorija?: NewsCategory;
  page?: number;
  limit?: number;
}

/**
 * Feed vesti. Čitanje je javno — građanska zona nema naloge — a redosled
 * (zakačene prvo, pa najnovije) pravi baza, pa se ovde ništa ne sortira.
 */
export async function getNews(filter: NewsFilter = {}): Promise<NewsItem[]> {
  const page = unwrap(
    await api.GET('/news', {
      params: {
        query: {
          page: filter.page ?? 1,
          limit: filter.limit ?? NEWS_LIMIT,
          ...(filter.naselje_id ? { naselje_id: filter.naselje_id } : {}),
          ...(filter.kategorija ? { kategorija: filter.kategorija } : {}),
        },
      },
    }),
  );
  return page.items.map(withDemoEngagement);
}

/**
 * MOCK: lajkove i komentare ugovor nema, pa objava sa backenda dobija demo
 * brojeve — kao `withDemoPhoto` za prijave. Briše se čim reakcije postoje.
 */
function withDemoEngagement(item: NewsItem): NewsItem {
  return { ...item, engagement: demoEngagementFor(item.id) };
}

/** Objavljivanje — traži administratorski nalog (docs/news-feed.md). */
export async function createNews(body: NewsInput): Promise<NewsItem> {
  return unwrap(await api.POST('/news', { body }));
}

/**
 * Izmena. `verzija` mora biti ona iz poslednjeg čitanja: zastarela vraća 409 i
 * znači da je neko drugi već menjao objavu. Izostavljeno polje ostaje kakvo je,
 * `null` ga briše — zato patch nije `Partial<NewsInput>` nego telo iz ugovora.
 */
export async function updateNews(id: Id, body: NewsPatch): Promise<NewsItem> {
  return unwrap(await api.PATCH('/news/{id}', { params: { path: { id } }, body }));
}

/** Brisanje. Već poslate SMS poruke se ne povlače, pa UI traži potvrdu. */
export async function deleteNews(id: Id): Promise<void> {
  const { error, response } = await api.DELETE('/news/{id}', { params: { path: { id } } });
  // 204 nema telo, pa `unwrap` ovde ne može da razlikuje uspeh od greške.
  if (error !== undefined || !response.ok) throw new ApiError(response.status, 'Brisanje nije uspelo.', error);
}

/** Kačenje na vrh feeda je obična izmena jednog polja, uz istu proveru verzije. */
export function setNewsPinned(id: Id, verzija: number, zakacena: boolean): Promise<NewsItem> {
  return updateNews(id, { verzija, zakacena });
}

// ---------------------------------------------------------------------------
// Pretraga „gde da odložim“ (backend)
// ---------------------------------------------------------------------------

/**
 * Slobodan upit → materijal, sakupljači i podrazumevani kontakt. Javna ruta,
 * ograničena po adresi (429), jer svaki poziv može da ode do plaćenog modela.
 */
export async function suggestDisposal(upit: string): Promise<DisposalSuggestion> {
  return unwrap(await api.POST('/disposal/suggest', { body: { upit } }));
}

// ---------------------------------------------------------------------------
// Dashboard — kontejneri i prijave sa backenda, vozni park još mock
// ---------------------------------------------------------------------------

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const in48h = Date.now() + 48 * 3_600_000;
  const [open, fleet] = await Promise.all([
    getReports({ status: 'otvorene', limit: 100 }),
    getContainers({ samo_sa_senzorom: true }),
  ]);

  return {
    // Nepouzdano merenje ne ulazi ni u jedan brojač: zaprljana optika čita kao
    // „puno“, i to je najlakši način da kamion ode uzalud.
    containersAbove80: fleet.filter((c) => isReadingTrusted(c) && (c.fillLevel ?? 0) >= 80).length,
    predictedOverflows48h: fleet.filter(
      (c) => isReadingTrusted(c) && c.predictedCriticalAt && new Date(c.predictedCriticalAt).getTime() <= in48h,
    ).length,
    activeReports: open.filter(isOpenReport).length,
    trucksOnRoute: trucks.filter((t) => t.status === 'na_terenu').length,
    totalContainers: fleet.length,
    totalTrucks: trucks.length,
  };
}
