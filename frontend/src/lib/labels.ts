import type {
  BadgeKind,
  ClassificationOutcome,
  ClassificationSource,
  DisposalSiteType,
  HotspotStatus,
  LocationPrecision,
  NewsCategory,
  Priority,
  ReportAction,
  ReportChannel,
  ReportHistoryEntry,
  ReportSize,
  ReportStatus,
  ReportSubcategory,
  ReportType,
  Staff,
  SeasonalEventKind,
  StopReason,
  TruckStatus,
  Weekday,
  WasteMaterial,
  MapSiteType,
} from '@/domain/types';

/** Sve labele enum vrednosti na jednom mestu — UI nikad ne prikazuje sirove kodove. */

export const REPORT_TYPE_LABEL: Record<ReportType, string> = {
  pun_kontejner: 'Pun kontejner',
  prelivanje: 'Prelivanje kontejnera',
  divlja_deponija: 'Divlja deponija',
  ostecen_kontejner: 'Oštećen kontejner',
  nedostaje_kontejner: 'Nedostaje kontejner',
  drugo: 'Drugo',
};

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  nova: 'Nova',
  potvrdjena: 'Potvrđena',
  odbijena: 'Odbijena',
  duplikat: 'Duplikat',
  resena: 'Rešena',
};

/**
 * Prioritet je ručni broj dispečera (1 najhitnije … 5 najmanje hitno), a ne
 * skor modela — `docs/reports-mvp.md` ga izričito odvaja od budućih skorova
 * rizika. Labela zato uvek nosi i broj.
 */
export const PRIORITY_LABEL: Record<Priority, string> = {
  1: '1 — hitno',
  2: '2 — visok',
  3: '3 — uobičajen',
  4: '4 — nizak',
  5: '5 — može da čeka',
};

/** Kratak oblik za tabelu, gde ceo tekst ne staje. */
export const PRIORITY_SHORT: Record<Priority, string> = { 1: 'Hitno', 2: 'Visok', 3: 'Srednji', 4: 'Nizak', 5: 'Najniži' };

/** `tip_obrade` — odgovor koji dispečer bira pri potvrdi prijave. */
export const REPORT_ACTION_LABEL: Record<ReportAction, string> = {
  odvoz: 'Odvoz',
  ciscenje: 'Čišćenje',
  odrzavanje: 'Održavanje',
  provera_lokacije: 'Provera lokacije',
};

export const REPORT_SIZE_LABEL: Record<ReportSize, string> = {
  mala: 'Mala',
  srednja: 'Srednja',
  velika: 'Velika',
};

/**
 * Podkategorije predloga. Nisu ukras: `opasan_otpad` i `uginula_zivotinja` ne
 * idu ni na jednu gradsku ekipu, a `van_nadleznosti` se prosleđuje drugoj
 * službi umesto da se prijava odbije i nestane.
 */
export const SUBCATEGORY_LABEL: Record<ReportSubcategory, string> = {
  komunalni_otpad: 'Komunalni otpad',
  gradjevinski_sut: 'Građevinski šut',
  kabasti_otpad: 'Kabasti otpad',
  opasan_otpad: 'Opasan otpad',
  zeleni_otpad: 'Zeleni otpad',
  uginula_zivotinja: 'Uginula životinja',
  paljenje_otpada: 'Paljenje otpada',
  van_nadleznosti: 'Van nadležnosti JKP',
  nepoznato: 'Nepoznato',
};

export const CLASSIFICATION_SOURCE_LABEL: Record<ClassificationSource, string> = {
  model: 'AI model',
  pravila: 'Ključne reči',
};

export const CLASSIFICATION_OUTCOME_LABEL: Record<ClassificationOutcome, string> = {
  prihvacena: 'Dispečer prihvatio predlog',
  izmenjena: 'Dispečer izmenio predlog',
  odbacena: 'Prijava zatvorena bez obrade',
};

/** Akcije iz `prijava_istorija` — čitaju ih i građanin i operativa. */
export const REPORT_HISTORY_LABEL: Record<ReportHistoryEntry['akcija'], string> = {
  kreirana: 'Prijava primljena',
  potvrdjena: 'Potvrđena',
  odbijena: 'Odbijena',
  duplikat: 'Označena kao duplikat',
  resena: 'Rešena',
};

export const STAFF_ROLE_LABEL: Record<Staff['uloga'], string> = {
  admin: 'Administrator',
  dispecer: 'Dispečer',
  vozac: 'Vozač',
};

