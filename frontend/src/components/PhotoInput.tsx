import { useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useUploadReportPhoto } from '@/data/queries';
import type { PhotoReceipt } from '@/domain/types';
import { cn } from '@/lib/utils';

interface PhotoInputProps {
  value: PhotoReceipt[];
  onChange: (photos: PhotoReceipt[]) => void;
  /** Koliko slika prijava sme da nosi; ugovor ne ograničava, UI drži razumnu meru. */
  max?: number;
}

/**
 * Ista granica kao `STORAGE_MAX_BYTES` na backendu (docs/media-storage.md).
 * Provera ovde štedi upload koji bi svakako dobio 413 — na seoskoj mreži to
 * je razlika između „ne može“ odmah i minut čekanja pa „ne može“.
 */
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Fotografija iz čarobnjaka za prijavu. Otprema se odmah na
 * `POST /reports/photos`, a prijava koja sledi preuzima dobijeni `foto_id`.
 * Slika nikad ne ide direktno u object store — bajtovi prolaze kroz API,
 * front nema ključ (docs/media-storage.md).
 *
 * Fotografija je opciona na svakom kanalu: prijava bez nje je potpuna prijava.
 */
export function PhotoInput({ value, onChange, max = 3 }: PhotoInputProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const upload = useUploadReportPhoto();
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error('Fotografija je prevelika', { description: 'Najviše 8 MB. Smanji rezoluciju u kameri pa pokušaj ponovo.' });
      return;
    }
    // Lokalni pregled dok upload traje, da se vidi šta se šalje.
    const url = URL.createObjectURL(file);
    setPreview(url);
    upload.mutate(file, {
      onSuccess: (receipt) => onChange([...value, receipt]),
      // Tip odlučuje backend po sadržaju fajla, ne po ekstenziji: HEIC sa
      // iPhone-a prolazi, preimenovan PDF ne — poruka dolazi iz statusa (415/413).
      onError: (error) => toast.error('Fotografija nije otpremljena', { description: error.message }),
      onSettled: () => {
        URL.revokeObjectURL(url);
        setPreview(null);
      },
    });
  };

  const remove = (fotoId: string) => onChange(value.filter((p) => p.foto_id !== fotoId));

  const canAdd = value.length + (preview ? 1 : 0) < max && !upload.isPending;

  return (
    <div className="space-y-3">
      {value.length > 0 || preview ? (
        <ul className={cn('grid gap-2', value.length + (preview ? 1 : 0) > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
          {value.map((photo, i) => (
            <li key={photo.foto_id} className="relative overflow-hidden rounded-xl border">
              <img src={photo.javni_url} alt={`Fotografija prijave ${i + 1}`} className="h-40 w-full object-cover" />
              <Button
                type="button"
                size="icon-sm"
                variant="secondary"
                className="absolute top-2 right-2 shadow-md"
                onClick={() => remove(photo.foto_id)}
              >
                <X />
                <span className="sr-only">Ukloni fotografiju</span>
              </Button>
            </li>
          ))}
          {preview ? (
            <li className="relative overflow-hidden rounded-xl border">
              <img src={preview} alt="Fotografija se otprema" className="h-40 w-full object-cover opacity-60" />
              <span className="absolute inset-0 flex items-center justify-center gap-2 bg-background/40 text-sm font-medium">
                <Loader2 className="size-4 animate-spin" /> Otpremam…
              </span>
            </li>
          ) : null}
        </ul>
      ) : null}

      {canAdd ? (
        <div className="grid grid-cols-2 gap-3">
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-8 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Camera className="size-6" />
            Slikaj
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-8 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <ImagePlus className="size-6" />
            Iz galerije
          </button>
        </div>
      ) : null}

      {value.length > 0 && !upload.isPending ? (
        <p className="text-xs text-muted-foreground">
          {value.length === 1 ? 'Fotografija je otpremljena' : `${value.length} fotografije su otpremljene`}
          {value.length < max ? ` · možeš dodati još ${max - value.length}` : ''}.
        </p>
      ) : null}
    </div>
  );
}
