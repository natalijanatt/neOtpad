import { useMemo, useState, type ReactNode } from 'react';
import { Clock, MapPin, X } from 'lucide-react';
import { toast } from 'sonner';
import { MAP_SITE_PRESENTATION } from '@/components/citizen/disposalType';
import { PointsBadge } from '@/components/citizen/PointsBadge';
import { ScreenHeader } from '@/components/citizen/ScreenHeader';
import { EmptyState } from '@/components/EmptyState';
import { MultiMarkerMap, type MapMarkerItem } from '@/components/MultiMarkerMap';
import { Skeleton } from '@/components/ui/skeleton';
import { useDisposalSites } from '@/data/queries';
import type { DisposalSite, DisposalSuggestion, MapSiteType, WasteMaterial } from '@/domain/types';
import { MAP_SITE_LABEL, WASTE_MATERIAL_LABEL } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { CollectorsDialog } from './CollectorsDialog';
import { DisposalSearch } from './DisposalSearch';

/**
 * Aktivni filter: vrsta mesta (čip) ili materijal (iz pretrage). Nijedan spisak
 * nije u kodu — čipovi su vrste koje postoje u podacima, a materijal se poredi
 * sa onim što svako mesto kaže da prima (`materijali`). Nova mesta u bazi znače
 * nove čipove i nove pogotke pretrage, bez izmene ovog ekrana.
 */
type Filter = { tip: MapSiteType } | { materijal: WasteMaterial } | null;

function matches(site: DisposalSite, filter: Filter): boolean {
  if (!filter) return true;
  return 'tip' in filter ? site.tip === filter.tip : site.materijali.includes(filter.materijal);
}

/** Geokodirana ulica nije kapija; mapa to mora da kaže, inače pin laže. */
const isApproximate = (site: DisposalSite) => site.geo_preciznost !== 'registarska_tacka';

