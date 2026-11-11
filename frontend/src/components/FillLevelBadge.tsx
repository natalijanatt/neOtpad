import { FILL_BAND_CLASS, FILL_BAND_LABEL, fillBand } from '@/lib/levels';
import { cn } from '@/lib/utils';

interface FillLevelBadgeProps {
  /** Null je „nema merenja“, ne 0% — kontejner bez senzora ili sa greškom (docs/sensor-telemetry.md). */
  level: number | null;
  /** Prikaži i reč (Kritično) pored procenta. */
  withLabel?: boolean;
  className?: string;
}

/** Procenat popunjenosti obojen po pojasu. */
export function FillLevelBadge({ level, withLabel = false, className }: FillLevelBadgeProps) {
  if (level === null) {
    return (
      <span className={cn('inline-flex h-5 items-center rounded-full bg-muted px-2 text-xs font-medium text-muted-foreground', className)} title="Nema merenja">
        nema merenja
      </span>
    );
  }

  const band = fillBand(level);
  const c = FILL_BAND_CLASS[band];
  return (
    <span
      className={cn('inline-flex h-5 items-center gap-1 rounded-full px-2 text-xs font-semibold tabular-nums', c.bg, c.text, className)}
      title={`${FILL_BAND_LABEL[band]} — ${level}%`}
    >
      {level}%{withLabel ? <span className="font-normal">· {FILL_BAND_LABEL[band]}</span> : null}
    </span>
  );
}

/** Horizontalna traka popunjenosti — za tabele i kartice. */
export function FillLevelBar({ level, className }: { level: number | null; className?: string }) {
  if (level === null) {
    return <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)} role="meter" aria-valuetext="nema merenja" />;
  }

  const band = fillBand(level);
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)} role="meter" aria-valuenow={level} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-all', FILL_BAND_CLASS[band].solid)} style={{ width: `${Math.min(100, level)}%` }} />
    </div>
  );
}
