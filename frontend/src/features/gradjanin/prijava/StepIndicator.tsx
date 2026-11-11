import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StepIndicatorProps {
  steps: string[];
  current: number;
  /** Klik na već pređeni korak vraća na njega — brže nego tri puta „Nazad“. */
  onStepClick?: (step: number) => void;
}

/** Koraci čarobnjaka na vrhu — broj + naziv, pređeni su čekirani i klikabilni. */
export function StepIndicator({ steps, current, onStepClick }: StepIndicatorProps) {
  return (
    <ol className="flex items-start" aria-label="Koraci prijave">
      {steps.map((label, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;
        const clickable = done && onStepClick !== undefined;
        return (
          <li key={label} className="relative flex flex-1 flex-col items-center gap-1.5">
            {/* Linija ide od ivice ovog kružića do ivice sledećeg (size-7 = 28px,
                poluprečnik 14px) — ne od centra do centra, jer bi tako prolazila
                ISPOD aktivnog kružića, čija je pozadina providna (bg-primary/15)
                i providnost bi otkrila liniju kako „seče“ broj. */}
            {step < steps.length ? (
              <div
                aria-hidden
                className={cn(
                  'absolute top-3.5 left-[calc(50%+14px)] h-0.5 w-[calc(100%-28px)] rounded-full transition-colors',
                  done ? 'bg-primary' : 'bg-muted',
                )}
              />
            ) : null}
            <button
              type="button"
              onClick={clickable ? () => onStepClick(step) : undefined}
              disabled={!clickable}
              aria-current={active ? 'step' : undefined}
              aria-label={`Korak ${step}: ${label}`}
              className={cn(
                'relative z-[1] flex size-7 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                done && 'bg-primary text-primary-foreground',
                active && 'bg-primary/15 text-primary ring-2 ring-primary',
                !done && !active && 'bg-muted text-muted-foreground',
                clickable && 'cursor-pointer hover:bg-primary/85',
                !clickable && 'cursor-default',
              )}
            >
              {done ? <Check className="size-3.5" /> : step}
            </button>
            <span
              className={cn(
                'text-[11px] leading-none',
                active ? 'font-semibold text-foreground' : done ? 'text-foreground/80' : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
