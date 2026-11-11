import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, PayloadTooLargeException, ServiceUnavailableException, UnsupportedMediaTypeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { toInstant } from '../common/row-values';
import { fromPoint, type Tacka } from '../common/geo';
import type { Selectable } from 'kysely';
import type { AppPreciznostLokacije, DB } from '../database/generated/schema';
import { ReportsRepository, type ReportUpdate } from './reports.repository';
import { photoResponse, reportResponse } from './reports.response';
import { photoKey, sniffPhoto } from './photo-content';
import { proveriOdgovor } from './response-rules';
import { kanonskaIzPrijave, opservacijaIzPrijave, TIP_DEPONIJE } from './registar-deponija';
import { classificationResponse } from '../classification/classification.response';
import { uporediSaOdlukom } from '../classification/ishod';
import type { ClassificationDto } from '../classification/dto/classification.dto';
import { STORAGE, type StoragePort } from '../storage/storage.port';
import type { AssistedReportDto, CreateReportDto, PhotoDto, PhotoReceiptDto, RemovePhotoDto, ReportDetailDto, ReportHistoryDto, ReportListItemDto, ReportPageDto, ReportQueryDto, ReportReceiptDto, ReportResponseDto, ResolveReportDto, ResponseType, TriageReportDto } from './dto/reports.dto';

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([first], [second]) => first.localeCompare(second))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
}

/**
 * How long an uploaded photo waits for the submission that claims it. Long
 * enough that a citizen can lose signal mid-form and come back; short enough
 * that an abandoned upload is not a permanent object in a public bucket.
 */
const STAGING_SATI = 24;

@Injectable()
export class ReportsService {
  constructor(
    private readonly repository: ReportsRepository,
    @Inject(STORAGE) private readonly storage: StoragePort,
    private readonly config: ConfigService,
  ) {}

  /**
   * Stores an image and returns a single-use identifier.
   *
   * Unattached on purpose: an anonymous reporter never learns the report id, and
   * `kratki_kod` is a receipt rather than a credential, so "upload against an
   * existing report" would have to trust a code that was never meant to
   * authorise a write. Upload first, claim on submit.
   */
  async uploadPhoto(file: Express.Multer.File | undefined): Promise<PhotoReceiptDto> {
    if (!file || file.size === 0) throw new BadRequestException('A photo file is required');
    const limit = this.config.get<number>('STORAGE_MAX_BYTES', 8388608);
    // multer already refused anything larger, but its limit and this one drift
    // apart the moment somebody edits one of them.
    if (file.size > limit) throw new PayloadTooLargeException(`Photo exceeds ${limit} bytes`);

    const content = sniffPhoto(file.buffer);
    if (!content) throw new UnsupportedMediaTypeException('Only JPEG, PNG, WebP or HEIC images are accepted');

    const kljuc = photoKey(content);
    const javniUrl = this.storage.url(kljuc);
    // Bytes first: a row pointing at an object that was never written is a
    // broken image in the dispatcher's queue, while an object with no row is
    // invisible and the cleanup sweep collects it.
    await this.storage.put(kljuc, file.buffer, content.mimeTip);
    try {
      const row = await this.repository.insertPhoto({
        kljuc, javni_url: javniUrl, mime_tip: content.mimeTip, velicina_bajt: file.size,
        sha256: createHash('sha256').update(file.buffer).digest('hex'),
        istice_at: new Date(Date.now() + STAGING_SATI * 3600_000),
      });
      return {
        foto_id: row.id, javni_url: row.javni_url, mime_tip: row.mime_tip,
        velicina_bajt: row.velicina_bajt, istice_at: toInstant(row.istice_at!).toISOString(),
      };
    } catch (error) {
      await this.storage.remove(kljuc);
      throw error;
    }
  }

