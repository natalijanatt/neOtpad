import { Inject, Injectable } from '@nestjs/common';
import { sql, type Insertable, type Kysely, type Transaction, type Updateable } from 'kysely';
import { DATABASE, type Database } from '../database/database.module';
import type { AppGeoPreciznost, AppIshodKlasifikacije, DB, Json } from '../database/generated/schema';
import { toPoint, type Tacka } from '../common/geo';
import type { ReportQueryDto, ReportResponseDto } from './dto/reports.dto';

/**
 * How close a report has to be to a registry dump to be the same dump. Dumps are
 * area features and registry points sit at mixed precision, so this matches the
 * radius the classifier already reasons with rather than inventing a second one.
 */
const RADIJUS_DEPONIJE_M = 200;

/**
 * A canonical site whose only source is a citizen report, and therefore the only
 * kind this module may rewrite or delete. Written as SQL because the column is a
 * `text[]` and the comparison is against the whole array, not a membership test.
 */
const SAMO_IZ_PRIJAVE = sql<boolean>`izvori = array['PRIJAVA']::text[]`;

type Executor = Kysely<DB> | Transaction<DB>;
export type ReportInsert = Omit<Insertable<DB['app.prijava']>, 'tacka'> & { tacka: Tacka | null };
export type ReportUpdate = Omit<Updateable<DB['app.prijava']>, 'tacka'> & { tacka?: Tacka | null };
export type PhotoInsert = Insertable<DB['app.prijava_foto']>;

@Injectable()
export class ReportsRepository {
  constructor(@Inject(DATABASE) private readonly db: Executor) {}

  withTransaction<Result>(work: (repository: ReportsRepository) => Promise<Result>): Promise<Result> {
    return (this.db as Database).transaction().execute((transaction) => work(new ReportsRepository(transaction)));
  }

  async lockSubmission(scope: string, key: string): Promise<void> {
    await sql`select pg_advisory_xact_lock(hashtextextended(${`${scope}:${key}`}, 0))`.execute(this.db);
  }

  async lockTriage(): Promise<void> {
    await sql`select pg_advisory_xact_lock(7261, 1)`.execute(this.db);
  }

  findRequest(scope: string, key: string) {
    return this.db.selectFrom('app.prijava_zahtev').innerJoin('app.prijava', 'app.prijava.id', 'app.prijava_zahtev.prijava_id')
      .select(['sadrzaj_hash', 'kratki_kod', 'primljena_at']).where('opseg', '=', scope).where('kljuc', '=', key).executeTakeFirst();
  }

  async saveRequest(scope: string, key: string, hash: string, id: string): Promise<void> {
    await this.db.insertInto('app.prijava_zahtev').values({ opseg: scope, kljuc: key, sadrzaj_hash: hash, prijava_id: id }).execute();
  }

  findSettlement(id: string) {
    return this.db.selectFrom('app.naselje').select('id').where('id', '=', id).executeTakeFirst();
  }

  findContainer(id: string) {
    return this.db.selectFrom('app.kontejner as container').innerJoin('app.sabirno_mesto as site', 'site.id', 'container.sabirno_mesto_id')
      .select(['container.id', 'site.naselje_id']).where('container.id', '=', id)
      .where('container.status', '=', 'aktivan').where('container.uklonjen_datum', 'is', null)
      .where('site.aktivno_od', '<=', sql<Date>`current_date`)
      .where((expression) => expression.or([expression('site.aktivno_do', 'is', null), expression('site.aktivno_do', '>', sql<Date>`current_date`)]))
      .executeTakeFirst();
  }

  findIntermediary(id: string) {
    return this.db.selectFrom('app.posrednik').select('id').where('id', '=', id).where('aktivan', '=', true).executeTakeFirst();
  }

  insert(values: ReportInsert) {
    return this.db.insertInto('app.prijava').values({ ...values, tacka: toPoint(values.tacka) })
      .onConflict((conflict) => conflict.column('kratki_kod').doNothing()).returningAll().executeTakeFirst();
  }

  find(id: string) {
    return this.db.selectFrom('app.prijava').selectAll().where('id', '=', id).executeTakeFirst();
  }

