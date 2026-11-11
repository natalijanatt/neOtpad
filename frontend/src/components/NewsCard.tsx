import { type ReactNode, useState } from 'react';
import {
  CalendarClock,
  GraduationCap,
  Heart,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  Pin,
  Share2,
  Trash2,
  Truck,
} from 'lucide-react';
import { toast } from 'sonner';
import type { NewsCategory, NewsItem } from '@/domain/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import { NEWS_CATEGORY_LABEL } from '@/lib/labels';
import { NEWS_CATEGORY_CLASS } from '@/lib/news';
import { cn } from '@/lib/utils';

const CATEGORY_ICON: Record<NewsCategory, typeof Megaphone> = {
  obavestenje: Megaphone,
  akcija: Trash2,
  raspored: Truck,
  edukacija: GraduationCap,
};

/** Duži tekst se u feedu skraćuje; granica je otprilike četiri reda na telefonu. */
const CLAMP_CHARS = 260;

interface NewsCardProps {
  item: NewsItem;
  /** Naziv naselja na koje se objava odnosi; izostavljen znači „cela opština“. */
  settlementName?: string | undefined;
  /** Dugmad administratora (izmeni, zakači, obriši); građanin ih ne dobija. */
  actions?: ReactNode;
  /** Pregled u formi prikazuje ceo tekst — tamo skraćivanje samo smeta. */
  expanded?: boolean;
  /** Red sa lajkovima, komentarima i deljenjem — građanski feed, ne operativa. */
  social?: boolean;
  className?: string;
}

/**
 * Objava u feedu. Isti oblik vidi i građanin i administrator (u pregledu forme),
 * pa nema dva prikaza koji se razilaze.
 */
export function NewsCard({ item, settlementName, actions, expanded = false, social = false, className }: NewsCardProps) {
  const [open, setOpen] = useState(expanded);
  const Icon = CATEGORY_ICON[item.kategorija];
  const category = NEWS_CATEGORY_CLASS[item.kategorija];
  const long = item.sadrzaj.length > CLAMP_CHARS;
  const showAll = open || expanded;

  return (
    // `id` je sidro za podeljeni link (`/gradjanin/vesti#vest-…`); scroll-mt
    // ostavlja razmak da kartica ne završi zalepljena za ivicu ekrana.
    <Card id={newsAnchor(item.id)} className={cn('scroll-mt-4 gap-3', className)}>
      <header className="flex items-start gap-3 px-(--card-spacing)">
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', category.bg, category.text)}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.autor}</p>
          <p className="truncate text-xs text-muted-foreground">
            <time dateTime={item.objavljena_at} title={formatDateTime(item.objavljena_at)}>
              {formatRelative(item.objavljena_at)}
            </time>
            {' · '}
            {settlementName ?? 'Cela opština'}
          </p>
        </div>
        {item.zakacena ? (
          <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 text-xs font-medium text-primary">
            <Pin className="size-3" />
            Zakačeno
          </span>
        ) : null}
      </header>

      <div className="space-y-1.5 px-(--card-spacing)">
        <h3 className="font-heading text-base leading-snug font-medium text-balance">{item.naslov}</h3>
        <p className={cn('text-sm whitespace-pre-line text-pretty', !showAll && long && 'line-clamp-4')}>{item.sadrzaj}</p>
        {long && !expanded ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs font-medium text-primary"
            aria-expanded={open}
          >
            {open ? 'Prikaži manje' : 'Pročitaj celu vest'}
          </button>
        ) : null}
      </div>

      {item.slika_url ? (
        <img src={item.slika_url} alt="" className="max-h-72 w-full object-cover" loading="lazy" />
      ) : null}

      <footer className="flex flex-wrap items-center gap-2 px-(--card-spacing) text-xs text-muted-foreground">
        <span className={cn('inline-flex h-5 items-center rounded-full px-2 font-medium', category.bg, category.text)}>
          {NEWS_CATEGORY_LABEL[item.kategorija]}
        </span>
        {/* Feed je samo jedan kanal: selo bez pametnog telefona istu vest dobija
            SMS-om ili preko predsednika MZ, pa se to i vidi na objavi. */}
        {item.sms_tekst ? (
          <span className="inline-flex items-center gap-1" title={item.sms_tekst}>
            <MessageSquareText className="size-3.5" />
            Poslato i SMS-om/Viberom
          </span>
        ) : null}
        {item.azurirana_at ? (
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="size-3.5" />
            Izmenjeno {formatRelative(item.azurirana_at)}
          </span>
        ) : null}
        {actions ? <span className="ml-auto flex items-center gap-1">{actions}</span> : null}
      </footer>

      {social && item.engagement ? <SocialRow item={item} likes={item.engagement.likes} comments={item.engagement.comments} /> : null}
    </Card>
  );
}