  /** Staff removal of a photo that should not be public - a face, a plate, a house number. */
  async removePhoto(id: string, fotoId: string, input: RemovePhotoDto, actor: string): Promise<void> {
    const kljuc = await this.repository.withTransaction(async (repository) => {
      const row = await repository.find(id);
      if (!row) throw new NotFoundException('Report not found');
      const foto = await repository.findPhoto(fotoId, id);
      if (!foto) throw new NotFoundException('Photo not found on this report');
      await repository.deletePhoto(fotoId);
      // The report row is unchanged, so `verzija` does not move - bumping it
      // would invalidate a dispatcher's open triage form over an edit that
      // touched nothing they are editing. The history entry is the record.
      const response = reportResponse(row);
      await repository.appendHistory(response, response, actor, 'foto_uklonjena', input.razlog);
      return foto.kljuc;
    });
    // After the commit: if this fails the object is orphaned, which the sweep
    // handles. Before the commit, a rollback would leave a live row pointing at
    // a deleted object.
    await this.storage.remove(kljuc);
  }

  async create(input: CreateReportDto | AssistedReportDto, key: string, actor: string | null = null): Promise<ReportReceiptDto> {
    const assisted = actor !== null ? input as AssistedReportDto : null;
    const scope = actor === null ? 'web' : `staff:${actor}`;
    const hash = createHash('sha256').update(canonical(input)).digest('hex');
    return this.repository.withTransaction(async (repository) => {
      await repository.lockSubmission(scope, key);
      const replay = await repository.findRequest(scope, key);
      if (replay) {
        if (replay.sadrzaj_hash !== hash) throw new ConflictException('Idempotency key was used with different content');
        return { kratki_kod: replay.kratki_kod, status: 'nova', primljena_at: toInstant(replay.primljena_at).toISOString() };
      }
      const location = await this.location(repository, input);
      if (input.tip === 'drugo' && !input.opis) throw new BadRequestException('Description is required for drugo');
      if (assisted?.kanal === 'posrednik') {
        if (!assisted.posrednik_id || !await repository.findIntermediary(assisted.posrednik_id)) {
          throw new BadRequestException('An active intermediary is required');
        }
      } else if (assisted?.posrednik_id) {
        throw new BadRequestException('Intermediary is only valid for posrednik channel');
      }
      for (let attempt = 0; attempt < 5; attempt++) {
        const row = await repository.insert({
          kratki_kod: this.generateCode(), kanal: assisted?.kanal ?? 'web',
          tip: input.tip, opis: input.opis ?? null, velicina: input.velicina ?? null,
          posrednik_id: assisted?.posrednik_id ?? null, ...location,
        });
        if (!row) continue;
        const fotoIds = input.foto_ids ?? [];
        const claimed = await repository.claimPhotos(fotoIds, row.id);
        if (claimed.length !== fotoIds.length) {
          // Rolls the whole submission back. Accepting the report and dropping
          // the photograph would lose the evidence the citizen actually sent,
          // and they would have no way to tell that it happened.
          throw new BadRequestException('A photo is unknown, expired or already attached to another report');
        }
        const response = reportResponse(row);
        await repository.appendHistory(response, null, actor, 'kreirana', null);
        await repository.saveRequest(scope, key, hash, row.id);
        // Queued, not classified: an anonymous submission must not get slower,
        // or fail, because an external API is down. The worker picks it up in
        // seconds (`docs/report-classification.md`).
        await repository.enqueueClassification(row.id, row.verzija);
        return { kratki_kod: row.kratki_kod, status: 'nova', primljena_at: response.primljena_at };
      }
      throw new ServiceUnavailableException('Could not allocate a receipt code; retry with the same idempotency key');
    });
  }

  generateCode(): string { return `PR-${randomBytes(6).toString('hex').toUpperCase()}`; }

  async list(query: ReportQueryDto): Promise<ReportPageDto> {
    const rows = await this.repository.list(query);
    const page = rows.slice(0, query.limit);
    // One extra query for the whole page rather than one per row: the queue is
    // the screen a dispatcher keeps open, and a photo is often the fastest way
    // to triage a report without calling anybody back.
    const ids = page.map((row) => row.id);
    const photos = await this.photosByReport(ids);
    const klasifikacije = await this.classificationsByReport(ids);
    const items: ReportListItemDto[] = page.map((row) => ({
      ...reportResponse(row), fotografije: photos.get(row.id) ?? [], klasifikacija: klasifikacije.get(row.id) ?? null,
    }));
    return { items, page: query.page, limit: query.limit, hasMore: rows.length > query.limit };
  }