/** Kratko, jer stoji u gustom redu tabele. */
export const REPORT_CHANNEL_LABEL: Record<ReportChannel, string> = {
  sms: 'SMS',
  viber: 'Viber',
  web: 'Sajt',
  mobilna: 'Aplikacija',
  telefon: 'Telefon',
  posrednik: 'Preko MZ',
};

export const LOCATION_PRECISION_LABEL: Record<LocationPrecision, string> = {
  gps: 'GPS iz uređaja',
  opisana: 'Po opisu lokacije',
  naselje: 'Centroid naselja',
};

export const STOP_REASON_LABEL: Record<StopReason, string> = {
  predvidjeno_prelivanje: 'Predviđeno prelivanje',
  prijava_gradjana: 'Prijava građana',
  rizik_deponije: 'Rizik od divlje deponije',
  redovan_obilazak: 'Redovan obilazak',
};

export const TRUCK_STATUS_LABEL: Record<TruckStatus, string> = {
  na_terenu: 'Na terenu',
  u_bazi: 'U bazi',
  servis: 'Na servisu',
};

export const HOTSPOT_STATUS_LABEL: Record<HotspotStatus, string> = {
  aktivna: 'Aktivna',
  prijavljeno: 'Prijavljeno',
  ocisceno: 'Očišćeno',
  u_sanaciji: 'U sanaciji',
  evidentirana: 'Evidentirana',
};

export const SEASONAL_EVENT_LABEL: Record<SeasonalEventKind, string> = {
  vikend: 'Vikend',
  praznik: 'Praznik',
  slava: 'Slava',
  vasar: 'Vašar',
  berba: 'Berba',
  drugo: 'Događaj',
};

export const DISPOSAL_SITE_LABEL: Record<DisposalSiteType, string> = {
  reciklazno_dvoriste: 'Reciklažno dvorište',
  staklo: 'Staklo',
  plastika: 'Plastika i PET',
  papir: 'Papir i karton',
  kabasti: 'Kabasti otpad',
  elektronski: 'Elektronski otpad',
  baterije: 'Baterije i lekovi',
  gume: 'Gume',
  zeleni: 'Zeleni otpad',
};

export const NEWS_CATEGORY_LABEL: Record<NewsCategory, string> = {
  obavestenje: 'Obaveštenje',
  akcija: 'Akcija čišćenja',
  raspored: 'Raspored odvoza',
  edukacija: 'Edukacija',
};

/** Vrsta stvarnog mesta na mapi (iz baze). */
export const MAP_SITE_LABEL: Record<MapSiteType, string> = {
  deponija: 'Deponija',
  otkup_sirovina: 'Otkup sirovina',
  reciklazno_dvoriste: 'Reciklažno dvorište',
};

/** Materijal iz pretrage — isti rečnik u kom mesta i sakupljači kažu šta primaju. */
export const WASTE_MATERIAL_LABEL: Record<WasteMaterial, string> = {
  staklo: 'Staklo',
  plastika: 'Plastika i PET',
  papir: 'Papir i karton',
  kabasti: 'Kabasti otpad',
  elektronski: 'Elektronski otpad',
  baterije: 'Baterije i lekovi',
  gume: 'Gume',
  zeleni: 'Zeleni otpad',
  metal: 'Metal i staro gvožđe',
  iverica: 'Iverica i nameštaj od ploča',
  drvo: 'Drvo',
  tekstil: 'Tekstil i obuća',
  gradjevinski: 'Građevinski otpad',
};

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  1: 'ponedeljak',
  2: 'utorak',
  3: 'sreda',
  4: 'četvrtak',
  5: 'petak',
  6: 'subota',
  7: 'nedelja',
};

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  1: 'pon',
  2: 'uto',
  3: 'sre',
  4: 'čet',
  5: 'pet',
  6: 'sub',
  7: 'ned',
};

export const BADGE_LABEL: Record<BadgeKind, { title: string; hint: string }> = {
  prva_prijava: { title: 'Prva prijava', hint: 'Prva potvrđena prijava' },
  oko_sokolovo: { title: 'Oko sokolovo', hint: 'Pet potvrđenih prijava' },
  akcija_ciscenja: { title: 'Čistač', hint: 'Učešće u akciji čišćenja' },
  razvrstavanje: { title: 'Razvrstavač', hint: 'Mesec dana pravilnog razvrstavanja' },
  komsija: { title: 'Dobar komšija', hint: 'Prijava u ime suseda bez telefona' },
};
