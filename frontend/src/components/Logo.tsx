import { cn } from '@/lib/utils';

interface LogoMarkProps {
  className?: string;
}

/**
 * Znak aplikacije: pin lokacije sa kantom i dva luka signala iznad — kontejner
 * koji zna gde je i javlja se (senzor + mapa). Vektor je precrtan iz logotipa
 * u boje palete: pin i signal su `forest`, kanta tamnozelena (`secondary-foreground`),
 * pa znak prati i dark temu bez posebne verzije. Isti crtež je i u
 * `public/favicon.svg` — kad se jedan menja, menja se i drugi.
 */
export function LogoMark({ className }: LogoMarkProps) {
  return (
    <svg viewBox="0 0 64 66" aria-hidden className={cn('shrink-0', className)}>
      {/* signal */}
      <path d="M18 9a19 19 0 0 1 28 0" fill="none" className="stroke-forest" strokeWidth="4" strokeLinecap="round" />
      <path d="M24 14a10 10 0 0 1 16 0" fill="none" className="stroke-forest" strokeWidth="4" strokeLinecap="round" />
      {/* pin: krug r=20 sa kratkim vrhom, kao na logotipu — ne izduženi marker */}
      <path d="M32 64C32 64 12 48 12 36a20 20 0 0 1 40 0C52 48 32 64 32 64Z" className="fill-forest" />
      <circle cx="32" cy="36" r="13" className="fill-card" />
      {/* kanta */}
      <rect x="29.5" y="27.5" width="5" height="2.4" rx="1" className="fill-secondary-foreground" />
      <rect x="24.5" y="29.9" width="15" height="2.8" rx="1.4" className="fill-secondary-foreground" />
      <path d="M26.5 34.2h11l-1.2 10.4a1.7 1.7 0 0 1-1.7 1.5h-5.2a1.7 1.7 0 0 1-1.7-1.5Z" className="fill-secondary-foreground" />
      <path d="M30.3 37.2v5.6M33.7 37.2v5.6" className="stroke-card" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

interface LogoProps {
  /** Visina znaka; naziv se skalira uz njega. */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Optički centar znaka je centar kruga pina (y = 36 od 66), niže od
 * geometrijske sredine jer signal iznad diže gornju ivicu. Tekst se zato
 * spušta za tu razliku (~9% visine znaka), inače „lebdi“ iznad pina.
 */
const SIZE = {
  sm: { mark: 'h-8', text: 'text-lg translate-y-[3px]' },
  md: { mark: 'h-10', text: 'text-xl translate-y-[4px]' },
  lg: { mark: 'h-16', text: 'text-3xl translate-y-[6px]' },
};

/** Znak + naziv: „(n)e“ u zelenoj, „Otpad“ u tamnozelenoj, kao na logotipu. */
export function Logo({ size = 'md', className }: LogoProps) {
  const s = SIZE[size];
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark className={s.mark} />
      <span className={cn('font-bold tracking-tight leading-none', s.text)}>
        <span className="text-forest">(n)e</span>
        <span className="text-secondary-foreground">Otpad</span>
      </span>
    </span>
  );
}
