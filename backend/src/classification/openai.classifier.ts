/**
 * The reasoning classifier: OpenAI chat completions with a strict JSON schema.
 *
 * Plain `fetch` rather than the SDK. One endpoint, one non-streaming call, and
 * the two things that actually matter here are a hard timeout and a response
 * that is refused unless it matches the schema - both of which are two lines of
 * `fetch`. `backend/` is not part of a workspace and installs on its own, so a
 * dependency has to earn itself; this one did not.
 *
 * Structured outputs, not prose parsing: `response_format.json_schema` with
 * `strict: true` means an answer that is not one of our enum values never
 * reaches the database. Identifiers are checked again in the service against the
 * candidate list, because a schema can enforce "a string" and not "a container
 * that exists".
 *
 * Constructed by the module factory with `new` rather than by the container:
 * which classifier is bound to KLASIFIKATOR depends on a config value, and a
 * provider class cannot express that.
 *
 * Privacy: report photos live in a public bucket (`docs/media-storage.md`) and
 * their URLs are sent to OpenAI. The prompt forbids copying faces, plates or
 * house numbers into the rationale, which is staff-only anyway. No citizen phone
 * number is in the input at all - it is not part of a report.
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PODKATEGORIJE, OPIS_PODKATEGORIJE } from './taxonomy';
import { REPORT_TYPES, RESPONSE_TYPES } from '../reports/vocabulary';
import type { ClassifierPort, KlasifikacijaPredlog, KlasifikacijaUlaz } from './classifier.port';

const SHEMA = {
  name: 'klasifikacija_prijave',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      tip: { type: 'string', enum: REPORT_TYPES },
      podkategorija: { type: 'string', enum: PODKATEGORIJE },
      velicina: { type: ['string', 'null'], enum: ['mala', 'srednja', 'velika', null] },
      tip_obrade: { type: 'string', enum: RESPONSE_TYPES },
      prioritet: { type: 'integer', enum: [1, 2, 3, 4, 5] },
      kontejner_id: { type: ['string', 'null'] },
      duplikat_od: { type: ['string', 'null'] },
      pouzdanost: { type: 'number' },
      obrazlozenje: { type: 'string' },
    },
    required: ['tip', 'podkategorija', 'velicina', 'tip_obrade', 'prioritet', 'kontejner_id', 'duplikat_od', 'pouzdanost', 'obrazlozenje'],
  },
} as const;

/**
 * The rules are in the prompt *and* re-checked in the service. Stating them here
 * is what makes the model propose something a dispatcher can actually save;
 * checking them there is what happens when it does not.
 */
const UPUTSTVO = [
  'Ti si pomocnik dispecera JKP u Pirotu. Klasifikujes prijavu gradjanina da bi se odredilo koja sluzba izlazi na teren.',
  'Odgovaras iskljucivo kroz zadatu JSON shemu.',
  '',
  'KATEGORIJE PROBLEMA (tip):',
  '- pun_kontejner: kontejner je pun, otpad je i dalje unutra',
  '- prelivanje: otpad je izasao van kontejnera i lezi oko njega',
  '- divlja_deponija: otpad odlozen van kontejnerskog mesta',
  '- ostecen_kontejner: kontejner postoji ali je ostecen',
  '- nedostaje_kontejner: kontejnera nema tamo gde bi trebalo da bude',
  '- drugo: sve ostalo; obavezno objasni u obrazlozenju',
  '',
  'PODKATEGORIJE (podkategorija) - od njih zavisi koja ekipa i koja mehanizacija izlazi:',
  ...PODKATEGORIJE.map((kljuc) => `- ${kljuc}: ${OPIS_PODKATEGORIJE[kljuc]}`),
  '',
  'ODGOVOR SLUZBE (tip_obrade) i tvrda pravila koja dispecer ne moze da prekrsi:',
  '- odvoz: redovan kamion. Dozvoljen SAMO ako je tip pun_kontejner ili prelivanje, ako je poznat kontejner iz liste kandidata, i ako velicina NIJE velika.',
  '- ciscenje: posebna ekipa. Dozvoljeno za divlja_deponija, prelivanje ili drugo.',
  '- odrzavanje: popravka ili zamena kontejnera. Dozvoljeno za ostecen_kontejner, nedostaje_kontejner ili drugo.',
  '- provera_lokacije: kada lokacija nije upotrebljiva ili ne mozes pouzdano da zakljucis sta je problem.',
  'Ako lokacija nije upotrebljiva (nema koordinata, nema kontejnera i nema opisa lokacije), jedini dozvoljen odgovor je provera_lokacije.',
  '',
  'KAKO DA ZAKLJUCUJES:',
  '- Tip koji je gradjanin izabrao je nagovestaj, ne istina. Fotografija i kontekst imaju prednost.',
  '- Isti prizor je prelivanje ako je uz servisiran kontejner na nekoliko metara, a divlja_deponija ako je daleko od svakog kontejnera ili na poznatoj crnoj tacki.',
  '- Naselje bez organizovanog prikupljanja i blizina evidentirane deponije povecavaju verovatnocu da je u pitanju divlja_deponija.',
  '- kontejner_id sme da bude samo jedan od ponudjenih kandidata ili null. Nikada ne izmisljaj identifikator.',
  '- duplikat_od popuni samo ako je ponudjena prijava ocigledno isti problem na istom mestu; inace null.',
  '- prioritet: 1 je najhitnije. Opasan otpad, pozar i uginula zivotinja su 1. Zeleni otpad i problemi van nadleznosti su 4 ili 5.',
  '- pouzdanost je broj od 0 do 1: koliko si siguran. Ako nema ni opisa ni fotografije, ne prelazi 0.4.',
  // Observed failures on real reports, each one a line here: the model read a
  // neighbouring report's description as evidence about this one, asserted a
  // fill level nobody measured, and left `velicina` null on a dump - which is
  // the field that decides whether a truck or an excavator is dispatched.
  '- Opisi iz liste OTVORENE PRIJAVE U BLIZINI sluze iskljucivo za prepoznavanje duplikata. Nikada ih ne koristi kao dokaz o tome sta je na ovoj prijavi.',
  '- O punjenju kontejnera tvrdi samo ono sto pise kod kandidata. Ako punjenje nije poznato, nemoj ga pominjati.',
  '- velicina: za divlju deponiju, gradjevinski sut i kabasti otpad uvek proceni velicinu, jer od nje zavisi koje vozilo izlazi. null ostavi samo kada zaista nema osnova za procenu.',
  '',
  'OBRAZLOZENJE: jedna ili dve recenice na srpskom, latinicom, za dispecera. Navedi sta te je ubedilo.',
  'Nikada ne prepisuj lica, registarske tablice, kucne brojeve ni imena ljudi sa fotografije u obrazlozenje.',
].join('\n');