  hasDuplicates(id: string) {
    return this.db.selectFrom('app.prijava').select('id').where('duplikat_od', '=', id).executeTakeFirst();
  }

  update(id: string, version: number, values: ReportUpdate, timestamp?: 'confirm' | 'resolve') {
    const { tacka, ...rest } = values;
    return this.db.updateTable('app.prijava').set({
      ...rest,
      ...(tacka === undefined ? {} : { tacka: toPoint(tacka) }),
      ...(timestamp === 'confirm' ? { potvrdjena_at: sql<Date>`coalesce(potvrdjena_at, clock_timestamp())` } : {}),
      ...(timestamp === 'resolve' ? { resena_at: sql<Date>`clock_timestamp()` } : {}),
      verzija: version + 1,
      azurirana_at: sql<Date>`clock_timestamp()`,
    })
      .where('id', '=', id).where('verzija', '=', version).returningAll().executeTakeFirst();
  }

  async appendHistory(report: ReportResponseDto, previous: ReportResponseDto | null, actor: string | null, action: string, reason: string | null): Promise<void> {
    await this.db.insertInto('app.prijava_istorija').values({
      prijava_id: report.id, korisnik_id: actor, akcija: action, razlog: reason, verzija: report.verzija,
      prethodno: previous === null ? null : JSON.parse(JSON.stringify(previous)) as Json,
      novo: JSON.parse(JSON.stringify(report)) as Json,
    }).execute();
  }

  history(id: string) {
    return this.db.selectFrom('app.prijava_istorija').selectAll().where('prijava_id', '=', id).orderBy('verzija', 'asc').execute();
  }

  insertPhoto(values: PhotoInsert) {
    return this.db.insertInto('app.prijava_foto').values(values).returningAll().executeTakeFirstOrThrow();
  }

  /**
   * Attaches staged photos to a report and returns the ones actually taken.
   *
   * Every rule lives in the where clause on purpose. `prijava_id is null` makes
   * a photo single-use, so a leaked identifier cannot be replayed onto a second
   * report; `istice_at > now()` refuses an expired upload even before the
   * cleanup sweep has removed it. The caller compares the returned count with
   * what it asked for and fails the whole submission if they differ — a report
   * that silently drops the photograph the citizen sent is worse than one that
   * is refused.
   */
  async claimPhotos(ids: string[], prijavaId: string): Promise<string[]> {
    if (ids.length === 0) return [];
    const claimed = await this.db.updateTable('app.prijava_foto')
      .set({ prijava_id: prijavaId, istice_at: null })
      .where('id', 'in', ids)
      .where('prijava_id', 'is', null)
      .where('istice_at', '>', sql<Date>`now()`)
      .returning('id')
      .execute();
    return claimed.map((row) => row.id);
  }

  photosFor(prijavaIds: string[]) {
    if (prijavaIds.length === 0) return Promise.resolve([]);
    return this.db.selectFrom('app.prijava_foto').selectAll()
      .where('prijava_id', 'in', prijavaIds)
      .orderBy('otpremljena_at', 'asc').orderBy('id', 'asc').execute();
  }

  findPhoto(id: string, prijavaId: string) {
    return this.db.selectFrom('app.prijava_foto').selectAll()
      .where('id', '=', id).where('prijava_id', '=', prijavaId).executeTakeFirst();
  }

  async deletePhoto(id: string): Promise<void> {
    await this.db.deleteFrom('app.prijava_foto').where('id', '=', id).execute();
  }

  /** Cleanup sweep: unclaimed uploads whose deadline has passed. */
  expiredPhotos(limit: number) {
    return this.db.selectFrom('app.prijava_foto').select(['id', 'kljuc'])
      .where('prijava_id', 'is', null).where('istice_at', '<=', sql<Date>`now()`)
      .limit(limit).execute();
  }

  /**
   * Outbox: queues the report for automatic classification.
   *
   * Written inside the report's own transaction so a submission and its queue
   * row commit together - a report that is never classified and a classification
   * of a report that was rolled back are both bugs a separate call would allow.
   * The table belongs to the classification module, which owns every other
   * query against it; these two writes live here because this is where the
   * transaction is (`docs/report-classification.md`).
   */
  async enqueueClassification(prijavaId: string, verzija: number): Promise<void> {
    await this.db.insertInto('app.prijava_klasifikacija')
      .values({ prijava_id: prijavaId, prijava_verzija: verzija, status: 'na_cekanju' })
      .onConflict((conflict) => conflict.columns(['prijava_id', 'prijava_verzija']).doNothing())
      .execute();
  }

