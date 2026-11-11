import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MessageSquareText, Pin, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { isConflict } from '@/api/errors';
import { NewsCard } from '@/components/NewsCard';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateNews, useSettlementOptions, useUpdateNews } from '@/data/queries';
import type { NewsCategory, NewsItem } from '@/domain/types';
import { NEWS_CATEGORY_LABEL } from '@/lib/labels';
import { DEFAULT_NEWS_AUTHOR, emptyNewsForm, newsFormFrom, newsInputFrom, smsLimit, suggestSmsText, type NewsForm } from '@/lib/news';
import { cn } from '@/lib/utils';

const CATEGORIES = Object.keys(NEWS_CATEGORY_LABEL) as NewsCategory[];

/** Vrednost za „cela opština“ u `Select`-u; radix ne prima prazan string. */
const ALL_SETTLEMENTS = 'sve';

interface NewsFormDialogProps {
  open: boolean;
  /** Postojeća objava koja se menja; `null` znači nova objava. */
  item: NewsItem | null;
  onClose: () => void;
}

/**
 * Forma za objavljivanje i izmenu vesti. Pregled pored forme je ista komponenta
 * koju vidi građanin, pa se „kako ovo izgleda u feedu“ ne pogađa.
 */
export function NewsFormDialog({ open, item, onClose }: NewsFormDialogProps) {
  const client = useQueryClient();
  const create = useCreateNews();
  const update = useUpdateNews();
  const { data: settlements } = useSettlementOptions();
  const busy = create.isPending || update.isPending;

  const [form, setForm] = useState<NewsForm>(() => (item ? newsFormFrom(item) : emptyNewsForm()));

  // Dijalog se ne demontira između objava, pa se polja pune kad se promeni
  // objava koja se menja — inače bi „Nova objava“ zadržala prošli tekst.
  useEffect(() => {
    if (open) setForm(item ? newsFormFrom(item) : emptyNewsForm());
  }, [open, item]);

  const set = <K extends keyof NewsForm>(key: K, value: NewsForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const smsLength = form.sms_tekst.length;
  const limit = smsLimit(form.sms_tekst);
  const smsTooLong = smsLength > limit;
  const canSubmit = form.naslov.trim().length >= 3 && form.sadrzaj.trim().length >= 3 && !smsTooLong;

  const onError = (error: Error) => {
    if (isConflict(error)) {
      void client.invalidateQueries({ queryKey: ['news'] });
      toast.error('Objava je u međuvremenu izmenjena', { description: 'Lista je osvežena — otvori je ponovo i ponovi izmenu.' });
      onClose();
      return;
    }
    toast.error('Objava nije sačuvana', { description: error.message });
  };

  const submit = () => {
    if (!canSubmit) return;
    const payload = newsInputFrom(form);

    if (item) {
      // Verzija iz poslednjeg čitanja: backend njome prepoznaje zastarelu izmenu.
      update.mutate(
        { id: item.id, verzija: item.verzija, ...payload },
        {
          onSuccess: () => {
            toast.success('Izmene su sačuvane', { description: 'Građani vide izmenjenu objavu u feedu.' });
            onClose();
          },
          onError,
        },
      );
      return;
    }

    create.mutate(payload, {
      onSuccess: () => {
        toast.success('Vest je objavljena', {
          description: payload.sms_tekst ? 'Ide u feed i kao SMS/Viber poruka.' : 'Vidljiva je u feedu građana.',
        });
        onClose();
      },
      onError,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{item ? 'Izmena objave' : 'Nova objava'}</DialogTitle>
          <DialogDescription>
            Objava se odmah pojavljuje u feedu građana. Ako se tiče jednog naselja, izaberi ga — ostali je i dalje
            vide, ali u svom naselju imaju filter.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="vest-naslov">Naslov</Label>
              <Input
                id="vest-naslov"
                value={form.naslov}
                onChange={(e) => set('naslov', e.target.value)}
                placeholder="npr. Izmena rasporeda odvoza za Krupac"
                maxLength={200}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Kategorija</Label>
                <Select value={form.kategorija} onValueChange={(v) => set('kategorija', v as NewsCategory)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {NEWS_CATEGORY_LABEL[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Naselje</Label>
                <Select
                  value={form.naselje_id ?? ALL_SETTLEMENTS}
                  onValueChange={(v) => set('naselje_id', v === ALL_SETTLEMENTS ? null : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_SETTLEMENTS}>Cela opština</SelectItem>
                    {settlements?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.naziv}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="vest-tekst">Tekst objave</Label>
              <Textarea
                id="vest-tekst"
                value={form.sadrzaj}
                onChange={(e) => set('sadrzaj', e.target.value)}
                rows={8}
                maxLength={5000}
                placeholder="Šta se menja, od kada i šta građanin treba da uradi."
              />
              <p className="text-xs text-muted-foreground">Prazan red pravi novi pasus; feed poštuje prelome.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="vest-potpis">Objavljuje</Label>
              <Input id="vest-potpis" value={form.autor} onChange={(e) => set('autor', e.target.value)} maxLength={120} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="vest-slika">Slika (opciono)</Label>
              {/* Link, ne upload: ugovor za vesti prima URL, jer objekat-storage
                  za slike vesti još ne postoji (docs/news-feed.md). */}
              <Input
                id="vest-slika"
                type="url"
                value={form.slika_url}
                onChange={(e) => set('slika_url', e.target.value)}
                placeholder="https://…/slika.jpg"
              />
              <p className="text-xs text-muted-foreground">Adresa već postavljene slike; upload za vesti još ne postoji.</p>
            </div>

            {/* Kačenje i SMS su jedine dve odluke koje menjaju domet objave,
                pa stoje odvojeno od sadržaja. */}
            <div className="space-y-3 rounded-xl border p-3">
              <label className="flex items-start gap-2.5 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={form.zakacena}
                  onChange={(e) => set('zakacena', e.target.checked)}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span>
                  <span className="flex items-center gap-1.5">
                    <Pin className="size-3.5" />
                    Zakači na vrh feeda
                  </span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground text-pretty">
                    Zakačena objava stoji iznad novijih vesti dok se ne otkači.
                  </span>
                </span>
              </label>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="vest-sms" className="flex items-center gap-1.5">
                    <MessageSquareText className="size-3.5" />
                    SMS / Viber verzija (opciono)
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => set('sms_tekst', suggestSmsText(form.naslov, form.sadrzaj))}
                    disabled={!form.naslov.trim()}
                  >
                    <Wand2 /> Predloži
                  </Button>
                </div>
                <Textarea
                  id="vest-sms"
                  value={form.sms_tekst}
                  onChange={(e) => set('sms_tekst', e.target.value)}
                  rows={3}
                  placeholder="Kratko, bez dijakritike — stiže na telefon bez interneta."
                />
                {/* Granica zavisi od azbuke: jedno č/ć/š/ž/đ pretvara poruku u
                    UCS-2 i 160 znakova postaje 70 (docs/news-feed.md). */}
                <p className={cn('text-xs', smsTooLong ? 'text-destructive' : 'text-muted-foreground')}>
                  {smsLength}/{limit} znakova
                  {limit === 70 ? ' (dijakritika — poruka ide kao UCS-2)' : ''}
                  {smsTooLong
                    ? ' — duži tekst se naplaćuje kao više poruka, skrati ga ili izbaci kvačice.'
                    : ' · prazno znači da vest ostaje samo u aplikaciji'}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Ovako je vidi građanin</p>
            <NewsCard
              expanded
              item={{
                id: item?.id ?? 'pregled',
                naslov: form.naslov.trim() || 'Naslov objave',
                sadrzaj: form.sadrzaj.trim() || 'Tekst objave…',
                slika_url: form.slika_url.trim() || null,
                kategorija: form.kategorija,
                naselje_id: form.naselje_id,
                zakacena: form.zakacena,
                sms_tekst: form.sms_tekst.trim() || null,
                autor: form.autor.trim() || DEFAULT_NEWS_AUTHOR,
                // Nova objava u pregledu nosi sadašnji trenutak; izmena zadržava
                // svoje vreme objave, jer ga izmena i ne pomera.
                objavljena_at: item?.objavljena_at ?? new Date().toISOString(),
                azurirana_at: item?.azurirana_at ?? null,
                verzija: item?.verzija ?? 1,
              }}
              settlementName={settlements?.find((s) => s.id === form.naselje_id)?.naziv}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Otkaži
          </Button>
          <Button onClick={submit} disabled={busy || !canSubmit}>
            {busy ? 'Čuvam…' : item ? 'Sačuvaj izmene' : 'Objavi'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}