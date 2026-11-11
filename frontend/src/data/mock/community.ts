import type { CommunityProfile, SettlementRanking } from '@/domain/types';

/**
 * Demo profil i rang lista. Bodovi su ilustrativni: pravila nagrađivanja
 * (koliko za potvrđenu prijavu, koliko za akciju) još nisu odlučena, pa ih
 * ne treba čitati kao specifikaciju.
 */
export const myCommunityProfile: CommunityProfile = {
  points: 150,
  rankInSettlement: 4,
  settlementMembers: 37,
  badges: [
    { kind: 'prva_prijava', earnedAt: '2026-06-03' },
    { kind: 'oko_sokolovo', earnedAt: '2026-08-21' },
    { kind: 'akcija_ciscenja', earnedAt: '2026-07-12' },
    { kind: 'razvrstavanje', earnedAt: null },
    { kind: 'komsija', earnedAt: null },
  ],
  history: [
    { id: 'p1', at: '2026-09-14T09:20:00+02:00', points: 30, reason: 'Potvrđena prijava divlje deponije — Krupac' },
    { id: 'p2', at: '2026-09-06T17:05:00+02:00', points: 10, reason: 'Potvrđena prijava punog kontejnera' },
    { id: 'p3', at: '2026-08-21T11:40:00+02:00', points: 50, reason: 'Učešće u akciji čišćenja — Temska' },
    { id: 'p4', at: '2026-07-12T10:00:00+02:00', points: 50, reason: 'Učešće u akciji čišćenja — Izvor' },
    { id: 'p5', at: '2026-06-03T08:15:00+02:00', points: 10, reason: 'Prva potvrđena prijava' },
  ],
};

/** Septembar 2026. Manje novih deponija i ponavljanja = veći skor. */
export const settlementRankings: SettlementRanking[] = [
  { settlementId: 'temska', rank: 1, score: 96, delta: 2, newDumps: 0, recurrences: 0, cleanupActions: 2 },
  { settlementId: 'gradasnica', rank: 2, score: 91, delta: 0, newDumps: 0, recurrences: 1, cleanupActions: 1 },
  { settlementId: 'izvor', rank: 3, score: 88, delta: -2, newDumps: 1, recurrences: 0, cleanupActions: 1 },
  { settlementId: 'krupac', rank: 4, score: 84, delta: 1, newDumps: 1, recurrences: 1, cleanupActions: 1 },
  { settlementId: 'sukovo', rank: 5, score: 79, delta: 3, newDumps: 1, recurrences: 1, cleanupActions: 0 },
  { settlementId: 'poljska-rzana', rank: 6, score: 74, delta: -1, newDumps: 2, recurrences: 1, cleanupActions: 0 },
  { settlementId: 'berilovac', rank: 7, score: 70, delta: 0, newDumps: 2, recurrences: 2, cleanupActions: 0 },
  { settlementId: 'blato', rank: 8, score: 63, delta: -3, newDumps: 3, recurrences: 2, cleanupActions: 0 },
];