  /** The proposal a dispatcher was looking at when they triaged this version. */
  findClassification(prijavaId: string, verzija: number) {
    return this.db.selectFrom('app.prijava_klasifikacija')
      .select(['id', 'predlozeni_tip', 'predlozeni_tip_obrade'])
      .where('prijava_id', '=', prijavaId).where('prijava_verzija', '=', verzija)
      .where('status', '=', 'uspesna').executeTakeFirst();
  }

  /**
   * Records whether the dispatcher agreed, and retires anything still queued.
   *
   * This is the entire evaluation set: a proposal beside the decision a human
   * made independently, labelled at the moment the human made it.
   */
  async settleClassification(id: string, ishod: AppIshodKlasifikacije): Promise<void> {
    await this.db.updateTable('app.prijava_klasifikacija').set({ ishod }).where('id', '=', id).execute();
  }

  async staleClassifications(prijavaId: string, verzija: number): Promise<void> {
    await this.db.updateTable('app.prijava_klasifikacija')
      .set({ status: 'zastarela', obradjena_at: sql<Date>`clock_timestamp()` })
      .where('prijava_id', '=', prijavaId).where('prijava_verzija', '<=', verzija)
      .where('status', '=', 'na_cekanju').execute();
  }

  /** Newest proposal per report, for the queue and the detail view. */
  classificationsFor(prijavaIds: string[]) {
    if (prijavaIds.length === 0) return Promise.resolve([]);
    return this.db.selectFrom('app.prijava_klasifikacija')
      .distinctOn('prijava_id').selectAll()
      .where('prijava_id', 'in', prijavaIds)
      .orderBy('prijava_id').orderBy('prijava_verzija', 'desc').execute();
  }

  /**
   * The nearest registry dump this report could be describing.
   *
   * 200 m, the same radius the classifier already uses for these: a dump is an
   * area feature, and past that "the pile over there" is another pile. Rows whose
   * precision is `centroid_naselja` are excluded, because that coordinate is the
   * centre of a village rather than a dump, and matching against it would attach
   * every report near a village centre to the same site (`docs/data-sources.md`).
   */
  najblizaKanonska(tacka: Tacka | null) {
    const point = toPoint(tacka);
    if (point === null) return Promise.resolve(undefined);
    return this.db.selectFrom('app.deponija_kanonska')
      .select(['id', sql<number>`round(extensions.st_distance(tacka, ${point}))::int`.as('rastojanje_m')])
      .where('tacka', 'is not', null)
      .where('geo_preciznost', 'in', ['registarska_tacka', 'geokodirano'])
      .where(sql<boolean>`extensions.st_dwithin(tacka, ${point}, ${RADIJUS_DEPONIJE_M})`)
      .orderBy('rastojanje_m').limit(1).executeTakeFirst();
  }

  /**
   * Opens a canonical site for a report that matched none.
   *
   * The identifier comes from a sequence inside the insert rather than from a
   * count read first: two dispatchers confirming at the same moment would
   * otherwise be handed the same `P-nnnn`, and the column is unique.
   */
  insertKanonskaIzPrijave(values: Omit<Insertable<DB['app.deponija_kanonska']>, 'kanonski_id' | 'tacka'> & { tacka: Tacka | null }) {
    const { tacka, ...rest } = values;
    return this.db.insertInto('app.deponija_kanonska').values({
      ...rest,
      kanonski_id: sql<string>`'P-' || lpad(nextval('app.deponija_prijava_seq')::text, 4, '0')`,
      tacka: toPoint(tacka),
    }).returning('id').executeTakeFirstOrThrow();
  }

