import type { NewsEngagement } from '@/domain/types';
import { seeded } from './random';

/**
 * Demo brojevi lajkova i komentara za objavu.
 *
 * Seed je ID objave, pa ista objava uvek ima iste brojeve: feed ne sme da
 * „trepće“ drugim brojem pri svakom osvežavanju liste. Nestaje kad backend
 * dobije reakcije — do tada su ovo samo brojevi za izgled feeda.
 */
export function demoEngagementFor(id: string): NewsEngagement {
  const rng = seeded(`vest-reakcije:${id}`);
  const likes = rng.int(3, 140);
  // Komentara je u stvarnim feedovima red veličine manje nego lajkova.
  return { likes, comments: rng.int(0, Math.max(2, Math.round(likes / 6))) };
}