/** Sidro objave u feedu; isto ga koristi i link za deljenje i skrol na njega. */
export function newsAnchor(id: string): string {
  return `vest-${id}`;
}

/**
 * Lajk, komentari i deljenje. Brojevi su demo (vidi `NewsEngagement`): lajk se
 * menja samo na ovom ekranu i ne preživljava osvežavanje, jer backend reakcije
 * nema i ne sme da izgleda kao da ih čuva.
 */
function SocialRow({ item, likes, comments }: { item: NewsItem; likes: number; comments: number }) {
  const [liked, setLiked] = useState(false);

  return (
    // Dugmad nose sopstveni padding, pa ih tanke margine vraćaju u ravan sa
    // tekstom objave iznad; bez toga srce „visi“ uvučeno za ceo padding.
    <div className="flex items-center gap-0.5 border-t px-(--card-spacing) pt-2 text-muted-foreground">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setLiked((v) => !v)}
        aria-pressed={liked}
        aria-label={liked ? 'Ukloni sviđanje' : 'Sviđa mi se'}
        className={cn('-ml-1.5 px-1.5', liked && 'text-destructive hover:text-destructive')}
      >
        <Heart className={cn(liked && 'fill-current')} />
        {formatNumber(likes + (liked ? 1 : 0))}
      </Button>

      {/* Samo broj: komentara još nema odakle da se otvore, a dugme koje ništa
          ne radi je gore od brojača koji ne obećava klik. Iste mere kao dugme
          pored, da ikone i brojevi stoje u istoj liniji. */}
      <span className="inline-flex h-7 items-center gap-1 px-1.5 text-[0.8rem]" aria-label={`${comments} komentara`}>
        <MessageCircle className="size-3.5" />
        {formatNumber(comments)}
      </span>

      <Button variant="ghost" size="sm" className="-mr-1.5 ml-auto px-1.5" onClick={() => void shareNews(item)}>
        <Share2 /> Podeli
      </Button>
    </div>
  );
}

/**
 * Deljenje objave. Na telefonu otvara sistemski meni (Viber, WhatsApp, SMS) —
 * to je upravo put kojim vest stiže do komšije bez aplikacije. Gde toga nema
 * (desktop), link se kopira.
 *
 * Tekst je `sms_tekst` kad postoji: napisan je za telefon i već staje u jednu
 * poruku, pa je bolji od prvih 140 znakova tela.
 */
async function shareNews(item: NewsItem): Promise<void> {
  const url = `${window.location.origin}/gradjanin/vesti#${newsAnchor(item.id)}`;
  const text = item.sms_tekst ?? `${item.sadrzaj.replace(/\s+/g, ' ').slice(0, 140).trim()}…`;

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: item.naslov, text, url });
    } catch (error) {
      // Zatvoren meni nije greška — korisnik se predomislio.
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toast.error('Deljenje nije uspelo', { description: 'Pokušaj ponovo ili kopiraj link iz adresne trake.' });
      }
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(`${item.naslov}\n${text}\n${url}`);
    toast.success('Link je kopiran', { description: 'Nalepi ga u Viber, SMS ili bilo gde.' });
  } catch {
    // Clipboard traži bezbedan kontekst (https ili localhost) i dozvolu.
    toast.error('Kopiranje nije uspelo', { description: url });
  }
}
