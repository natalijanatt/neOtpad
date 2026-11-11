import { Award, Eye, Handshake, Leaf, Lock, Minus, Recycle, Sparkles, Trash2, TrendingDown, TrendingUp, Trophy, Users } from 'lucide-react';
import { Link } from 'react-router';
import { Blobs } from '@/components/citizen/Blobs';
import { Illustration } from '@/components/citizen/Illustration';
import { ScreenHeader } from '@/components/citizen/ScreenHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { useMyCommunityProfile, useSettlementRankings, useSettlements } from '@/data/queries';
import type { BadgeKind, SettlementRanking } from '@/domain/types';
import { formatDate } from '@/lib/format';
import { BADGE_LABEL } from '@/lib/labels';
import { useSettlementPreference } from '@/lib/useSettlementPreference';
import { cn } from '@/lib/utils';

const BADGE_ICON: Record<BadgeKind, typeof Award> = {
  prva_prijava: Sparkles,
  oko_sokolovo: Eye,
  akcija_ciscenja: Trash2,
  razvrstavanje: Recycle,
  komsija: Handshake,
};

/** Zlato, srebro, bronza — samo za prva tri mesta, ostali su neutralni. */
const PODIUM_CLASS: Record<number, string> = {
  1: 'bg-sunflower text-warning-foreground',
  2: 'bg-jade text-[#1F3A2A]',
  3: 'bg-rose/80 text-white',
};

/**
 * Profil bez naloga: bodovi i bedževi su vezani za uređaj, a „takmičenje“ je
 * između naselja, ne pojedinaca (CLAUDE.md, tačka 6 — nagrade su za zajednicu).
 * Zato pojedinac vidi svoj rang samo unutar svog naselja, a javna lista je
 * lista sela.
 */
