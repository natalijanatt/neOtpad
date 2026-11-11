import { AlertTriangle, Flame, MoreHorizontal, Trash2, Wrench, type LucideIcon } from 'lucide-react';
import type { ReportType } from '@/domain/types';

/**
 * Ikonica i boja tipa prijave, ista u čarobnjaku, listi i detalju — da
 * građanin prepozna „svoju“ prijavu po boji, ne samo po tekstu. Divlja
 * deponija je koralna (najteži problem), kontejnerski problemi zeleni/žuti.
 */
export const REPORT_TYPE_ICON: Record<ReportType, LucideIcon> = {
  pun_kontejner: Trash2,
  prelivanje: AlertTriangle,
  divlja_deponija: Flame,
  ostecen_kontejner: Wrench,
  nedostaje_kontejner: Wrench,
  drugo: MoreHorizontal,
};

export const REPORT_TYPE_TONE: Record<ReportType, string> = {
  pun_kontejner: 'bg-sour-apple text-forest',
  prelivanje: 'bg-sunflower text-warning-foreground',
  divlja_deponija: 'bg-rose text-white',
  ostecen_kontejner: 'bg-jade text-[#1F3A2A]',
  nedostaje_kontejner: 'bg-jade text-[#1F3A2A]',
  drugo: 'bg-muted text-muted-foreground',
};
