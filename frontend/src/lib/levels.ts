import type { FillLevelBand, Priority, ReportStatus } from '@/domain/types';

/** Granice pojaseva popunjenosti: <50 / 50–79 / 80–94 / >=95. */
export function fillBand(level: number): FillLevelBand {
  if (level >= 95) return 'critical';
  if (level >= 80) return 'high';
  if (level >= 50) return 'mid';
  return 'low';
}

export const FILL_BAND_LABEL: Record<FillLevelBand, string> = {
  low: 'Nisko',
  mid: 'Umereno',
  high: 'Visoko',
  critical: 'Kritično',
};

/** Tailwind klase po pojasu — boje su tokeni iz globals.css. */
export const FILL_BAND_CLASS: Record<FillLevelBand, { bg: string; text: string; solid: string }> = {
  low: { bg: 'bg-level-low/15', text: 'text-level-low', solid: 'bg-level-low' },
  mid: { bg: 'bg-level-mid/20', text: 'text-level-mid', solid: 'bg-level-mid' },
  high: { bg: 'bg-level-high/15', text: 'text-level-high', solid: 'bg-level-high' },
  critical: { bg: 'bg-level-critical/15', text: 'text-level-critical', solid: 'bg-level-critical' },
};

/** CSS boja (var) po pojasu — za Leaflet markere i grafikone gde Tailwind klase ne rade. */
export const FILL_BAND_CSS_VAR: Record<FillLevelBand, string> = {
  low: 'var(--level-low)',
  mid: 'var(--level-mid)',
  high: 'var(--level-high)',
  critical: 'var(--level-critical)',
};

/** Prioritet 1 je najhitniji, pa skala ide obrnuto od broja. */
export const PRIORITY_CLASS: Record<Priority, { bg: string; text: string }> = {
  1: { bg: 'bg-priority-critical/15', text: 'text-priority-critical' },
  2: { bg: 'bg-priority-high/15', text: 'text-priority-high' },
  3: { bg: 'bg-priority-medium/20', text: 'text-priority-medium' },
  4: { bg: 'bg-priority-low/15', text: 'text-priority-low' },
  5: { bg: 'bg-muted', text: 'text-muted-foreground' },
};

export const REPORT_STATUS_CLASS: Record<ReportStatus, { bg: string; text: string }> = {
  nova: { bg: 'bg-muted', text: 'text-muted-foreground' },
  potvrdjena: { bg: 'bg-warning/25', text: 'text-warning-foreground' },
  resena: { bg: 'bg-success/15', text: 'text-success' },
  odbijena: { bg: 'bg-destructive/10', text: 'text-destructive' },
  duplikat: { bg: 'bg-muted', text: 'text-muted-foreground' },
};
