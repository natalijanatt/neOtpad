import type { Priority, ReportStatus } from '@/domain/types';
import { PRIORITY_LABEL, REPORT_STATUS_LABEL } from '@/lib/labels';
import { PRIORITY_CLASS, REPORT_STATUS_CLASS } from '@/lib/levels';
import { cn } from '@/lib/utils';

interface PillProps {
  className?: string;
}

const pillBase = 'inline-flex h-5 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap';

export function ReportStatusPill({ status, className }: PillProps & { status: ReportStatus }) {
  const c = REPORT_STATUS_CLASS[status];
  return <span className={cn(pillBase, c.bg, c.text, className)}>{REPORT_STATUS_LABEL[status]}</span>;
}

/**
 * Prioritet postoji tek posle trijaže — `null` je stvarno stanje nove prijave,
 * ne podatak koji nedostaje, pa se i prikazuje kao takvo.
 */
export function PriorityPill({ priority, className }: PillProps & { priority: Priority | null }) {
  if (priority === null) {
    return <span className={cn(pillBase, 'bg-muted text-muted-foreground', className)}>Bez prioriteta</span>;
  }
  const c = PRIORITY_CLASS[priority];
  return (
    <span className={cn(pillBase, 'gap-1', c.bg, c.text, className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}
