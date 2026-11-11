import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NewsRepository, type NewsUpdate } from './news.repository';
import { newsResponse } from './news.response';
import { smsLimit } from './news.sms';
import type { CreateNewsDto, NewsPageDto, NewsQueryDto, NewsResponseDto, UpdateNewsDto } from './dto/news.dto';

/** Posts are signed by the utility unless the publisher says otherwise. */
const DEFAULT_AUTHOR = 'JKP Komunalac Pirot';

@Injectable()
export class NewsService {
  constructor(private readonly repository: NewsRepository) {}

  async list(query: NewsQueryDto): Promise<NewsPageDto> {
    const rows = await this.repository.list(query);
    return { items: rows.slice(0, query.limit).map(newsResponse), page: query.page, limit: query.limit, hasMore: rows.length > query.limit };
  }

  async create(input: CreateNewsDto, actor: string): Promise<NewsResponseDto> {
    await this.checkSettlement(input.naselje_id ?? null);
    this.checkSms(input.sms_tekst ?? null);
    const row = await this.repository.insert({
      naslov: input.naslov,
      sadrzaj: input.sadrzaj,
      slika_url: input.slika_url ?? null,
      ...(input.kategorija ? { kategorija: input.kategorija } : {}),
      naselje_id: input.naselje_id ?? null,
      zakacena: input.zakacena ?? false,
      sms_tekst: input.sms_tekst ?? null,
      autor: input.autor ?? DEFAULT_AUTHOR,
      objavio_korisnik_id: actor,
    });
    return newsResponse(row);
  }

  /**
   * Partial edit. A key that is absent leaves the field alone; an explicit null
   * clears it — that is the only way to remove an image or un-target a
   * settlement, and the two cases must not collapse into one.
   */
  async update(id: string, input: UpdateNewsDto): Promise<NewsResponseDto> {
    const current = await this.repository.find(id);
    if (!current) throw new NotFoundException('News post not found');
    if (current.verzija !== input.verzija) throw new ConflictException('Post changed; reload before editing');

    if (input.naselje_id !== undefined) await this.checkSettlement(input.naselje_id);
    if (input.sms_tekst !== undefined) this.checkSms(input.sms_tekst);

    const values: NewsUpdate = {};
    if (input.naslov !== undefined) values.naslov = input.naslov;
    if (input.sadrzaj !== undefined) values.sadrzaj = input.sadrzaj;
    if (input.slika_url !== undefined) values.slika_url = input.slika_url;
    if (input.kategorija !== undefined) values.kategorija = input.kategorija;
    if (input.naselje_id !== undefined) values.naselje_id = input.naselje_id;
    if (input.zakacena !== undefined) values.zakacena = input.zakacena;
    if (input.sms_tekst !== undefined) values.sms_tekst = input.sms_tekst;
    if (input.autor !== undefined) values.autor = input.autor;

    const row = await this.repository.update(id, input.verzija, values);
    if (!row) throw new ConflictException('Post changed; reload before editing');
    return newsResponse(row);
  }

  async remove(id: string): Promise<void> {
    const removed = await this.repository.remove(id);
    // A delete that matched nothing is a 404 rather than a silent 204: the
    // caller believes a post disappeared, and it should be true.
    if (!removed) throw new NotFoundException('News post not found');
  }

  private async checkSettlement(id: string | null): Promise<void> {
    if (id === null) return;
    if (!await this.repository.findSettlement(id)) throw new BadRequestException('Unknown settlement');
  }

  /**
   * Refuses a second SMS. The limit depends on the alphabet, so the message says
   * which one applies — "162 of 70" with no explanation reads like a bug.
   */
  private checkSms(text: string | null): void {
    if (text === null) return;
    const limit = smsLimit(text);
    if (text.length > limit) {
      throw new BadRequestException(
        limit === 70
          ? `SMS text is ${text.length} characters; the limit is 70 because it contains diacritics (c, c, s, z, d). Remove them for 160.`
          : `SMS text is ${text.length} characters; the limit is 160.`,
      );
    }
  }
}
