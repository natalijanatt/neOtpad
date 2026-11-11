import { Globe, Mail, Phone, Recycle, SearchX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Collector, DefaultContact, DisposalSuggestion, WasteMaterial } from '@/domain/types';
import { formatPhone } from '@/lib/format';
import { WASTE_MATERIAL_LABEL } from '@/lib/labels';
import { cn } from '@/lib/utils';

/**
 * Kad nijedno mesto na mapi ne prima ono što je traženo: sakupljači sekundarnih
 * sirovina koji to preuzimaju, pa uvek na kraju deponija.
 *
 * Broj je veliko dugme preko cele širine — poziv je put kojim se ovo zaista
 * završava, a na selu ga često obavlja neko ko ne gađa sitne linkove.
 */
export function CollectorsDialog({ result, onClose }: { result: DisposalSuggestion | null; onClose: () => void }) {
  const materijal = result?.materijal ?? null;
  const Icon = materijal ? Recycle : SearchX;

  return (
    <Dialog open={result !== null} onOpenChange={(open) => (open ? null : onClose())}>
      {/* Centriranje preko `inset-0` + `m-auto` + `h-fit`, ne preko translate-a:
          sa -translate-y-1/2 visok sadržaj i animacija otvaranja spuštaju prozor
          ispod sredine ekrana. Ovako je prozor u sredini bez obzira na visinu, a
          sadržaj se skroluje unutar max-h. `grid-cols-1` (minmax(0,1fr)) ne dâ
          koloni da se raširi preko ivice; 3rem ostavlja vidljivu marginu. */}
      <DialogContent className="inset-0 m-auto h-fit max-h-[85dvh] max-w-[calc(100%-3rem)] translate-x-0 translate-y-0 grid-cols-1 gap-5 overflow-x-hidden overflow-y-auto p-5">
        <DialogHeader className="items-center gap-1.5 text-center">
          <span
            className={cn(
              'flex size-11 items-center justify-center rounded-full',
              materijal ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
            )}
          >
            <Icon className="size-5" />
          </span>
          <DialogTitle className="text-base text-pretty break-words">
            {materijal ? `Za „${WASTE_MATERIAL_LABEL[materijal]}“ nema mesta na mapi` : 'Nismo prepoznali šta želiš da odložiš'}
          </DialogTitle>
          <DialogDescription className="text-pretty">
            {materijal
              ? 'Ovo preuzimaju sakupljači sekundarnih sirovina. Pozovi i dogovori preuzimanje.'
              : 'Pokušaj drugim rečima (npr. „stari šporet“, „gvožđe“), ili pitaj deponiju.'}
          </DialogDescription>
        </DialogHeader>

        {materijal ? (
          result?.sakupljaci.length ? (
            <ul className="space-y-3">
              {result.sakupljaci.map((c) => (
                <CollectorCard key={c.id} collector={c} searched={materijal} />
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground text-pretty">
              Trenutno nemamo sakupljača za ovu vrstu otpada. Deponija ispod zna gde ovo može da se preda.
            </p>
          )
        ) : null}

        {result ? <ContactCard contact={result.kontakt} /> : null}
      </DialogContent>
    </Dialog>
  );
}

/** Ime, pa šta preuzima, pa broj — tim redom, jedno ispod drugog. */
function CollectorCard({ collector, searched }: { collector: Collector; searched: WasteMaterial }) {
  return (
    <li className="min-w-0 space-y-2.5 rounded-xl border p-4">
      <p className="truncate font-medium">
        {collector.ime} {collector.prezime}
      </p>
      {/* Traženi materijal je istaknut: odmah se vidi zašto je ovaj sakupljač tu. */}
      <div className="flex flex-wrap gap-1.5">
        {collector.materijali.map((m) => (
          <Badge key={m} variant={m === searched ? 'default' : 'secondary'}>
            {WASTE_MATERIAL_LABEL[m]}
          </Badge>
        ))}
      </div>
      <Button asChild variant="outline" className="w-full justify-start">
        <a href={`tel:${collector.telefon}`} aria-label={`Pozovi ${collector.ime} ${collector.prezime}`}>
          <Phone />
          <span className="truncate">{formatPhone(collector.telefon)}</span>
        </a>
      </Button>
    </li>
  );
}

/** Uvek na kraju: ono što lista ne pokriva, deponija zna. */
function ContactCard({ contact }: { contact: DefaultContact }) {
  return (
    <div className="min-w-0 space-y-2.5 rounded-xl bg-muted/60 p-4">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">Za sve ostalo</p>
        <p className="font-medium text-pretty">{contact.naziv}</p>
      </div>
      <div className="grid gap-2">
        <Button asChild variant="outline" className="w-full justify-start bg-background">
          <a href={`tel:${contact.telefon}`}>
            <Phone />
            <span className="truncate">{formatPhone(contact.telefon)}</span>
          </a>
        </Button>
        <Button asChild variant="outline" className="w-full justify-start bg-background">
          <a href={`mailto:${contact.email}`}>
            <Mail />
            <span className="truncate">{contact.email}</span>
          </a>
        </Button>
        <Button asChild variant="ghost" className="w-full justify-start">
          <a href={contact.sajt} target="_blank" rel="noreferrer">
            <Globe />
            <span className="truncate">{contact.sajt.replace(/^https?:\/\//, '')}</span>
          </a>
        </Button>
      </div>
    </div>
  );
}