  /**
   * Moves a report-opened site onto what the dispatcher has since established.
   *
   * The common case is a report confirmed as `provera_lokacije` from an SMS with
   * no coordinate, which opens a site with none either; when the location is
   * verified the site has to follow. Guarded on `izvori = ['PRIJAVA']`, so a
   * registry row can never be rewritten from a report.
   */
  async refreshKanonskaIzPrijave(
    id: string,
    values: { naselje_id: string | null; tacka: Tacka | null; geo_preciznost: AppGeoPreciznost },
  ): Promise<void> {
    await this.db.updateTable('app.deponija_kanonska')
      .set({ naselje_id: values.naselje_id, tacka: toPoint(values.tacka), geo_preciznost: values.geo_preciznost })
      .where('id', '=', id).where(SAMO_IZ_PRIJAVE).execute();
  }

  /**
   * One observation per report and event type. Re-triaging a report rewrites its
   * row: the same pile counted twice would be read as a site that recurs.
   */
  async upsertOpservacijaPrijave(
    prijavaId: string,
    kanonskaId: string,
    values: Omit<Insertable<DB['app.deponija_opservacija']>, 'prijava_id' | 'kanonska_id' | 'tacka'> & { tacka: Tacka | null },
  ): Promise<void> {
    const { tacka, ...rest } = values;
    const row = { ...rest, prijava_id: prijavaId, kanonska_id: kanonskaId, tacka: toPoint(tacka) };
    await this.db.insertInto('app.deponija_opservacija').values(row)
      .onConflict((conflict) => conflict.columns(['prijava_id', 'tip_dogadjaja'])
        .where('prijava_id', 'is not', null)
        .doUpdateSet(row))
      .execute();
  }

  /** Everything this report put in the register, and the sites it touched. */
  async deleteOpservacijePrijave(prijavaId: string): Promise<string[]> {
    const removed = await this.db.deleteFrom('app.deponija_opservacija')
      .where('prijava_id', '=', prijavaId).returning('kanonska_id').execute();
    return removed.map((row) => row.kanonska_id).filter((id): id is string => id !== null);
  }

  /**
   * Drops a site that a report opened and then left empty — a report corrected to
   * `prelivanje`, rejected, or marked duplicate must not leave an invented dump
   * on a public map.
   *
   * Three conditions, all of them load-bearing: only a site whose sole source is
   * `PRIJAVA`, only one with no `deponija_lokacija` under it, and only one with
   * no observations left. A row that came from a CSV cannot be reached by this
   * delete even if it is passed here by mistake.
   */
  async deleteSirocePrijave(kanonskaId: string): Promise<void> {
    await this.db.deleteFrom('app.deponija_kanonska')
      .where('id', '=', kanonskaId)
      .where(SAMO_IZ_PRIJAVE)
      .where((eb) => eb.not(eb.exists(
        eb.selectFrom('app.deponija_lokacija').select('id').whereRef('kanonska_id', '=', 'app.deponija_kanonska.id'),
      )))
      .where((eb) => eb.not(eb.exists(
        eb.selectFrom('app.deponija_opservacija').select('id').whereRef('kanonska_id', '=', 'app.deponija_kanonska.id'),
      )))
      .execute();
  }

  /**
   * Keeps the comparability group's range honest as reports keep arriving. A
   * series that claims to end in 2026 while holding 2027 observations is the
   * kind of small lie that makes the whole table stop being consulted.
   */
  async extendSerijaPrijava(godina: number): Promise<void> {
    await this.db.updateTable('app.izvorna_serija')
      .set({ godina_do: sql<number>`greatest(godina_do, ${godina})` })
      .where('grupa_uporedivosti', '=', 'prijave-sistem').execute();
  }

  list(query: ReportQueryDto) {
    let select = this.db.selectFrom('app.prijava').selectAll();
    if (query.status) select = select.where('status', '=', query.status);
    if (query.tip) select = select.where('tip', '=', query.tip);
    if (query.kanal) select = select.where('kanal', '=', query.kanal);
    if (query.naselje_id) select = select.where('naselje_id', '=', query.naselje_id);
    if (query.kratki_kod) select = select.where('kratki_kod', '=', query.kratki_kod);
    return select.orderBy('primljena_at', 'desc').orderBy('id', 'desc')
      .offset((query.page - 1) * query.limit).limit(query.limit + 1).execute();
  }
}
