import type { ComponentType } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

export type TileTone = 'forest' | 'jade' | 'sunflower' | 'rose' | 'apple';

/** `mutedBg` je ista boja na 85% — tiša podloga, a tekst i ikonica ostaju puni. */
const TONE_CLASS: Record<TileTone, { bg: string; mutedBg: string; icon: string }> = {
  forest: { bg: 'bg-forest text-primary-foreground', mutedBg: 'bg-forest/85 text-primary-foreground', icon: 'bg-white/20 text-white' },
  jade: { bg: 'bg-jade text-[#1F3A2A]', mutedBg: 'bg-jade/85 text-[#1F3A2A]', icon: 'bg-white/45 text-forest' },
  sunflower: { bg: 'bg-sunflower text-warning-foreground', mutedBg: 'bg-sunflower/85 text-warning-foreground', icon: 'bg-white/45 text-warning-foreground' },
  rose: { bg: 'bg-rose text-white', mutedBg: 'bg-rose/85 text-white', icon: 'bg-white/25 text-white' },
  apple: { bg: 'bg-sour-apple text-secondary-foreground', mutedBg: 'bg-sour-apple/85 text-secondary-foreground', icon: 'bg-white/60 text-forest' },
};

interface TileProps {
  to: string;
  label: string;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
  tone: TileTone;
  /**
   * `bold` — cela pločica u boji (za primarne radnje); `soft` — bela kartica,
   * boja samo na ikonici. Tiša varijanta se ne pravi prozirnošću: opacity
   * spušta kontrast teksta i pločica deluje onemogućeno, a ne sekundarno.
   */
  variant?: 'bold' | 'soft';
  /** Tiša podloga (85%) za sekundarne pločice; tekst ostaje pune boje. */
  muted?: boolean;
  className?: string;
}

/** Pločica za brzu akciju: ikonica u krugu, naziv i kratak opis. */
export function Tile({ to, label, hint, icon: Icon, tone, variant = 'bold', muted = false, className }: TileProps) {
  const t = TONE_CLASS[tone];
  if (variant === 'soft') {
    return (
      <Link
        to={to}
        className={cn(
          'flex min-h-24 flex-col justify-between rounded-3xl bg-card p-4 shadow-sm ring-1 ring-foreground/5 transition-transform active:scale-[0.98]',
          className,
        )}
      >
        <span className={cn('flex size-9 items-center justify-center rounded-full', t.bg)}>
          <Icon className="size-4.5" />
        </span>
        <span className="mt-3">
          <span className="block text-sm leading-tight font-semibold">{label}</span>
          {hint ? <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span> : null}
        </span>
      </Link>
    );
  }
  return (
    <Link
      to={to}
      className={cn(
        'group relative flex min-h-28 flex-col justify-between overflow-hidden rounded-3xl p-4 shadow-sm transition-transform active:scale-[0.98]',
        muted ? t.mutedBg : t.bg,
        className,
      )}
    >
      <svg aria-hidden viewBox="0 0 100 100" className="absolute -right-6 -bottom-8 size-28 opacity-25">
        <path d="M100 0v100C45 100 0 55 0 0h100Z" fill="currentColor" />
      </svg>
      <span className={cn('relative flex size-10 items-center justify-center rounded-full', t.icon)}>
        <Icon className="size-5" />
      </span>
      <span className="relative">
        <span className="block text-base leading-tight font-semibold">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs opacity-80">{hint}</span> : null}
      </span>
    </Link>
  );
}
