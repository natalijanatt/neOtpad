import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

interface ScreenHeaderProps {
  title: string;
  description?: string;
  /** Ruta na koju vodi strelica nazad; bez nje ekran je „koren“ u navigaciji. */
  backTo?: string;
  /** Sadržaj desno od naslova: bedž bodova, filter... */
  aside?: ReactNode;
  className?: string;
}

/**
 * Zaglavlje građanskog ekrana. Krupan naslov levo, okrugla „nazad“ dugmad kao
 * u mobilnim aplikacijama — a ne shadcn `PageHeader`, koji je rađen za
 * desktop operativu.
 */
export function ScreenHeader({ title, description, backTo, aside, className }: ScreenHeaderProps) {
  return (
    <header className={cn('flex items-start gap-3', className)}>
      {backTo ? (
        <Link
          to={backTo}
          aria-label="Nazad"
          className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-card text-foreground shadow-sm ring-1 ring-foreground/5 transition-colors hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </Link>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold tracking-tight text-balance">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground text-pretty">{description}</p> : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </header>
  );
}
