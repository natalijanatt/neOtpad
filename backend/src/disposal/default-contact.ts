import type { DefaultContactDto } from './dto/disposal.dto';

/**
 * Always the last entry in the "nobody on the map takes this" popup: the
 * regional landfill operator, who can say what to do with anything the list
 * does not cover.
 *
 * TODO(real contact): the phone and email below are PLACEHOLDERS. The utility's
 * website (the source for its name and URL, waste-scraper/IZVORI.md §5) refuses
 * automated requests, so the real values could not be verified — and a wrong
 * number shown to citizens is worse than none. Both are DEMO values; replace
 * them before this is shown to anyone outside the team.
 */
export const DEFAULT_CONTACT: DefaultContactDto = {
  naziv: 'JKP „Regionalna deponija Pirot“',
  telefon: '+38110322540',
  email: 'kontakt@example.com',
  sajt: 'https://jkpdeponijapirot.rs',
};