  private async photosByReport(ids: string[]): Promise<Map<string, PhotoDto[]>> {
    const grouped = new Map<string, PhotoDto[]>();
    for (const row of await this.repository.photosFor(ids)) {
      // `prijava_id` is nullable for staged uploads, but a row selected by
      // report id always has one.
      const key = row.prijava_id!;
      const list = grouped.get(key);
      if (list) list.push(photoResponse(row));
      else grouped.set(key, [photoResponse(row)]);
    }
    return grouped;
  }

  /**
   * The newest proposal per report. One query for the page, like the photos
   * above: the suggestion is the reason a dispatcher can triage the queue
   * without opening every row.
   */
  private async classificationsByReport(ids: string[]): Promise<Map<string, ClassificationDto>> {
    const grouped = new Map<string, ClassificationDto>();
    for (const row of await this.repository.classificationsFor(ids)) {
      grouped.set(row.prijava_id, classificationResponse(row));
    }
    return grouped;
  }

  async detail(id: string): Promise<ReportDetailDto> {
    const row = await this.repository.find(id);
    if (!row) throw new NotFoundException('Report not found');
    const response = reportResponse(row);
    const history = await this.repository.history(id);
    const photos = (await this.photosByReport([id])).get(id) ?? [];
    return {
      ...response,
      fotografije: photos,
      klasifikacija: (await this.classificationsByReport([id])).get(id) ?? null,
      istorija: history.filter((entry) => entry.verzija <= row.verzija).map((entry): ReportHistoryDto => ({
        akcija: entry.akcija, korisnik_id: entry.korisnik_id, razlog: entry.razlog,
        verzija: entry.verzija, nastalo_at: toInstant(entry.nastalo_at).toISOString(),
        prethodno: entry.prethodno as unknown as ReportResponseDto | null,
        novo: entry.novo as unknown as ReportResponseDto,
      })),
    };
  }

  async triage(id: string, input: TriageReportDto, actor: string): Promise<ReportResponseDto> {
    return this.repository.withTransaction(async (repository) => {
      await repository.lockTriage();
      const row = await repository.find(id);
      if (!row) throw new NotFoundException('Report not found');
      if (row.verzija !== input.verzija) throw new ConflictException('Report changed; reload before editing');
      if (!['nova', 'potvrdjena'].includes(row.status)) throw new ConflictException('Closed reports cannot be changed');
      const before = reportResponse(row);
      let values: ReportUpdate;
      if (input.odluka === 'potvrdjena') {
        if (input.duplikat_od) throw new BadRequestException('Duplicate target is not allowed for confirmation');
        if (!input.tip_obrade) throw new BadRequestException('Response category is required');
        const merged: CreateReportDto = {
          tip: input.tip ?? row.tip, opis: input.opis ?? row.opis ?? undefined,
          tacka: input.tacka ?? before.tacka ?? undefined,
          naselje_id: input.naselje_id ?? row.naselje_id ?? undefined,
          kontejner_id: input.kontejner_id ?? row.kontejner_id ?? undefined,
          opis_lokacije: input.opis_lokacije ?? row.opis_lokacije ?? undefined,
          velicina: input.velicina ?? row.velicina ?? undefined,
          preciznost_lokacije: input.preciznost_lokacije ?? (input.tacka || input.kontejner_id ? undefined : row.preciznost_lokacije),
        };
        if (merged.tip === 'drugo' && !merged.opis) throw new BadRequestException('Description is required for drugo');
        const location = await this.location(repository, merged);
        this.validateResponse(input.tip_obrade, merged);
        values = { ...location, tip: merged.tip, opis: merged.opis ?? null, velicina: merged.velicina ?? null,
          status: 'potvrdjena', tip_obrade: input.tip_obrade, prioritet: input.prioritet ?? row.prioritet ?? 3,
          // Resolved before the update rather than after it, so the link lands in
          // the same write as the decision and does not cost the report a version.
          kanonska_id: await this.registruj(repository, row, merged.tip, location) };
      } else {
        const forbidden = ['tip', 'opis', 'tacka', 'naselje_id', 'kontejner_id', 'opis_lokacije', 'preciznost_lokacije', 'velicina', 'tip_obrade', 'prioritet'] as const;
        if (forbidden.some((field) => input[field] !== undefined)) throw new BadRequestException('Content edits are only allowed with confirmation');
        if (input.odluka === 'duplikat') {
          if (!input.duplikat_od || input.duplikat_od === id) throw new BadRequestException('A different original report is required');
          const target = await repository.find(input.duplikat_od);
          if (!target || ['duplikat', 'odbijena'].includes(target.status)) throw new BadRequestException('Original report must exist and not be rejected or a duplicate');
          if (await repository.hasDuplicates(id)) throw new ConflictException('A report referenced by duplicates cannot itself become a duplicate');
        } else if (input.duplikat_od) throw new BadRequestException('Duplicate target is only allowed for duplicate decisions');
        // A rejected or duplicated report leaves the register: it is no longer
        // evidence that anything is there.
        values = { status: input.odluka, duplikat_od: input.duplikat_od ?? null, prioritet: null, tip_obrade: null, kanonska_id: null };
      }
      const changed = await repository.update(id, input.verzija, values, input.odluka === 'potvrdjena' ? 'confirm' : undefined);
      if (!changed) throw new ConflictException('Report changed; reload before editing');
      const response = reportResponse(changed);
      await repository.appendHistory(response, before, actor, input.odluka, input.razlog);
      await this.settleClassification(repository, row, response);
      await this.uskladiRegistar(repository, row, changed);
      return response;
    });
  }