export function DisposalMapPage() {
  const { data: sites, isPending } = useDisposalSites();
  const [filter, setFilter] = useState<Filter>(null);
  const [unmatched, setUnmatched] = useState<DisposalSuggestion | null>(null);

  const types = useMemo(() => {
    const present = new Set(sites?.map((s) => s.tip) ?? []);
    return (Object.keys(MAP_SITE_LABEL) as MapSiteType[]).filter((t) => present.has(t));
  }, [sites]);

  const filtered = sites?.filter((s) => matches(s, filter)) ?? [];

  /**
   * Ako bar jedno mesto prima prepoznati materijal, mapa se sužava na ta mesta;
   * inače — i kad upit nije prepoznat — otvaraju se sakupljači i deponija.
   * Odluka se donosi nad podacima: „staro gvožđe“ nalazi otkup sirovina jer
   * njegov red u bazi kaže da prima metal, ne zato što mu se vrsta zove metal.
   */
  const handleSuggestion = (result: DisposalSuggestion) => {
    const materijal = result.materijal;
    const count = materijal ? (sites ?? []).filter((s) => s.materijali.includes(materijal)).length : 0;
    if (materijal && count > 0) {
      setFilter({ materijal });
      toast.success(`Pronađeno: ${WASTE_MATERIAL_LABEL[materijal]}`, {
        description: count === 1 ? 'Jedno mesto na mapi to prima — prikazano je ispod.' : `${count} mesta na mapi to primaju — prikazana su ispod.`,
      });
      return;
    }
    setUnmatched(result);
  };

  const markers: MapMarkerItem[] = filtered.map((site) => ({
    id: site.id,
    point: site.tacka,
    color: MAP_SITE_PRESENTATION[site.tip].css,
    popup: <SitePopup site={site} />,
  }));

  return (
    <div className="space-y-4">
      <ScreenHeader
        title="Gde da odložim"
        description="Mesta za otpad koji ne ide u kontejner — i ko ga preuzima kad takvog mesta nema."
        backTo="/gradjanin"
        aside={<PointsBadge />}
      />

      <DisposalSearch onResult={handleSuggestion} />

      {isPending ? (
        <Skeleton className="h-72 w-full rounded-3xl" />
      ) : (
        <>
          {/* Mapa je „hero“ ekrana, sa čipovima za filter preko nje — kao na
              referentnim mapama, gde se karta ne gura ispod kontrola. Čipovi
              su na dnu jer Leaflet drži zoom dugmad gore levo. */}
          <div className="relative -mx-4">
            <MultiMarkerMap markers={markers} className="h-72 w-full overflow-hidden rounded-3xl shadow-sm ring-1 ring-foreground/10" />
            <div className="absolute inset-x-0 bottom-3 z-[1] flex gap-2 overflow-x-auto px-4 scrollbar-none">
              <FilterChip active={filter === null} onClick={() => setFilter(null)}>
                Sve
              </FilterChip>
              {/* Materijal iz pretrage stoji kao sopstveni čip, da se vidi zašto je
                  mapa sužena i da se jednim dodirom vrati. */}
              {filter && 'materijal' in filter ? (
                <FilterChip active onClick={() => setFilter(null)}>
                  {WASTE_MATERIAL_LABEL[filter.materijal]}
                  <X className="size-3" aria-label="Ukloni filter" />
                </FilterChip>
              ) : null}
              {types.map((type) => {
                const Icon = MAP_SITE_PRESENTATION[type].icon;
                return (
                  <FilterChip
                    key={type}
                    active={!!filter && 'tip' in filter && filter.tip === type}
                    onClick={() => setFilter({ tip: type })}
                  >
                    <Icon className="size-3.5" />
                    {MAP_SITE_LABEL[type]}
                  </FilterChip>
                );
              })}
            </div>
            <span className="absolute top-3 right-4 z-[1] rounded-full bg-card/90 px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur">
              {filtered.length} {filtered.length === 1 ? 'mesto' : 'mesta'}
            </span>
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={MapPin} className="border-0 bg-card/70" title="Nema mesta u ovoj kategoriji" />
          ) : (
            <ul className="space-y-2">
              {filtered.map((site) => {
                const p = MAP_SITE_PRESENTATION[site.tip];
                const Icon = p.icon;
                return (
                  <li key={site.id} className="flex items-start gap-3 rounded-3xl bg-card p-4 shadow-sm ring-1 ring-foreground/5">
                    <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-2xl', p.tone)}>
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{site.naziv}</p>
                      <p className="text-xs text-muted-foreground">
                        {site.adresa}
                        {isApproximate(site) ? ' · lokacija na mapi je približna' : ''}
                      </p>
                      {site.radno_vreme ? (
                        <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-green-tea px-2 py-0.5 text-xs text-forest">
                          <Clock className="size-3" /> {site.radno_vreme}
                        </p>
                      ) : null}
                      {site.prima.length > 0 ? (
                        <p className="mt-1.5 text-xs text-muted-foreground text-pretty">Prima: {site.prima.join(', ')}</p>
                      ) : null}
                      {/* Svako mesto na mapi ima izvor; pokazuje se da bi se videlo
                          odakle podatak, a ne da bi se u njega verovalo na reč. */}
                      <p className="mt-1 truncate text-[11px] text-muted-foreground/80" title={site.izvor}>
                        Izvor: {site.izvor}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <CollectorsDialog result={unmatched} onClose={() => setUnmatched(null)} />
    </div>
  );
}

function SitePopup({ site }: { site: DisposalSite }) {
  return (
    <div className="min-w-40 text-sm">
      <p className="font-medium">{site.naziv}</p>
      <p className="text-xs text-muted-foreground">{MAP_SITE_LABEL[site.tip]}</p>
      <p className="mt-1 text-xs">{site.adresa}</p>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium whitespace-nowrap shadow-sm backdrop-blur transition-colors',
        active ? 'bg-forest text-white' : 'bg-card/90 text-foreground hover:bg-card',
      )}
    >
      {children}
    </button>
  );
}
