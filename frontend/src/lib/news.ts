import type { NewsCategory, NewsInput, NewsItem, Staff } from '@/domain/types';

/**
 * Pravila feeda vesti koja UI mora da zna. Redosled (zakačene prvo, pa
 * najnovije) više nije ovde — njega pravi baza i stiže gotov iz `GET /news`.
 */

/**
 * Ko sme da dodaje, menja, briše i kači objave. Backend isto proverava
 * (`AdminOnly`, docs/news-feed.md); ovde stoji da bi dugmad bila skrivena
 * umesto da vrate 403. Jedino mesto koje treba dirati ako se pravo proširi.
 */
export function canManageNews(staff: Staff | null | undefined): boolean {
  return staff?.uloga === 'admin';
}

/**
 * Dužina jedne SMS poruke. Ista pravila kao na backendu
 * (`backend/src/news/news.sms.ts`): GSM-7 nosi 160 znakova, ali jedno č/ć/š/ž/đ
 * prebacuje poruku u UCS-2 i granica pada na 70. JKP plaća po poruci i po
 * naselju, pa forma to mora da kaže pre slanja, a ne da sačeka 400 sa servera.
 */
const SINGLE_BYTE = /^[\n\r\x20-\x7E]*$/;

export const SMS_LIMIT_GSM7 = 160;
export const SMS_LIMIT_UNICODE = 70;

export function smsLimit(text: string): number {
  return SINGLE_BYTE.test(text) ? SMS_LIMIT_GSM7 : SMS_LIMIT_UNICODE;
}

export const NEWS_CATEGORY_CLASS: Record<NewsCategory, { bg: string; text: string }> = {
  obavestenje: { bg: 'bg-muted', text: 'text-muted-foreground' },
  akcija: { bg: 'bg-rose/15', text: 'text-destructive' },
  raspored: { bg: 'bg-sour-apple', text: 'text-forest' },
  edukacija: { bg: 'bg-sunflower/40', text: 'text-warning-foreground' },
};

/**
 * Podrazumevani potpis objave. Vest potpisuje služba, a ne radnik koji je
 * kucao — građanin zove JKP, ne dispečera po imenu. Backend upisuje isto kad
 * polje izostane; ovde stoji da forma ne bude prazna.
 */
export const DEFAULT_NEWS_AUTHOR = 'JKP Komunalac Pirot';

/** Stanje forme: ista polja kao telo `POST /news`, samo uvek popunjena. */
export interface NewsForm {
  naslov: string;
  sadrzaj: string;
  slika_url: string;
  kategorija: NewsCategory;
  naselje_id: string | null;
  zakacena: boolean;
  sms_tekst: string;
  autor: string;
}

export function emptyNewsForm(): NewsForm {
  return {
    naslov: '',
    sadrzaj: '',
    slika_url: '',
    kategorija: 'obavestenje',
    naselje_id: null,
    zakacena: false,
    sms_tekst: '',
    autor: DEFAULT_NEWS_AUTHOR,
  };
}

/** Postojeća objava prebačena u oblik forme; `null` iz API-ja postaje prazno polje. */
export function newsFormFrom(item: NewsItem): NewsForm {
  return {
    naslov: item.naslov,
    sadrzaj: item.sadrzaj,
    slika_url: item.slika_url ?? '',
    kategorija: item.kategorija,
    naselje_id: item.naselje_id,
    zakacena: item.zakacena,
    sms_tekst: item.sms_tekst ?? '',
    autor: item.autor,
  };
}

/**
 * Forma → telo zahteva. Prazno polje postaje `null`, što je za backend brisanje
 * vrednosti, a ne „ostavi kako je“ (docs/news-feed.md).
 */
export function newsInputFrom(form: NewsForm): NewsInput {
  return {
    naslov: form.naslov.trim(),
    sadrzaj: form.sadrzaj.trim(),
    slika_url: form.slika_url.trim() || null,
    kategorija: form.kategorija,
    naselje_id: form.naselje_id,
    zakacena: form.zakacena,
    sms_tekst: form.sms_tekst.trim() || null,
    autor: form.autor.trim() || DEFAULT_NEWS_AUTHOR,
  };
}

/**
 * Predlog SMS teksta iz naslova i prve rečenice tela. Samo predlog — tekst koji
 * ide na telefon bez interneta zaslužuje da ga čovek pročita pre slanja.
 */
export function suggestSmsText(naslov: string, sadrzaj: string): string {
  const firstSentence = sadrzaj.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0] ?? '';
  const draft = `${naslov.trim()}${firstSentence ? `: ${firstSentence}` : ''}`;
  return draft.slice(0, smsLimit(draft));
}
