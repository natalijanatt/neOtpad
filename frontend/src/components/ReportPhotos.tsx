import { useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Photo } from '@/domain/types';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

interface ReportPhotosProps {
  photos: Photo[];
  /** Tekst kad prijava nema fotografiju; kanal (SMS, telefon) je čest razlog. */
  emptyText?: string;
  /**
   * Uklanjanje je samo za operativu: bucket je javan i brisanje je jedina
   * zaštita za lice, tablicu ili kućni broj na slici (docs/media-storage.md).
   * Razlog je obavezan i ostaje u istoriji prijave.
   */
  onRemove?: (photo: Photo, razlog: string) => Promise<unknown>;
  className?: string;
}

/** Fotografije prijave iz `fotografije` — javni URL-ovi iz object store-a, najstarija prva. */
export function ReportPhotos({ photos, emptyText = 'Bez fotografije', onRemove, className }: ReportPhotosProps) {
  const [target, setTarget] = useState<Photo | null>(null);
  const [razlog, setRazlog] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    setTarget(null);
    setRazlog('');
  };

  const confirm = async () => {
    if (!target || !onRemove || !razlog.trim()) return;
    setBusy(true);
    try {
      await onRemove(target, razlog.trim());
      close();
    } catch {
      // Poruku o grešci pokazuje pozivalac; dijalog ostaje otvoren da se pokuša ponovo.
    } finally {
      setBusy(false);
    }
  };

  if (photos.length === 0) {
    return (
      <div
        className={cn(
          'flex h-52 items-center justify-center rounded-lg border border-dashed px-4 text-center text-sm text-muted-foreground',
          className,
        )}
      >
        <Camera className="mr-2 size-4 shrink-0" />
        {emptyText}
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <ul className={cn('grid gap-2', photos.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
        {photos.map((photo, i) => (
          <li key={photo.id} className="group relative overflow-hidden rounded-lg border">
            <a href={photo.javni_url} target="_blank" rel="noreferrer">
              <img
                src={photo.javni_url}
                alt={`Fotografija iz prijave ${i + 1}`}
                loading="lazy"
                className={cn('w-full object-cover', photos.length > 1 ? 'h-36' : 'h-52')}
              />
            </a>
            {onRemove ? (
              <Button
                type="button"
                size="icon-sm"
                variant="secondary"
                className="absolute top-2 right-2 shadow-md"
                onClick={() => setTarget(photo)}
              >
                <Trash2 />
                <span className="sr-only">Ukloni fotografiju</span>
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        {photos.length === 1 ? 'Fotografija' : `${photos.length} fotografije`}
        {/* EXIF vreme postoji samo kad ga je uređaj upisao; bez njega se ne izmišlja. */}
        {photos[0]?.snimljeno_at
          ? ` · snimljeno ${formatDateTime(photos[0].snimljeno_at)}`
          : ` · otpremljeno ${formatDateTime(photos[0]!.otpremljena_at)}`}
      </p>

      {onRemove ? (
        <Dialog open={target !== null} onOpenChange={(o) => (o ? null : close())}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ukloni fotografiju</DialogTitle>
              <DialogDescription>
                Slika je javno dostupna svakome sa linkom. Ukloni je ako prikazuje lice, registarsku tablicu ili kućni
                broj — razlog ostaje u istoriji prijave, prijava zadržava verziju.
              </DialogDescription>
            </DialogHeader>
            {target ? (
              <img src={target.javni_url} alt="Fotografija koja se uklanja" className="h-40 w-full rounded-lg object-cover" />
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="razlog-foto">Razlog</Label>
              <Textarea
                id="razlog-foto"
                value={razlog}
                onChange={(e) => setRazlog(e.target.value)}
                rows={2}
                placeholder="npr. Vidi se registarska tablica."
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={close} disabled={busy}>
                Otkaži
              </Button>
              <Button variant="destructive" onClick={confirm} disabled={busy || !razlog.trim()}>
                {busy ? 'Uklanjam…' : 'Ukloni'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