  async resolve(id: string, input: ResolveReportDto, actor: string): Promise<ReportResponseDto> {
    return this.repository.withTransaction(async (repository) => {
      await repository.lockTriage();
      const row = await repository.find(id);
      if (!row) throw new NotFoundException('Report not found');
      if (row.verzija !== input.verzija) throw new ConflictException('Report changed; reload before editing');
      if (row.status !== 'potvrdjena') throw new ConflictException('Only confirmed reports can be resolved');
      if (row.tip_obrade === 'provera_lokacije') throw new ConflictException('Choose an actionable response after location verification before resolving');
      const changed = await repository.update(id, input.verzija, { status: 'resena' }, 'resolve');
      if (!changed) throw new ConflictException('Report changed; reload before editing');
      const response = reportResponse(changed);
      await repository.appendHistory(response, reportResponse(row), actor, 'resena', input.razlog);
      await this.uskladiRegistar(repository, row, changed);
      return response;
    });
  }

  /**
   * Which registry site a confirmed dump report belongs to, opening one if no
   * site is near enough.
   *
   * The match is recomputed on every confirmation rather than kept once. The
   * ordinary path for a rural report is exactly why: an SMS is confirmed as
   * `provera_lokacije` with no coordinate and opens a site with none, then the
   * crew verifies the location and the second confirmation finds the registry
   * dump that was there all along. Keeping the first answer would leave two
   * records of one pile.
   */
  private async registruj(
    repository: ReportsRepository,
    row: Selectable<DB['app.prijava']>,
    tip: string,
    location: { tacka: Tacka | null; naselje_id: string | null },
  ): Promise<string | null> {
    if (tip !== TIP_DEPONIJE) return null;
    const prijava = { kratki_kod: row.kratki_kod, naselje_id: location.naselje_id, tacka: location.tacka,
      preciznost_lokacije: row.preciznost_lokacije };
    const blizu = await repository.najblizaKanonska(location.tacka);
    if (blizu) return blizu.id;
    if (row.kanonska_id) {
      // Still the same site, but the dispatcher may have established where it is
      // since it was opened.
      const { naselje_id, tacka, geo_preciznost } = kanonskaIzPrijave(prijava, new Date().getUTCFullYear());
      await repository.refreshKanonskaIzPrijave(row.kanonska_id, { naselje_id, tacka, geo_preciznost });
      return row.kanonska_id;
    }
    const otvorena = await repository.insertKanonskaIzPrijave(kanonskaIzPrijave(prijava, new Date().getUTCFullYear()));
    return otvorena.id;
  }