interface OpenAiOdgovor {
  choices?: { message?: { content?: string | null; refusal?: string | null } }[];
  error?: { message?: string };
}

export class OpenAiClassifier implements ClassifierPort {
  readonly izvor = 'model' as const;
  readonly model: string;

  private readonly logger = new Logger(OpenAiClassifier.name);
  private readonly kljuc: string;
  private readonly osnovniUrl: string;
  private readonly timeoutMs: number;
  private readonly saFotografijama: boolean;

  constructor(private readonly config: ConfigService) {
    this.model = this.config.get<string>('CLASSIFIER_MODEL', 'gpt-4o-mini');
    this.kljuc = this.config.getOrThrow<string>('OPENAI_API_KEY');
    this.osnovniUrl = this.config.get<string>('OPENAI_BASE_URL', 'https://api.openai.com/v1');
    this.timeoutMs = this.config.get<number>('CLASSIFY_TIMEOUT_MS', 20000);
    this.saFotografijama = this.config.get<boolean>('CLASSIFY_USE_PHOTOS', true);
  }

  async klasifikuj(ulaz: KlasifikacijaUlaz): Promise<KlasifikacijaPredlog> {
    const odgovor = await fetch(`${this.osnovniUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.kljuc}` },
      body: JSON.stringify({
        model: this.model,
        // Triage has to be reproducible: the same report classified twice on two
        // instances must not route to two different crews.
        temperature: 0,
        // `max_completion_tokens`, not `max_tokens`: CLASSIFIER_MODEL is
        // configurable and the newer models reject the old name outright.
        // Checked against the API that gpt-4o-mini accepts both.
        max_completion_tokens: 500,
        response_format: { type: 'json_schema', json_schema: SHEMA },
        messages: [
          { role: 'system', content: UPUTSTVO },
          { role: 'user', content: this.sadrzaj(ulaz) },
        ],
      }),
      // The worker retries, so a call that hangs costs one attempt rather than
      // the whole queue behind it.
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!odgovor.ok) {
      const telo = await odgovor.text().catch(() => '');
      throw new Error(`OpenAI ${odgovor.status}: ${telo.slice(0, 300)}`);
    }

    const telo = await odgovor.json() as OpenAiOdgovor;
    const poruka = telo.choices?.[0]?.message;
    if (poruka?.refusal) throw new Error(`Model odbio klasifikaciju: ${poruka.refusal}`);
    if (!poruka?.content) throw new Error(`Prazan odgovor modela: ${telo.error?.message ?? 'bez sadrzaja'}`);

