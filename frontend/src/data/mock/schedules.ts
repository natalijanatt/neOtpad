import type { CollectionSchedule, Id, Weekday } from '@/domain/types';
import { settlements } from './settlements';
import { seeded } from './random';

/** Fiksni raspored odvoza po naselju — ono što JKP danas radi i što sistem menja. */
const WEEKDAYS_BY_KIND = {
  grad: [1, 3, 5] as Weekday[],
  prigradsko: [2, 5] as Weekday[],
  selo: [] as Weekday[], // sela: jedna od grupa ispod, dva dana nedeljno
};

/** Fiksni raspored za sela: kamion ide dva puta nedeljno, bez obzira na potrebu. */
const VILLAGE_DAY_GROUPS: Weekday[][] = [
  [1, 4],
  [2, 5],
  [3, 6],
];

const TIME_WINDOWS = ['06:00–09:00', '07:00–10:00', '08:00–11:00', '09:00–12:00'];

/** Sledeći datum (od danas, uključujući danas) koji pada na jedan od zadatih dana u nedelji. */
export function nextWeekdayDate(weekdays: Weekday[], from = new Date()): Date {
  const d = new Date(from);
  d.setHours(7, 0, 0, 0);
  for (let i = 0; i < 8; i++) {
    const jsDay = d.getDay(); // 0 = nedelja
    const weekday = (jsDay === 0 ? 7 : jsDay) as Weekday;
    if (weekdays.includes(weekday) && (i > 0 || from.getHours() < 7)) return d;
    d.setDate(d.getDate() + 1);
  }
  return d;
}

export const schedules: CollectionSchedule[] = settlements
  .filter((s) => s.hasOrganizedCollection)
  .map((s) => {
    const rng = seeded(`schedule-${s.id}`);
    const weekdays: Weekday[] = s.kind === 'selo' ? rng.pick(VILLAGE_DAY_GROUPS) : WEEKDAYS_BY_KIND[s.kind];
    return {
      settlementId: s.id,
      weekdays,
      timeWindow: rng.pick(TIME_WINDOWS),
      nextPickupAt: nextWeekdayDate(weekdays).toISOString(),
      ...(s.kind === 'selo' ? { note: 'Kabasti otpad se odvozi po pozivu, prve srede u mesecu.' } : {}),
    };
  });

export const scheduleBySettlement = new Map<Id, CollectionSchedule>(schedules.map((s) => [s.settlementId, s]));
