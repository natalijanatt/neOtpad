import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { sql } from 'kysely';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DATABASE, type Database } from '../src/database/database.module';
import { hashPassword } from '../src/auth/password';
import { toPoint } from '../src/common/geo';
import { DeponijeImportRepository } from '../src/deponije/import/deponije-import.repository';

jest.setTimeout(30000);

const settlement = 'aaaaaaaa-0002-4000-8000-000000000002';

/**
 * These tests share one database, and matching is spatial, so each case gets its
 * own spot around Krupac — 445 m apart, comfortably past the 200 m that counts as
 * the same pile. Two cases on one coordinate would match each other's sites and
 * fail for a reason that has nothing to do with what they assert.
 */
const mesto = (n: number) => ({ lat: 43.116004 + n * 0.004, lon: 22.675066 });

/**
 * The dump register has two writers — the CSV import and a confirmed citizen
 * report — and they share `app.deponija_opservacija`. What is verified here is
 * the boundary between them and the rule that a report which stops being a dump
 * stops being in the register (`docs/data-sources.md`).
 */
describe('dump register against PostgreSQL', () => {
  let app: INestApplication;
  let database: Database;
  let imports: DeponijeImportRepository;
  let token: string;

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.startsWith('/reports_test_')) {
      throw new Error('Use npm run test:integration to create an isolated database');
    }
    app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    database = app.get(DATABASE);
    imports = app.get(DeponijeImportRepository, { strict: false });
    await database.insertInto('app.korisnik').values({
      email: 'registar@example.test', ime: 'Registry dispatcher', uloga: 'dispecer',
      lozinka_hash: await hashPassword('example-staff-password'),
    }).execute();
    const login = await request(app.getHttpServer()).post('/auth/login')
      .send({ email: 'registar@example.test', password: 'example-staff-password' }).expect(200);
    token = login.body.accessToken as string;
  });

  beforeEach(async () => { await database.deleteFrom('app.api_limit').execute(); });
  afterAll(async () => { if (app) await app.close(); });

  async function create(body: object): Promise<string> {
    const receipt = await request(app.getHttpServer()).post('/reports')
      .set('Idempotency-Key', randomUUID()).send(body).expect(201);
    const row = await database.selectFrom('app.prijava').select('id')
      .where('kratki_kod', '=', receipt.body.kratki_kod as string).executeTakeFirstOrThrow();
    return row.id;
  }

  function triage(id: string, body: object) {
    return request(app.getHttpServer()).post(`/reports/${id}/triage`).auth(token, { type: 'bearer' }).send(body);
  }

  function observations(prijavaId: string) {
    return database.selectFrom('app.deponija_opservacija')
      .select(['kanonska_id', 'tip_dogadjaja', 'godina', 'izvor'])
      .where('prijava_id', '=', prijavaId).orderBy('tip_dogadjaja').execute();
  }

  /** How many sites exist that a report opened, across every test so far. */
  async function openedSites(): Promise<number> {
    const rows = await database.selectFrom('app.deponija_kanonska').select('id')
      .where(sql<boolean>`izvori = array['PRIJAVA']::text[]`).execute();
    return rows.length;
  }

  /** A registry site as the import writes one: surveyed point, CSV provenance. */
  async function registrySite(kanonskiId: string, tacka: { lat: number; lon: number }) {
    const row = await database.insertInto('app.deponija_kanonska').values({
      kanonski_id: kanonskiId, naselje_id: settlement, geo_preciznost: 'registarska_tacka',
      izvori: ['SEPA/NRIZ'],
      tacka: toPoint(tacka),
    }).returning('id').executeTakeFirstOrThrow();
    return row.id;
  }

  it('files a confirmed dump report against the registry site it is standing on', async () => {
    const site = await registrySite('K-IT1', mesto(0));
    const id = await create({ tip: 'divlja_deponija', tacka: mesto(0), naselje_id: settlement });
    const before = await openedSites();

    const confirmed = await triage(id, { verzija: 1, odluka: 'potvrdjena', tip_obrade: 'ciscenje', razlog: 'Potvrdjena deponija' }).expect(200);

    expect(confirmed.body.kanonska_id).toBe(site);
    expect(await observations(id)).toEqual([
      { kanonska_id: site, tip_dogadjaja: 'prijava', godina: new Date().getUTCFullYear(), izvor: 'PRIJAVA' },
    ]);
    // Nothing new was opened: the register would otherwise grow a duplicate of
    // every dump it already knows about.
    expect(await openedSites()).toBe(before);
  });

  it('opens a site when nothing in the register is near enough', async () => {
    const id = await create({ tip: 'divlja_deponija', tacka: mesto(1), naselje_id: settlement });

    const confirmed = await triage(id, { verzija: 1, odluka: 'potvrdjena', tip_obrade: 'ciscenje', razlog: 'Nova deponija' }).expect(200);

    const site = await database.selectFrom('app.deponija_kanonska').selectAll()
      .where('id', '=', confirmed.body.kanonska_id as string).executeTakeFirstOrThrow();
    expect(site.kanonski_id).toMatch(/^P-\d{4}$/);
    expect(site.geo_preciznost).toBe('geokodirano');
    expect(site.izvori).toEqual(['PRIJAVA']);
    // The counters the import owns stay untouched, so the next import run has
    // nothing of ours to reset.
    expect(site.broj_opservacija).toBe(0);
    expect(site.broj_izvornih_redova).toBe(0);
  });

  it('registers an SMS report with no coordinate rather than inventing one', async () => {
    const id = await create({ tip: 'divlja_deponija', naselje_id: settlement });

    // `provera_lokacije` is the only response the rules allow without a
    // location, and it is exactly what a dispatcher picks here.
    const confirmed = await triage(id, { verzija: 1, odluka: 'potvrdjena', tip_obrade: 'provera_lokacije', razlog: 'Prijava bez koordinate' }).expect(200);

    const site = await database.selectFrom('app.deponija_kanonska').selectAll()
      .where('id', '=', confirmed.body.kanonska_id as string).executeTakeFirstOrThrow();
    expect(site.geo_preciznost).toBe('nepoznato');
    expect(site.tacka).toBeNull();
    expect(site.naselje_id).toBe(settlement);
  });

  it('moves the report onto the registry site once the location is verified', async () => {
    const site = await registrySite('K-IT2', mesto(2));
    const id = await create({ tip: 'divlja_deponija', naselje_id: settlement });
    const first = await triage(id, { verzija: 1, odluka: 'potvrdjena', tip_obrade: 'provera_lokacije', razlog: 'Bez koordinate' }).expect(200);
    const opened = first.body.kanonska_id as string;

    const second = await triage(id, { verzija: 2, odluka: 'potvrdjena', tip_obrade: 'ciscenje', tacka: mesto(2), razlog: 'Lokacija proverena' }).expect(200);

    expect(second.body.kanonska_id).toBe(site);
    expect((await observations(id)).map((row) => row.kanonska_id)).toEqual([site]);
    // The placeholder site the first confirmation opened is gone: one pile, one
    // record.
    const orphan = await database.selectFrom('app.deponija_kanonska').select('id').where('id', '=', opened).executeTakeFirst();
    expect(orphan).toBeUndefined();
  });

  it('takes a report out of the register when it turns out not to be a dump', async () => {
    const id = await create({ tip: 'divlja_deponija', tacka: mesto(3), naselje_id: settlement });
    const first = await triage(id, { verzija: 1, odluka: 'potvrdjena', tip_obrade: 'ciscenje', razlog: 'Deponija' }).expect(200);
    const opened = first.body.kanonska_id as string;

    // Still `ciscenje`, because `odvoz` would need a container: what changed is
    // what the problem is, not who goes out.
    const corrected = await triage(id, { verzija: 2, odluka: 'potvrdjena', tip: 'prelivanje', tip_obrade: 'ciscenje', razlog: 'Ipak prelivanje kontejnera' }).expect(200);

    expect(corrected.body.kanonska_id).toBeNull();
    expect(await observations(id)).toEqual([]);
    const orphan = await database.selectFrom('app.deponija_kanonska').select('id').where('id', '=', opened).executeTakeFirst();
    expect(orphan).toBeUndefined();
  });

  it('records the clean-up as its own event, which is what recurrence is read from', async () => {
    const id = await create({ tip: 'divlja_deponija', tacka: mesto(4), naselje_id: settlement });
    await triage(id, { verzija: 1, odluka: 'potvrdjena', tip_obrade: 'ciscenje', razlog: 'Deponija' }).expect(200);

    await request(app.getHttpServer()).post(`/reports/${id}/resolve`).auth(token, { type: 'bearer' })
      .send({ verzija: 2, razlog: 'Ocisceno' }).expect(200);

    expect((await observations(id)).map((row) => row.tip_dogadjaja)).toEqual(['prijava', 'sanacija']);
  });

  it('counts citizen reports separately from what the import owns', async () => {
    const id = await create({ tip: 'divlja_deponija', tacka: mesto(5), naselje_id: settlement });
    const confirmed = await triage(id, { verzija: 1, odluka: 'potvrdjena', tip_obrade: 'ciscenje', razlog: 'Deponija' }).expect(200);

    const page = await request(app.getHttpServer()).get('/dumps').query({ naselje_id: settlement, limit: 500 })
      .auth(token, { type: 'bearer' }).expect(200);

    const dump = page.body.items.find((item: { id: string }) => item.id === confirmed.body.kanonska_id);
    expect(dump.broj_prijava).toBe(1);
    expect(dump.broj_opservacija).toBe(0);
    expect(dump.aktivna).toBe(true);
  });

  it('leaves a report observation alone when the import replaces its own', async () => {
    const site = await registrySite('K-IT3', mesto(6));
    const id = await create({ tip: 'divlja_deponija', tacka: mesto(6), naselje_id: settlement });
    await triage(id, { verzija: 1, odluka: 'potvrdjena', tip_obrade: 'ciscenje', razlog: 'Deponija' }).expect(200);
    // Both hang off the canonical site with no location of their own, which is
    // the only shape the import's second delete branch can reach.
    const fromImport = await database.insertInto('app.deponija_opservacija')
      .values({ kanonska_id: site, godina: 2021, tip_dogadjaja: 'godisnja_evidencija', izvor: 'SEPA/NRIZ' })
      .returning('id').executeTakeFirstOrThrow();

    const deleted = await imports.deleteOpservacijeFor([], [site]);

    expect(deleted).toBe(1);
    const survivors = await database.selectFrom('app.deponija_opservacija').select(['id', 'prijava_id'])
      .where('kanonska_id', '=', site).execute();
    expect(survivors.map((row) => row.prijava_id)).toEqual([id]);
    expect(survivors.map((row) => row.id)).not.toContain(fromImport.id);
  });

  it('keeps the citizen-report series as its own comparability group', async () => {
    // A count of reports added to a count of registry entries is the mistake
    // `izvorna_serija` exists to prevent (`docs/data-sources.md`).
    const series = await database.selectFrom('app.izvorna_serija')
      .select(['izvor', 'godina_do']).where('grupa_uporedivosti', '=', 'prijave-sistem').execute();
    expect(series).toHaveLength(1);
    expect(series[0].izvor).toBe('PRIJAVA');
    expect(series[0].godina_do).toBeGreaterThanOrEqual(new Date().getUTCFullYear());
  });
});
