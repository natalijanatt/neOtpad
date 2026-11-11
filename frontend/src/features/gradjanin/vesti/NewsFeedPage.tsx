import { useEffect, useMemo, useState } from 'react';
import { Newspaper } from 'lucide-react';
import { useLocation } from 'react-router';
import { PillTabs } from '@/components/citizen/PillTabs';
import { PointsBadge } from '@/components/citizen/PointsBadge';
import { ScreenHeader } from '@/components/citizen/ScreenHeader';
import { EmptyState } from '@/components/EmptyState';
import { NewsCard } from '@/components/NewsCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useLookupNames, useNews, useSettlementOptions } from '@/data/queries';
import { normalizeSearch } from '@/lib/search';
import { settlementName as mockSettlementName } from '@/lib/settlements';
import { useSettlementPreference } from '@/lib/useSettlementPreference';

type Filter = 'sve' | 'moje';

/**
 * Feed novosti JKP-a, sa backenda (`GET /news`). Redosled — zakačene prvo, pa
 * najnovije — pravi baza, pa se ovde ništa ne sortira; objava koju administrator
 * doda u `/operativa/vesti` vidi se čim se lista osveži.
 */
export function NewsFeedPage() {
  const [filter, setFilter] = useState<Filter>('sve');

  // Građanin bira naselje iz mock liste (ona ima koordinate), a API traži UUID
  // iz šifarnika. Spajanje ide po imenu, isto kao `useApiToMockSettlement` samo
  // u drugom smeru; nestaje kad naselja u ugovoru dobiju koordinate.
  const [preferenceId] = useSettlementPreference();
  const { data: settlements } = useSettlementOptions();
  const settlementName = useLookupNames(settlements);
  const apiSettlementId = useMemo(() => {
    const wanted = normalizeSearch(mockSettlementName(preferenceId));
    if (!wanted) return null;
    return settlements?.find((s) => normalizeSearch(s.naziv) === wanted)?.id ?? null;
  }, [settlements, preferenceId]);

  // Backend uz objave naselja vraća i opštinske: „u mom selu“ ne sme da sakrije
  // vest koja se tiče svih.
  const { data: news, isPending } = useNews(filter === 'moje' && apiSettlementId ? { naselje_id: apiSettlementId } : {});

  // Podeljeni link vodi na `#vest-…`. Pregledač sam skroluje samo do elementa
  // koji postoji pri učitavanju, a kartice stižu tek sa API-ja — zato ovde.
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash || !news) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash, news]);

  return (
    <div className="space-y-4">
      <ScreenHeader
        title="Novosti"
        description="Izmene rasporeda, akcije čišćenja i saveti za razvrstavanje."
        backTo="/gradjanin"
        aside={<PointsBadge />}
      />

      {apiSettlementId ? (
        <PillTabs
          value={filter}
          onChange={setFilter}
          label="Filter novosti"
          options={[
            { value: 'sve', label: 'Sve' },
            { value: 'moje', label: settlementName(apiSettlementId) || 'Moje naselje' },
          ]}
        />
      ) : null}

      {isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-3xl" />
          ))}
        </div>
      ) : (news?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Newspaper}
          className="border-0 bg-card/70"
          title="Još nema objava"
          description={filter === 'moje' ? 'Za tvoje naselje trenutno nema vesti.' : 'Kada JKP objavi novost, pojaviće se ovde.'}
        />
      ) : (
        <div className="space-y-3">
          {news?.map((item) => (
            <NewsCard
              key={item.id}
              item={item}
              settlementName={settlementName(item.naselje_id) || undefined}
              social
              className="rounded-3xl shadow-sm ring-foreground/5"
            />
          ))}
        </div>
      )}

      {/* Feed pretpostavlja telefon sa internetom; seoska putanja mora da postoji
          i bez njega (CLAUDE.md, „Do not assume a smartphone“). */}
      <p className="px-1 text-xs text-muted-foreground text-pretty">
        Objave označene sa „Poslato i SMS-om/Viberom“ stižu i na običan telefon. Ako nemaš internet, prijavi se za
        obaveštenja kod predsednika mesne zajednice.
      </p>
    </div>
  );
}
