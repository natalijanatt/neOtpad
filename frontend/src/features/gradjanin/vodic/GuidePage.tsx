import { useMemo, useState } from 'react';
import { AlertCircle, Search, X } from 'lucide-react';
import { DISPOSAL_TYPE_PRESENTATION } from '@/components/citizen/disposalType';
import { PointsBadge } from '@/components/citizen/PointsBadge';
import { ScreenHeader } from '@/components/citizen/ScreenHeader';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { useWasteGuide } from '@/data/queries';
import { DISPOSAL_SITE_LABEL } from '@/lib/labels';
import { matchesQuery } from '@/lib/search';
import { cn } from '@/lib/utils';

/** Brzi primeri iznad liste — ono što se najčešće pita, bez kucanja. */
const SUGGESTIONS = ['baterije', 'šut', 'nameštaj', 'ulje', 'lekovi'];

export function GuidePage() {
  const { data: guide, isPending } = useWasteGuide();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!guide) return [];
    return guide.filter((entry) => matchesQuery([entry.wasteType, ...entry.keywords], query));
  }, [guide, query]);

  return (
    <div className="space-y-4">
      <ScreenHeader title="Vodič za otpad" description="Šta gde ide — pretraži po vrsti otpada." backTo="/gradjanin" aside={<PointsBadge />} />

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-forest" />
        <input
          type="search"
          placeholder="Npr. baterije, šut, elektronika…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-12 w-full rounded-full bg-card pr-11 pl-11 text-base shadow-sm ring-1 ring-foreground/5 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-forest"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Obriši pretragu"
            className="absolute top-1/2 right-3 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {!query ? (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setQuery(s)}
              className="shrink-0 rounded-full bg-sour-apple px-3.5 py-1.5 text-xs font-medium text-forest capitalize transition-colors hover:bg-jade/60"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-3xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState className="border-0 bg-card/70" title="Nema rezultata" description="Pokušaj drugu reč ili pogledaj celu listu." />
      ) : (
        <ul className="space-y-2">
          {filtered.map((entry) => {
            const lead = DISPOSAL_TYPE_PRESENTATION[entry.siteTypes[0] ?? 'reciklazno_dvoriste'];
            const Icon = lead.icon;
            return (
              <li key={entry.id} className="rounded-3xl bg-card p-4 shadow-sm ring-1 ring-foreground/5">
                <div className="flex items-start gap-3">
                  <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-2xl', lead.tone)}>
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{entry.wasteType}</p>
                    <p className="mt-0.5 text-sm text-pretty">{entry.howTo}</p>
                  </div>
                </div>
                {entry.dontDo ? (
                  <div className="mt-3 flex items-start gap-2 rounded-2xl bg-rose/10 p-3 text-xs text-destructive">
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                    <p className="text-pretty">{entry.dontDo}</p>
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {entry.siteTypes.map((type) => (
                    <span key={type} className="rounded-full bg-green-tea px-2.5 py-1 text-xs font-medium text-forest">
                      {DISPOSAL_SITE_LABEL[type]}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
