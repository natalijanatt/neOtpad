import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { fromPoint } from '../common/geo';
import { CollectorsRepository, type CollectorRow } from './collectors.repository';
import { SitesRepository } from './sites.repository';
import { DEFAULT_CONTACT } from './default-contact';
import { toE164Serbia } from './phone';
import { WASTE_CLASSIFIER, type WasteClassifier } from './classifier/waste-classifier.port';
import type { CollectorDto, CreateCollectorDto, DisposalSiteDto, DisposalSuggestionDto } from './dto/disposal.dto';

function collectorResponse(row: CollectorRow): CollectorDto {
  return { id: row.id, ime: row.ime, prezime: row.prezime, telefon: row.telefon_e164, materijali: row.materijali };
}

/** Postgres unique_violation — here, a second collector with the same phone. */
const UNIQUE_VIOLATION = '23505';

@Injectable()
export class DisposalService {
  constructor(
    private readonly collectors: CollectorsRepository,
    private readonly sites: SitesRepository,
    @Inject(WASTE_CLASSIFIER) private readonly classifier: WasteClassifier,
  ) {}

  /**
   * Free text → material → who takes it. Collectors come back whenever the
   * material is known; whether a site on the map also takes it, the frontend
   * reads off each site's `materijali` (GET /disposal/sites) — so neither side
   * holds a list of which materials "have a filter". The default contact is
   * always attached, so the answer is never "nobody".
   */
  async suggest(upit: string): Promise<DisposalSuggestionDto> {
    const { materijal, izvor } = await this.classifier.classify(upit);
    const sakupljaci = materijal ? (await this.collectors.findByMaterijal(materijal)).map(collectorResponse) : [];
    return { upit, materijal, izvor, sakupljaci, kontakt: DEFAULT_CONTACT };
  }

  /**
   * The map's sites. A row whose point cannot be read is dropped rather than
   * sent without one — a site the map cannot place is a site nobody can find.
   */
  async listSites(): Promise<DisposalSiteDto[]> {
    const rows = await this.sites.list();
    return rows.flatMap((row) => {
      const tacka = fromPoint(row.lokacija);
      if (!tacka) return [];
      return [{ id: row.id, naziv: row.naziv, tip: row.tip, adresa: row.adresa, tacka, geo_preciznost: row.geo_preciznost,
        radno_vreme: row.radno_vreme, prima: row.prima, materijali: row.materijali, izvor: row.izvor }];
    });
  }

  async list(): Promise<CollectorDto[]> {
    return (await this.collectors.list()).map(collectorResponse);
  }

  async create(input: CreateCollectorDto): Promise<CollectorDto> {
    const telefon = toE164Serbia(input.telefon);
    if (!telefon) throw new BadRequestException('Phone must be a Serbian number, e.g. 064 123 4567 or +381 10 123 456');
    try {
      const row = await this.collectors.insert({ ime: input.ime, prezime: input.prezime, telefon_e164: telefon, materijali: input.materijali });
      return collectorResponse(row);
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ConflictException('A collector with this phone number already exists');
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    if (!await this.collectors.remove(id)) throw new NotFoundException('Collector not found');
  }
}