export function ProfilePage() {
  const { data: profile, isPending } = useMyCommunityProfile();
  const { data: rankings } = useSettlementRankings();
  const { data: settlements } = useSettlements();
  const [settlementId] = useSettlementPreference();

  const settlementName = (id: string) => settlements?.find((s) => s.id === id)?.name ?? id;
  const mySettlement = settlementId ? settlementName(settlementId) : null;

  return (
    <div className="space-y-5">
      <ScreenHeader title="Profil" description={mySettlement ? `Tvoje naselje: ${mySettlement}` : 'Bodovi, bedževi i rang lista naselja.'} />

      {isPending || !profile ? (
        <Skeleton className="h-40 w-full rounded-3xl" />
      ) : (
        <section className="relative overflow-hidden rounded-3xl bg-forest p-5 text-white shadow-md">
          {/* Ilustracija pehara nosi svoje oblake, pa su blobovi iza nje prigušeni. */}
          <Blobs className="opacity-60" />
          <div className="relative flex items-center gap-4">
            <div className="flex-1">
              <p className="flex items-center gap-1.5 text-xs font-medium text-white/80">
                <Leaf className="size-3.5" /> Tvoji bodovi
              </p>
              <p className="mt-1 text-4xl leading-none font-bold tabular-nums">{profile.points}</p>
              <p className="mt-2 text-sm text-white/85">
                {profile.rankInSettlement}. mesto u naselju od {profile.settlementMembers} učesnika
              </p>
            </div>
            <Illustration name="bodovi" fallback={Trophy} className="size-28 shrink-0" />
          </div>
          <div className="relative mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-white/15 px-3 py-1.5 backdrop-blur-sm">Potvrđena prijava +10</span>
            <span className="rounded-full bg-white/15 px-3 py-1.5 backdrop-blur-sm">Akcija čišćenja +50</span>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-semibold">Bedževi</h2>
        {profile ? (
          <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-none">
            {profile.badges.map((badge) => {
              const Icon = BADGE_ICON[badge.kind];
              const earned = badge.earnedAt !== null;
              const { title, hint } = BADGE_LABEL[badge.kind];
              return (
                <li
                  key={badge.kind}
                  className={cn(
                    'flex w-28 shrink-0 flex-col items-center gap-2 rounded-3xl bg-card p-3 text-center shadow-sm ring-1 ring-foreground/5',
                    !earned && 'opacity-60',
                  )}
                  title={earned ? `Osvojen ${formatDate(badge.earnedAt!)}` : hint}
                >
                  <span
                    className={cn(
                      'relative flex size-14 items-center justify-center rounded-full',
                      earned ? 'bg-sunflower text-warning-foreground' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <Icon className="size-6" />
                    {!earned ? (
                      <span className="absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full bg-card ring-1 ring-foreground/10">
                        <Lock className="size-3" />
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs leading-tight font-semibold">{title}</span>
                  <span className="text-[10px] leading-tight text-muted-foreground">{earned ? formatDate(badge.earnedAt!) : hint}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <Skeleton className="h-32 w-full rounded-3xl" />
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold">Najčistije naselje meseca</h2>
          <span className="text-xs text-muted-foreground">septembar</span>
        </div>
        {rankings ? (
          <ol className="overflow-hidden rounded-3xl bg-card shadow-sm ring-1 ring-foreground/5">
            {rankings.map((row) => (
              <RankingRow key={row.settlementId} row={row} name={settlementName(row.settlementId)} mine={row.settlementId === settlementId} />
            ))}
          </ol>
        ) : (
          <Skeleton className="h-64 w-full rounded-3xl" />
        )}
        <p className="px-1 text-xs text-muted-foreground text-pretty">
          Skor prati nove deponije, ponavljanje na očišćenim mestima i akcije čišćenja — ne broj prijava. Nagrada je za
          celo naselje: oprema, uređenje, javno priznanje.
        </p>
      </section>

      {profile ? (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold">Kako si skupio/la bodove</h2>
          <ul className="divide-y rounded-3xl bg-card shadow-sm ring-1 ring-foreground/5">
            {profile.history.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{entry.reason}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(entry.at)}</p>
                </div>
                <span className="rounded-full bg-sour-apple px-2.5 py-1 text-xs font-semibold text-forest tabular-nums">+{entry.points}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Rang lista i bodovi ne smeju da zavise od aplikacije: isto stanje ide
          na oglasnu tablu MZ i preko predsednika (CLAUDE.md). */}
      <section className="flex items-start gap-3 rounded-3xl bg-card p-4 shadow-sm ring-1 ring-foreground/5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sour-apple text-forest">
          <Users className="size-4" />
        </span>
        <p className="text-sm text-muted-foreground text-pretty">
          Rang lista se svakog meseca objavljuje i na oglasnoj tabli mesne zajednice. Učešće u akciji čišćenja
          prijavljuje predsednik MZ. {'\n '}
          <Link to="/gradjanin/raspored" className="font-semibold text-forest">
            Kako bez aplikacije
          </Link>
        </p>
      </section>
    </div>
  );
}

function RankingRow({ row, name, mine }: { row: SettlementRanking; name: string; mine: boolean }) {
  const Delta = row.delta > 0 ? TrendingUp : row.delta < 0 ? TrendingDown : Minus;
  return (
    <li className={cn('flex items-center gap-3 px-4 py-3', mine && 'bg-sour-apple/50')}>
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums',
          PODIUM_CLASS[row.rank] ?? 'bg-muted text-muted-foreground',
        )}
      >
        {row.rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">
          {name}
          {mine ? <span className="ml-1.5 rounded-full bg-forest px-1.5 py-0.5 text-[10px] font-semibold text-white">tvoje</span> : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {row.newDumps} novih · {row.recurrences} ponovljenih · {row.cleanupActions} akcija
        </p>
      </div>
      <div className="text-right">
        <p className="text-base font-bold tabular-nums">{row.score}</p>
        <p
          className={cn(
            'inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums',
            row.delta > 0 ? 'text-success' : row.delta < 0 ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          <Delta className="size-3" />
          {row.delta === 0 ? 'isto' : Math.abs(row.delta)}
        </p>
      </div>
    </li>
  );
}
