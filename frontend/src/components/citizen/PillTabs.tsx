import { cn } from '@/lib/utils';

interface PillTabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  label: string;
  className?: string;
}

/**
 * Segmentirana kontrola u obliku pilule: aktivna opcija je bela „kapsula“ na
 * svetlozelenoj traci. Zamena za shadcn `Tabs` na građanskim ekranima, gde se
 * njome samo filtrira lista (nema `TabsContent`), pa je i semantički radio grupa.
 */
export function PillTabs<T extends string>({ value, onChange, options, label, className }: PillTabsProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex rounded-full bg-muted p-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex-1 truncate rounded-full px-3 py-2 text-sm font-medium transition-all',
              active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