  /**
   * Brings the dump register in line with what the report now says.
   *
   * In the decision's own transaction, because a confirmed dump that is missing
   * from the register and a register entry for a rejected report are the same
   * bug seen from two sides. Unlike classification this needs no outbox: the work
   * is three local statements, not a call to somebody else's API.
   */
  private async uskladiRegistar(
    repository: ReportsRepository,
    before: Selectable<DB['app.prijava']>,
    after: Selectable<DB['app.prijava']>,
  ): Promise<void> {
    const registruje = after.status !== 'odbijena' && after.status !== 'duplikat' && after.tip === TIP_DEPONIJE;
    if (registruje && after.kanonska_id) {
      const prijava = { kratki_kod: after.kratki_kod, naselje_id: after.naselje_id,
        tacka: fromPoint(after.tacka), preciznost_lokacije: after.preciznost_lokacije };
      const datum = new Date();
      await repository.upsertOpservacijaPrijave(after.id, after.kanonska_id,
        opservacijaIzPrijave(prijava, 'prijava', datum));
      // A cleared site that refills is the whole recurrence signal, so the
      // clean-up is recorded as its own event rather than closing the first one.
      if (after.status === 'resena') {
        await repository.upsertOpservacijaPrijave(after.id, after.kanonska_id,
          opservacijaIzPrijave(prijava, 'sanacija', datum));
      }
      await repository.extendSerijaPrijava(datum.getUTCFullYear());
    } else {
      await repository.deleteOpservacijePrijave(after.id);
    }
    // A site this report opened and then left behind - retyped, rejected, or
    // matched to a real registry dump on a later confirmation - is not evidence
    // of anything and must not stay on a public map.
    const napusteno = before.kanonska_id !== null && before.kanonska_id !== after.kanonska_id ? [before.kanonska_id] : [];
    for (const id of napusteno) await repository.deleteSirocePrijave(id);
  }

  /**
   * Scores the proposal against what the dispatcher actually decided.
   *
   * In the same transaction as the decision, against the version the proposal
   * was computed for: that is what makes "how often is the classifier right" a
   * measurement rather than an opinion. Anything still queued for this report is
   * retired at the same time - its answer would arrive after the decision.
   */
  private async settleClassification(repository: ReportsRepository, before: Selectable<DB['app.prijava']>, after: ReportResponseDto): Promise<void> {
    const predlog = await repository.findClassification(before.id, before.verzija);
    if (predlog) {
      await repository.settleClassification(predlog.id, uporediSaOdlukom(predlog, {
        potvrdjena: after.status === 'potvrdjena',
        tip: after.tip,
        tip_obrade: after.tip_obrade,
      }));
    }
    await repository.staleClassifications(before.id, before.verzija);
  }

  private async location(repository: ReportsRepository, input: CreateReportDto) {
    let settlement = input.naselje_id ?? null;
    if (settlement && !await repository.findSettlement(settlement)) throw new BadRequestException('Unknown settlement');
    if (input.kontejner_id) {
      const container = await repository.findContainer(input.kontejner_id);
      if (!container) throw new BadRequestException('Unknown or inactive container');
      if (settlement && settlement !== container.naselje_id) throw new BadRequestException('Container does not belong to the supplied settlement');
      settlement = container.naselje_id;
    }
    if (!input.tacka && !settlement) throw new BadRequestException('Coordinates, a settlement or a container are required');
    const precision: AppPreciznostLokacije = input.preciznost_lokacije
      ?? (input.tacka ? 'gps' : input.kontejner_id || input.opis_lokacije ? 'opisana' : 'naselje');
    if (precision === 'gps' && !input.tacka) throw new BadRequestException('GPS precision requires coordinates');
    if (precision === 'naselje' && (input.tacka || !settlement)) throw new BadRequestException('Settlement precision requires a settlement and no coordinates');
    if (precision === 'opisana' && !input.tacka && !input.kontejner_id && !input.opis_lokacije) throw new BadRequestException('Described location requires directions or a container');
    return { tacka: input.tacka ?? null, naselje_id: settlement, kontejner_id: input.kontejner_id ?? null,
      opis_lokacije: input.opis_lokacije ?? null, preciznost_lokacije: precision };
  }

  /** The rules live in `response-rules.ts`; the classifier applies the same ones to its proposal. */
  private validateResponse(response: ResponseType, input: CreateReportDto): void {
    const greska = proveriOdgovor(response, {
      tip: input.tip,
      velicina: input.velicina ?? null,
      imaKontejner: Boolean(input.kontejner_id),
      imaLokaciju: Boolean(input.tacka || input.kontejner_id || input.opis_lokacije),
    });
    if (greska) throw new BadRequestException(greska);
  }
}
