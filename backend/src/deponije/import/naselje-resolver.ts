/**
 * Turns the settlement name written in a source document into a `naselje.id`.
 *
 * The sources are not a gazetteer. They contain spellings ('Sukovo', 'selo
 * sukovo'), street addresses ('cara dušana'), descriptions ('Kompezacioni bazen
 * - staro gradsko kupališta') and rows that name three villages at once
 * ('Gnjilan; Gradašnica; Gradište'). Matching is therefore deliberately narrow:
 * a name either resolves through `app.naselje` / `app.naselje_alias` or it does
 * not resolve at all and lands on the import report as a review task. Creating a
 * village from a string in a PDF would put a settlement on the coverage map that
 * nobody has ever checked for organised collection — the one flag the whole
 * model leans on.
 */

export interface NaseljeName {
  naselje_id: string;
  /** Either `naselje.naziv` or an `naselje_alias.alias`. */
  naziv: string;
}

/** Set when two known settlements normalise to the same key. */
const AMBIGUOUS = Symbol('ambiguous');

export class NaseljeResolver {
  private readonly byKey = new Map<string, string | typeof AMBIGUOUS>();

  constructor(names: readonly NaseljeName[]) {
    for (const { naziv, naselje_id } of names) {
      const key = normalizeNaselje(naziv);
      if (key.length === 0) {
        continue;
      }

      const existing = this.byKey.get(key);
      if (existing !== undefined && existing !== naselje_id) {
        this.byKey.set(key, AMBIGUOUS);
        continue;
      }

      this.byKey.set(key, naselje_id);
    }
  }

  /** The settlement id, or null when the name needs a human. */
  resolve(naziv: string | null): string | null {
    if (naziv === null) {
      return null;
    }

    // A row can name several places at once. 'Pirot; Kavak' is the city and a
    // part of the city, so it has one answer; 'Gnjilan; Gradašnica; Gradište'
    // names three villages and has none. Resolving only when every part agrees
    // keeps the first case without guessing at the second.
    if (naziv.includes(';')) {
      const parts = naziv.split(';').map((part) => this.lookup(part));
      const first = parts[0];
      return first !== null && parts.every((id) => id === first) ? first : null;
    }

    return this.lookup(naziv);
  }

  private lookup(naziv: string): string | null {
    const match = this.byKey.get(normalizeNaselje(naziv));
    return typeof match === 'string' ? match : null;
  }
}

/**
 * Lowercase, fold Serbian diacritics, drop the `selo ` prefix, collapse runs of
 * whitespace. Enough to join 'selo sukovo' to 'Sukovo' and 'Poljska Ržana' to
 * 'Poljska Rzana' when a source drops the diacritics, and no further: anything
 * looser starts matching 'Pirot-grad' to 'Pirot' by luck rather than by rule.
 */
export function normalizeNaselje(naziv: string): string {
  return naziv
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // đ carries no combining mark, so NFD leaves it whole.
    .replace(/đ/g, 'dj')
    .replace(/^selo\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}
