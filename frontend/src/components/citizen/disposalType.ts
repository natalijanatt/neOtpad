import {
  BatteryCharging,
  CircleDashed,
  Cpu,
  FileText,
  GlassWater,
  Leaf,
  Milk,
  Mountain,
  Recycle,
  Scale,
  Sofa,
  type LucideIcon,
} from 'lucide-react';
import type { DisposalSiteType, MapSiteType } from '@/domain/types';

/**
 * Ikonica, boja pozadine i CSS boja markera po vrsti mesta za odlaganje —
 * deli ih mapa i vodič, da „staklo“ bude iste boje na markeru, čipu i kartici.
 * `css` je za Leaflet, gde Tailwind klase ne rade.
 */
export const DISPOSAL_TYPE_PRESENTATION: Record<DisposalSiteType, { icon: LucideIcon; tone: string; css: string }> = {
  reciklazno_dvoriste: { icon: Recycle, tone: 'bg-forest text-white', css: 'var(--forest)' },
  staklo: { icon: GlassWater, tone: 'bg-jade text-[#1F3A2A]', css: 'var(--jade)' },
  plastika: { icon: Milk, tone: 'bg-sunflower text-warning-foreground', css: 'var(--sunflower)' },
  papir: { icon: FileText, tone: 'bg-sour-apple text-forest', css: 'var(--sour-apple)' },
  kabasti: { icon: Sofa, tone: 'bg-rose text-white', css: 'var(--rose)' },
  elektronski: { icon: Cpu, tone: 'bg-forest text-white', css: 'var(--forest)' },
  baterije: { icon: BatteryCharging, tone: 'bg-rose text-white', css: 'var(--rose)' },
  gume: { icon: CircleDashed, tone: 'bg-muted text-muted-foreground', css: 'var(--muted-foreground)' },
  zeleni: { icon: Leaf, tone: 'bg-jade text-[#1F3A2A]', css: 'var(--jade)' },
};

/**
 * Isto za tri vrste mesta na mapi (`DisposalSite.tip`, iz baze). Vodič i mapa
 * imaju različite šifarnike (docs/disposal-search.md), pa i različite mape boja.
 */
export const MAP_SITE_PRESENTATION: Record<MapSiteType, { icon: LucideIcon; tone: string; css: string }> = {
  reciklazno_dvoriste: { icon: Recycle, tone: 'bg-forest text-white', css: 'var(--forest)' },
  otkup_sirovina: { icon: Scale, tone: 'bg-sunflower text-warning-foreground', css: 'var(--sunflower)' },
  deponija: { icon: Mountain, tone: 'bg-muted text-muted-foreground', css: 'var(--muted-foreground)' },
};
