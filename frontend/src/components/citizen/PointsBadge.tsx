import { Leaf } from 'lucide-react';
import { Link } from 'react-router';
import { useMyCommunityProfile } from '@/data/queries';
import { cn } from '@/lib/utils';

/**
 * Bodovi građanina kao pilula sa listom, uvek gore desno — isti obrazac kao
 * u referentnim aplikacijama, pa se stanje vidi bez ulaska u profil. Dok se
 * učitava, pilula je prazna a ne skrivena, da zaglavlje ne skače.
 */
export function PointsBadge({ className }: { className?: string }) {
  const { data } = useMyCommunityProfile();
  return (
    <Link
      to="/gradjanin/profil"
      aria-label={data ? `${data.points} bodova — otvori profil` : 'Otvori profil'}
      className={cn(
        'inline-flex h-10 items-center gap-1.5 rounded-full bg-card pr-1.5 pl-3.5 text-sm font-semibold tabular-nums shadow-sm ring-1 ring-foreground/5 transition-colors hover:bg-muted',
        className,
      )}
    >
      <span className="min-w-6 text-right">{data?.points ?? ''}</span>
      <span className="flex size-7 items-center justify-center rounded-full bg-sour-apple text-forest">
        <Leaf className="size-4" />
      </span>
    </Link>
  );
}