    return this.procitaj(poruka.content);
  }

  /** Text plus, when there is one, the photograph. The photo is usually the deciding evidence. */
  private sadrzaj(ulaz: KlasifikacijaUlaz): unknown[] {
    const delovi: unknown[] = [{ type: 'text', text: this.opisPrijave(ulaz) }];
    if (!this.saFotografijama) return delovi;

    for (const foto of ulaz.fotografije.slice(0, 3)) {
      // 'low' detail: a full-resolution phone photo costs several times more and
      // adds nothing to "is that a container or a pile of rubble".
      delovi.push({ type: 'image_url', image_url: { url: foto.javni_url, detail: 'low' } });
    }
    return delovi;
  }

  private opisPrijave(ulaz: KlasifikacijaUlaz): string {
    const { prijava, kontekst } = ulaz;
    const redovi = [
      'PRIJAVA',
      `kanal: ${prijava.kanal}`,
      `tip koji je izabrao gradjanin: ${prijava.tip}`,
      `opis: ${prijava.opis ?? '(nema)'}`,
      `opis lokacije: ${prijava.opis_lokacije ?? '(nema)'}`,
      `velicina koju je naveo gradjanin: ${prijava.velicina ?? '(nije navedena)'}`,
      `preciznost lokacije: ${prijava.preciznost_lokacije}`,
      prijava.tacka ? `koordinate: ${prijava.tacka.lat.toFixed(6)}, ${prijava.tacka.lon.toFixed(6)}` : 'koordinate: (nema)',
      `broj fotografija: ${ulaz.fotografije.length}`,
      '',
      'KONTEKST',
      kontekst.naselje
        ? `naselje: ${kontekst.naselje.naziv}, organizovano prikupljanje: ${kontekst.naselje.pokrivenost}`
        : 'naselje: (nepoznato)',
      kontekst.crna_tacka_m === null
        ? 'najbliza crna tacka: (nema u blizini ili lokacija nije dovoljno precizna)'
        : `najbliza crna tacka: ${kontekst.crna_tacka_m} m`,
      kontekst.kanonska_deponija_m === null
        ? 'najbliza evidentirana divlja deponija: (nema u blizini ili lokacija nije dovoljno precizna)'
        : `najbliza evidentirana divlja deponija: ${kontekst.kanonska_deponija_m} m`,
      '',
      'KANDIDATI ZA KONTEJNER (kontejner_id sme da bude samo jedan od ovih ili null)',
      kontekst.kontejneri.length === 0 ? '(nema kandidata)' : '',
      ...kontekst.kontejneri.map((kandidat) => [
        `- id: ${kandidat.id}`,
        `oznaka: ${kandidat.oznaka}`,
        `mesto: ${kandidat.mesto}`,
        `otpad: ${kandidat.tip_otpada}`,
        kandidat.rastojanje_m === null ? 'rastojanje: (nepoznato)' : `rastojanje: ${kandidat.rastojanje_m} m`,
        // A container with no sensor has no fill level at all. Saying "0 %" here
        // would invite the model to call an unmonitored bin empty.
        kandidat.punjenje_percent === null ? 'punjenje: (nema senzora)' : `punjenje: ${kandidat.punjenje_percent}%`,
        kandidat.dana_od_praznjenja === null ? 'poslednje praznjenje: (nepoznato)' : `poslednje praznjenje pre ${kandidat.dana_od_praznjenja} dana`,
      ].join(', ')),
      '',
      'OTVORENE PRIJAVE U BLIZINI (duplikat_od sme da bude samo jedna od ovih ili null)',
      kontekst.duplikati.length === 0 ? '(nema)' : '',
      ...kontekst.duplikati.map((kandidat) => [
        `- id: ${kandidat.id}`,
        `kod: ${kandidat.kratki_kod}`,
        `tip: ${kandidat.tip}`,
        kandidat.rastojanje_m === null ? 'rastojanje: (nepoznato)' : `rastojanje: ${kandidat.rastojanje_m} m`,
        `pre ${kandidat.sati_ranije} h`,
        `opis: ${kandidat.opis ?? '(nema)'}`,
      ].join(', ')),
    ];
    return redovi.filter((red) => red !== '').join('\n');
  }

  private procitaj(sadrzaj: string): KlasifikacijaPredlog {
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(sadrzaj) as Record<string, unknown>;
    } catch {
      throw new Error(`Odgovor modela nije JSON: ${sadrzaj.slice(0, 200)}`);
    }

    const pouzdanost = typeof raw.pouzdanost === 'number' && Number.isFinite(raw.pouzdanost) ? raw.pouzdanost : 0;
    const obrazlozenje = typeof raw.obrazlozenje === 'string' ? raw.obrazlozenje.trim() : '';

    if (obrazlozenje.length === 0) this.logger.warn('Model vratio klasifikaciju bez obrazlozenja');

    return {
      tip: raw.tip as KlasifikacijaPredlog['tip'],
      podkategorija: raw.podkategorija as KlasifikacijaPredlog['podkategorija'],
      velicina: (raw.velicina ?? null) as KlasifikacijaPredlog['velicina'],
      tip_obrade: raw.tip_obrade as KlasifikacijaPredlog['tip_obrade'],
      // The schema pins the enum, but a clamp costs nothing and a priority of 0
      // would fail a CHECK constraint several layers away from here.
      prioritet: Math.min(5, Math.max(1, Math.round(Number(raw.prioritet) || 3))),
      kontejner_id: typeof raw.kontejner_id === 'string' ? raw.kontejner_id : null,
      duplikat_od: typeof raw.duplikat_od === 'string' ? raw.duplikat_od : null,
      pouzdanost: Math.min(1, Math.max(0, pouzdanost)),
      obrazlozenje: obrazlozenje.slice(0, 1000),
    };
  }
}
