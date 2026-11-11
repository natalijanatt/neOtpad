/**
 * Serbian text, flattened to one comparable form.
 *
 * A report arrives in Cyrillic from a Viber keyboard, in Latin with diacritics
 * from a browser, and in Latin without them from an SMS keypad — "прелива се",
 * "preliva se" and "preliva se" are the same sentence typed by three people, and
 * keyword matching that treats them as three strings finds none of them. The
 * transliteration is one-way and lossy on purpose: `ć` and `č` both become `c`,
 * which is exactly what an SMS sender typed anyway.
 */
const CIRILICA: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'dj', е: 'e', ж: 'z', з: 'z', и: 'i',
  ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', ћ: 'c', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'c', џ: 'dz', ш: 's',
};

const DIJAKRITIKE: Record<string, string> = { č: 'c', ć: 'c', ž: 'z', š: 's', đ: 'dj' };

export function normalizuj(tekst: string): string {
  return [...tekst.toLowerCase()]
    .map((znak) => CIRILICA[znak] ?? DIJAKRITIKE[znak] ?? znak)
    .join('')
    // Punctuation to spaces so a keyword can be matched with its boundaries
    // intact: "kontejner,pun" must find "pun" the same way "kontejner pun" does.
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Does the normalised haystack contain any of these already-normalised needles. */
export function sadrzi(tekst: string, reci: readonly string[]): boolean {
  return reci.some((rec) => tekst.includes(rec));
}
