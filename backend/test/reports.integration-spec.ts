import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { sql } from 'kysely';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DATABASE, type Database } from '../src/database/database.module';
import { hashPassword } from '../src/auth/password';
import { ReportsService } from '../src/reports/reports.service';
import { ReportsRepository } from '../src/reports/reports.repository';
import { RateLimitService } from '../src/auth/rate-limit';

jest.setTimeout(30000);

const settlement = 'aaaaaaaa-0002-4000-8000-000000000002';
const otherSettlement = 'aaaaaaaa-0003-4000-8000-000000000003';
const container = 'cccccccc-0001-4000-8000-000000000001';
const report = { tip: 'prelivanje', naselje_id: settlement, opis_lokacije: 'Kod osnovne skole' };

describe('reports workflow against PostgreSQL', () => {
  let app: INestApplication;
  let database: Database;
  let token: string;
  let driverToken: string;
  let staffId: string;
  let intermediary: string;

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.startsWith('/reports_test_')) {
      throw new Error('Use npm run test:integration to create an isolated database');
    }
    app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    database = app.get(DATABASE);
    const password = await hashPassword('example-staff-password');
    const staff = await database.insertInto('app.korisnik').values({ email: 'dispatcher@example.test', ime: 'Dispatcher', uloga: 'dispecer', lozinka_hash: password }).returning('id').executeTakeFirstOrThrow();
    staffId = staff.id;
    const driver = await database.insertInto('app.korisnik').values({ email: 'driver@example.test', ime: 'Driver', uloga: 'vozac', lozinka_hash: password }).returning('id').executeTakeFirstOrThrow();
    const middleman = await database.insertInto('app.posrednik').values({ ime: 'Community president', uloga: 'predsednik_mz', telefon_e164: '+381601234567' }).returning('id').executeTakeFirstOrThrow();
    intermediary = middleman.id;
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email: 'DISPATCHER@example.test', password: 'example-staff-password' }).expect(200);
    token = login.body.accessToken as string;
    driverToken = await app.get(JwtService).signAsync({ sub: driver.id });
  });

  beforeEach(async () => {
    await database.deleteFrom('app.api_limit').execute();
  });

  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => { if (app) await app.close(); });

  function publicCreate(body: object = report, key: string = randomUUID()) {
    return request(app.getHttpServer()).post('/reports').set('Idempotency-Key', key).send(body);
  }

  async function create(body: object = report): Promise<string> {
    const receipt = await publicCreate(body).expect(201);
    const row = await database.selectFrom('app.prijava').select('id').where('kratki_kod', '=', receipt.body.kratki_kod as string).executeTakeFirstOrThrow();
    return row.id;
  }

  function triage(id: string, body: object) {
    return request(app.getHttpServer()).post(`/reports/${id}/triage`).auth(token, { type: 'bearer' }).send(body);
  }

  it('completes telephone report, location verification, collection confirmation and resolution', async () => {
    const receipt = await request(app.getHttpServer()).post('/reports/assisted').auth(token, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID()).send({ ...report, kanal: 'telefon' }).expect(201);
    expect(Object.keys(receipt.body).sort()).toEqual(['kratki_kod', 'primljena_at', 'status']);
    const queue = await request(app.getHttpServer()).get('/reports').query({ kratki_kod: receipt.body.kratki_kod, kanal: 'telefon', status: 'nova' }).auth(token, { type: 'bearer' }).expect(200);
    const id = queue.body.items[0].id as string;
    await triage(id, { verzija: 1, odluka: 'potvrdjena', tip_obrade: 'provera_lokacije', razlog: 'Potrebna potvrda lokacije' }).expect(200);
    await request(app.getHttpServer()).post(`/reports/${id}/resolve`).auth(token, { type: 'bearer' }).send({ verzija: 2, razlog: 'Samo provera lokacije' }).expect(409);
    const confirmed = await triage(id, { verzija: 2, odluka: 'potvrdjena', tip_obrade: 'odvoz', kontejner_id: container, razlog: 'Provereno kod skole' }).expect(200);
    expect(confirmed.body.verzija).toBe(3);
    const resolved = await request(app.getHttpServer()).post(`/reports/${id}/resolve`).auth(token, { type: 'bearer' }).send({ verzija: 3, razlog: 'Kontejner ispraznjen' }).expect(200);
    expect(resolved.body.status).toBe('resena');
    const detail = await request(app.getHttpServer()).get(`/reports/${id}`).auth(token, { type: 'bearer' }).expect(200);
    expect(detail.body.istorija.map((entry: { akcija: string }) => entry.akcija)).toEqual(['kreirana', 'potvrdjena', 'potvrdjena', 'resena']);
    expect(detail.body.istorija.every((entry: { korisnik_id: string }) => entry.korisnik_id === staffId)).toBe(true);
    expect(detail.body.istorija[1].prethodno.status).toBe('nova');
    expect(detail.body.istorija[3].novo.status).toBe('resena');
    await triage(id, { verzija: 4, odluka: 'odbijena', razlog: 'Cannot reopen closed report' }).expect(409);
  });

  it('accepts anonymous settlement-only reports and preserves missing coordinates', async () => {
    const id = await create({ tip: 'divlja_deponija', naselje_id: settlement });
    const detail = await request(app.getHttpServer()).get(`/reports/${id}`).auth(token, { type: 'bearer' }).expect(200);
    expect(detail.body.tacka).toBeNull();
    expect(detail.body.preciznost_lokacije).toBe('naselje');
    expect(detail.body.istorija[0].korisnik_id).toBeNull();
    expect(detail.body).not.toHaveProperty('gradjanin_id');
    await triage(id, { verzija: 1, odluka: 'potvrdjena', tip_obrade: 'ciscenje', razlog: 'Insufficient location' }).expect(400);
  });

  it('derives settlement from a container and preserves supplied coordinates', async () => {
    const id = await create({ tip: 'pun_kontejner', kontejner_id: container, tacka: { lat: 43.116004, lon: 22.675066 } });
    const detail = await request(app.getHttpServer()).get(`/reports/${id}`).auth(token, { type: 'bearer' }).expect(200);
    expect(detail.body.naselje_id).toBe(settlement);
    expect(detail.body.tacka).toEqual({ lat: 43.116004, lon: 22.675066 });
  });

  it.each([
    { tip: 'prelivanje' },
    { ...report, naselje_id: randomUUID() },
    { ...report, naselje_id: otherSettlement, kontejner_id: container },
    { ...report, kontejner_id: randomUUID() },
    { ...report, tip: 'drugo' },
    { ...report, preciznost_lokacije: 'gps' },
    { ...report, tacka: { lat: 100, lon: 22 } },
    { ...report, tacka: null },
    { ...report, status: 'potvrdjena' },
    { ...report, prioritet: 1 },
    { ...report, kanal: 'telefon' },
    { ...report, opis: ' ' },
  ])('rejects invalid public input %#', async (body) => { await publicCreate(body).expect(400); });

  it('requires an idempotency UUID', async () => {
    await request(app.getHttpServer()).post('/reports').send(report).expect(400);
    await publicCreate(report, 'not-a-uuid').expect(400);
  });

  it('deduplicates simultaneous retries and returns the original receipt after triage', async () => {
    const key = randomUUID();
    const responses = await Promise.all([publicCreate(report, key), publicCreate({ ...report }, key)]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(responses[0]!.body).toEqual(responses[1]!.body);
    const row = await database.selectFrom('app.prijava').select('id').where('kratki_kod', '=', responses[0]!.body.kratki_kod as string).executeTakeFirstOrThrow();
    await triage(row.id, { verzija: 1, odluka: 'odbijena', razlog: 'Pogresna prijava' }).expect(200);
    const replay = await publicCreate(report, key).expect(201);
    expect(replay.body).toEqual(responses[0]!.body);
    await publicCreate({ ...report, opis: 'Different content' }, key).expect(409);
    const history = await database.selectFrom('app.prijava_istorija').select('id').where('prijava_id', '=', row.id).execute();
    expect(history).toHaveLength(2);
  });

  it('retries receipt-code collisions without aborting the transaction', async () => {
    const existingId = await create();
    const existing = await database.selectFrom('app.prijava').select('kratki_kod').where('id', '=', existingId).executeTakeFirstOrThrow();
    const service = app.get(ReportsService);
    jest.spyOn(service, 'generateCode').mockReturnValueOnce(existing.kratki_kod).mockReturnValueOnce('PR-ABCDEF123456');
    const receipt = await publicCreate().expect(201);
    expect(receipt.body.kratki_kod).toBe('PR-ABCDEF123456');
  });

  it('records intermediary reports without exposing phone numbers', async () => {
    await request(app.getHttpServer()).post('/reports/assisted').auth(token, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ ...report, kanal: 'posrednik', posrednik_id: intermediary }).expect(201);
    const response = await request(app.getHttpServer()).get('/intermediaries').auth(token, { type: 'bearer' }).expect(200);
    expect(response.body.items).toContainEqual({ id: intermediary, naziv: 'Community president' });
    expect(JSON.stringify(response.body)).not.toContain('+381601234567');
    await request(app.getHttpServer()).post('/reports/assisted').auth(token, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ ...report, kanal: 'posrednik' }).expect(400);
    await database.updateTable('app.posrednik').set({ aktivan: false }).where('id', '=', intermediary).execute();
    await request(app.getHttpServer()).post('/reports/assisted').auth(token, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ ...report, kanal: 'posrednik', posrednik_id: intermediary }).expect(400);
    await database.updateTable('app.posrednik').set({ aktivan: true }).where('id', '=', intermediary).execute();
  });

  it('rejects expired, missing and driver credentials, and checks current account activation', async () => {
    await request(app.getHttpServer()).get('/reports').expect(401);
    await request(app.getHttpServer()).get('/reports').auth(driverToken, { type: 'bearer' }).expect(403);
    const expired = await app.get(JwtService).signAsync({ sub: staffId }, { expiresIn: -1 });
    await request(app.getHttpServer()).get('/reports').auth(expired, { type: 'bearer' }).expect(401);
    await database.updateTable('app.korisnik').set({ aktivan: false }).where('id', '=', staffId).execute();
    await request(app.getHttpServer()).get('/reports').auth(token, { type: 'bearer' }).expect(401);
    await database.updateTable('app.korisnik').set({ aktivan: true }).where('id', '=', staffId).execute();
    const identity = await request(app.getHttpServer()).get('/auth/me').auth(token, { type: 'bearer' }).expect(200);
    expect(Object.keys(identity.body).sort()).toEqual(['id', 'ime', 'uloga']);
    await request(app.getHttpServer()).post('/auth/login').send({ email: 'dispatcher@example.test', password: 'incorrect-password' }).expect(401);
  });

  it('rejects duplicate cycles and chains, including concurrent cross-link attempts', async () => {
    const first = await create();
    const second = await create();
    await triage(first, { verzija: 1, odluka: 'duplikat', duplikat_od: first, razlog: 'Self duplicate' }).expect(400);
    const results = await Promise.all([
      triage(first, { verzija: 1, odluka: 'duplikat', duplikat_od: second, razlog: 'Same incident' }),
      triage(second, { verzija: 1, odluka: 'duplikat', duplikat_od: first, razlog: 'Same incident' }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 400]);
    const original = results[0]!.status === 200 ? second : first;
    const third = await create();
    await triage(original, { verzija: 1, odluka: 'duplikat', duplikat_od: third, razlog: 'Would create chain' }).expect(409);
  });

  it('allows only one concurrent dispatcher update', async () => {
    const id = await create();
    const input = { verzija: 1, odluka: 'potvrdjena', tip_obrade: 'provera_lokacije', razlog: 'Needs a location visit' };
    const results = await Promise.all([triage(id, input), triage(id, input)]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const history = await database.selectFrom('app.prijava_istorija').select('id').where('prijava_id', '=', id).execute();
    expect(history).toHaveLength(2);
  });

  it('keeps large dumps out of collection and requires a completion note', async () => {
    const id = await create({ ...report, tip: 'divlja_deponija', velicina: 'velika' });
    await triage(id, { verzija: 1, odluka: 'potvrdjena', tip_obrade: 'odvoz', kontejner_id: container, razlog: 'Large dump' }).expect(400);
    await triage(id, { verzija: 1, odluka: 'potvrdjena', tip_obrade: 'ciscenje', razlog: 'Dedicated crew required' }).expect(200);
    await request(app.getHttpServer()).post(`/reports/${id}/resolve`).auth(token, { type: 'bearer' }).send({ verzija: 2 }).expect(400);
    await triage(id, { verzija: 2, odluka: 'potvrdjena', tip_obrade: null, razlog: 'Null is not optional' }).expect(400);
  });

  it('rolls back creation and retries cleanly when audit insertion fails', async () => {
    const key = randomUUID();
    const failing = jest.spyOn(ReportsRepository.prototype, 'appendHistory').mockRejectedValueOnce(new Error('Injected audit failure'));
    await publicCreate(report, key).expect(500);
    expect(await database.selectFrom('app.prijava_zahtev').select('kljuc').where('kljuc', '=', key).execute()).toHaveLength(0);
    failing.mockRestore();
    await publicCreate(report, key).expect(201);
  });

  it('rolls back status and version when its history cannot be written', async () => {
    const id = await create();
    jest.spyOn(ReportsRepository.prototype, 'appendHistory').mockRejectedValueOnce(new Error('Injected audit failure'));
    await triage(id, { verzija: 1, odluka: 'odbijena', razlog: 'Injected rollback' }).expect(500);
    const row = await database.selectFrom('app.prijava').select(['status', 'verzija']).where('id', '=', id).executeTakeFirstOrThrow();
    expect(row).toEqual({ status: 'nova', verzija: 1 });
  });

  it('enforces immutable audit rows and SQL constraints', async () => {
    const id = await create();
    await expect(database.updateTable('app.prijava_istorija').set({ razlog: 'tampered' }).where('prijava_id', '=', id).execute()).rejects.toThrow('append-only');
    await expect(database.updateTable('app.prijava').set({ status: 'resena' }).where('id', '=', id).execute()).rejects.toThrow();
    await expect(database.updateTable('app.prijava').set({ tacka: null, naselje_id: null, kontejner_id: null }).where('id', '=', id).execute()).rejects.toThrow();
  });

  it('bounds pagination and filters container lookup', async () => {
    const settlements = await request(app.getHttpServer()).get('/settlements').query({ search: 'Krupac', limit: 1 }).expect(200);
    expect(settlements.body.items).toEqual([{ id: settlement, naziv: 'Krupac' }]);
    const containers = await request(app.getHttpServer()).get('/containers').auth(token, { type: 'bearer' }).query({ naselje_id: settlement }).expect(200);
    expect(containers.body.items).toContainEqual({ id: container, naziv: 'PI-KRU-004', naselje_id: settlement });
    await request(app.getHttpServer()).get('/reports').auth(token, { type: 'bearer' }).query({ limit: 10000 }).expect(400);
  });

  it('enforces a shared atomic rate limit under concurrency', async () => {
    const limits = app.get(RateLimitService);
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => limits.consume('same-client', { scope: 'test', count: 5, seconds: 60 })));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(5);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(7);
    await sql`update app.api_limit set istice_at = now() - interval '1 second'`.execute(database);
    await expect(limits.consume('same-client', { scope: 'test', count: 5, seconds: 60 })).resolves.toBeUndefined();
  });

  it('rate-limits public HTTP submissions and supplies a retry delay', async () => {
    for (let attempt = 0; attempt < 10; attempt++) await publicCreate().expect(201);
    const blocked = await publicCreate().expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.body.message).toBe('Too many requests');
  });
});
