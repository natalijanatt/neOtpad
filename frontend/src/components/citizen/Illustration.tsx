import { useEffect, useRef, useState, type ComponentType } from 'react';
import { cn } from '@/lib/utils';

interface IllustrationProps {
  /**
   * Ime fajla u `public/illustrations/<name>.png` — spisak i promptovi za
   * generisanje su u `public/illustrations/README.md`.
   */
  name: string;
  /** Ikonica koja stoji dok slika ne postoji (ili ne uspe da se učita). */
  fallback: ComponentType<{ className?: string }>;
  className?: string;
  /** Veličina ikonice u fallback-u; sama slika prati `className`. */
  iconClassName?: string;
  /**
   * Fallback bez sopstvene podloge — samo ikonica. Za mesta koja već imaju
   * obojenu pločicu (tip prijave), da se ne dobiju dve pozadine.
   */
  plain?: boolean;
}

/**
 * Mesto za ilustraciju u stilu referentnih aplikacija (lik pored kontejnera,
 * kamion, mapa...). Slike se generišu naknadno, pa komponenta bez fajla ne
 * sme da ostavi rupu: prikazuje isti oblik sa lucide ikonicom u boji.
 */
export function Illustration({ name, fallback: Fallback, className, iconClassName, plain = false }: IllustrationProps) {
  // Dok se ne zna da li slika postoji, `img` je nevidljiv: inače pregledač
  // na tren pokaže ikonicu „slomljene slike“ pre nego što stigne `error`.
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading');
  const ref = useRef<HTMLImageElement>(null);

  // Keširana slika može da bude gotova pre nego što se `onLoad` zakači, pa
  // `load` nikad ne stigne i slika ostane nevidljiva — proveri stanje odmah.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete) setState(img.naturalWidth > 0 ? 'ok' : 'missing');
  }, []);

  if (state === 'missing') {
    if (plain) return <Fallback className={cn('size-5', iconClassName)} />;
    return (
      <span className={cn('relative flex items-center justify-center overflow-hidden rounded-3xl bg-sour-apple', className)}>
        <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 size-full">
          <path d="M100 0v100C45 100 0 55 0 0h100Z" className="fill-jade/60" />
        </svg>
        <Fallback className={cn('relative size-1/2 text-forest', iconClassName)} />
      </span>
    );
  }

  return (
    <img
      ref={ref}
      src={`/illustrations/${name}.png`}
      alt=""
      className={cn('object-contain transition-opacity', state === 'loading' && 'opacity-0', className)}
      onLoad={() => setState('ok')}
      onError={() => setState('missing')}
      loading="lazy"
    />
  );
}
