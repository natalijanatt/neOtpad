import { cn } from '@/lib/utils';

interface BlobsProps {
  /** `hero` — velike forme iza zaglavlja; `corner` — mala u uglu kartice. */
  variant?: 'hero' | 'corner';
  className?: string;
}

/**
 * Organski oblici iz palete („Fresh, Organic & Bright“): zaobljena polovina
 * kruga, list i kap. Čisto dekorativni — `aria-hidden`, bez interakcije — i
 * uvek `absolute`, pa ih roditelj mora postaviti na `relative overflow-hidden`.
 * Boje su tokeni, ne hex, da dark tema ne mora da zna za njih.
 */
export function Blobs({ variant = 'hero', className }: BlobsProps) {
  if (variant === 'corner') {
    return (
      <svg
        aria-hidden
        viewBox="0 0 120 120"
        className={cn('pointer-events-none absolute -top-6 -right-6 size-28 opacity-90', className)}
      >
        <path d="M120 0v120C54 120 0 66 0 0h120Z" className="fill-sour-apple" />
        <path d="M120 40v80c-44 0-80-36-80-80h80Z" className="fill-jade/70" />
      </svg>
    );
  }

  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <svg viewBox="0 0 200 200" className="absolute -top-16 -right-14 size-56">
        <path d="M200 0v200C90 200 0 110 0 0h200Z" className="fill-rose" />
        <path d="M200 70v130c-72 0-130-58-130-130h130Z" className="fill-sunflower" />
      </svg>
      <svg viewBox="0 0 200 200" className="absolute -bottom-32 -left-24 size-52 rotate-12 opacity-50">
        <path d="M0 200V0c110 0 200 90 200 200H0Z" className="fill-sour-apple" />
        <path d="M0 200V90c60 0 110 50 110 110H0Z" className="fill-jade" />
      </svg>
    </div>
  );
}
