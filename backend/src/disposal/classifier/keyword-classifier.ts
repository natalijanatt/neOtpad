import { Injectable } from '@nestjs/common';
import type { AppMaterijalOtpada } from '../../database/generated/schema';
import type { Classification, WasteClassifier } from './waste-classifier.port';

/**
 * Serbian Cyrillic → Latin, then diacritics off. People in the villages type in
 * both scripts and often without č/ć/š/ž on the phone keyboard, so every form is
 * reduced to one before matching: "Фрижидер", "frižider" and "frizider" meet.
 */
const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'dj', е: 'e', ж: 'z', з: 'z', и: 'i', ј: 'j', к: 'k', л: 'l',
  љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r', с: 's', т: 't', ћ: 'c', у: 'u', ф: 'f', х: 'h',
  ц: 'c', ч: 'c', џ: 'dz', ш: 's',
};

const LATIN_DIACRITICS: Record<string, string> = { č: 'c', ć: 'c', š: 's', ž: 'z', đ: 'dj' };

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[Ѐ-ӿ]/g, (ch) => CYRILLIC[ch] ?? ch)
    .replace(/[čćšžđ]/g, (ch) => LATIN_DIACRITICS[ch] ?? ch)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Word-start stems, so one entry covers the cases: "gvozd" matches gvožđe,
 * gvožđa, gvožđem. A stem ending in a space must be the whole word — "lim " is
 * sheet metal, but a bare "lim" prefix would file lemon peel (limun) as scrap,
 * and "sut" would catch every "sutra". Checked in this ORDER, most specific first — a washing
 * machine is metal too, but it goes to e-waste; a particle-board wardrobe is
 * bulky too, but a collector of iverica is the useful answer. Kabasti is last
 * because it is what everything else is when nothing more specific fits.
 */
const RULES: Array<[AppMaterijalOtpada, string[]]> = [
  ['elektronski', ['frizider', 'zamrzivac', 'ves masin', 'vesmasin', 'masin za ves', 'masin za sud', 'sudomasin', 'sporet',
    'bojler', 'televizor', 'tv ', 'telefon', 'mobiln', 'laptop', 'racunar', 'kompjuter', 'monitor', 'stampac', 'klima',
    'usisivac', 'mikrotalas', 'fen ', 'pegl', 'toster', 'punjac', 'elektron', 'bela tehnik', 'kabl', 'grejalic', 'radijator na struju']],
  ['baterije', ['baterij', 'akumulator', 'lekov', 'lekova', 'sirup']],
  ['gume', ['gum', 'pneumat']],
  ['gradjevinski', ['sut ', 'suta ', 'cigl', 'crep', 'beton', 'malter', 'plocic', 'gradjevin', 'rigips', 'gips', 'keramik', 'sipor']],
  ['iverica', ['iveric', 'univer', 'medijapan', 'mdf', 'sperploc', 'sper ploc', 'lesonit']],
  ['metal', ['metal', 'gvoz', 'zelez', 'zeljez', 'lim ', 'limen', 'bakar', 'bakr', 'aluminij', 'mesing', 'celik', 'felne', 'bicikl', 'karoserij', 'radijator', 'serp', 'kazan']],
  // Plastic before glass: "plastične flaše" names both, and the adjective is the
  // one that decides. A bare "flaše" still lands on glass below.
  ['plastika', ['plastik', 'plastic', 'pet ambalaz', 'pet flas', 'najlon', 'kesa', 'kese', 'kesu', 'kesic', 'folij', 'stiropor', 'kanister', 'pvc']],
  ['staklo', ['stakl', 'flas', 'tegl', 'ogledal', 'prozor']],
  ['papir', ['papir', 'karton', 'novin', 'casopis', 'knjig', 'kutij', 'hartij', 'svesk']],
  ['tekstil', ['tekstil', 'odec', 'garderob', 'krp', 'obuc', 'cipel', 'patik', 'jakn', 'pantalon', 'carsav', 'ceb', 'jorgan', 'stvari od odec']],
  // Garden waste before wood: "granje" is wood, but it belongs with the leaves.
  ['zeleni', ['lisc', 'trav', 'granj', 'basta', 'kompost', 'orezan', 'loza', 'loze', 'lozu', 'slam', 'seno', 'korov']],
  ['drvo', ['drv', 'dask', 'palet', 'greda', 'grede']],
  ['kabasti', ['namestaj', 'ormar', 'kauc', 'trosed', 'dvosed', 'fotelj', 'dusek', 'krevet', 'stolic', 'regal', 'komod', 'kredenac', 'tepih', 'kabast']],
];

export function classifyByKeywords(text: string): AppMaterijalOtpada | null {
  // Spaces on both ends: every stem matches only at a word start, and a stem
  // with a trailing space only as a whole word.
  const haystack = ` ${normalize(text)} `;
  for (const [materijal, stems] of RULES) {
    if (stems.some((stem) => haystack.includes(` ${stem}`))) return materijal;
  }
  return null;
}

/**
 * The free classifier: no network, no key, deterministic. It answers when no
 * model is configured and whenever the model call fails, so a citizen's search
 * never depends on a third-party service being up.
 */
@Injectable()
export class KeywordWasteClassifier implements WasteClassifier {
  classify(text: string): Promise<Classification> {
    return Promise.resolve({ materijal: classifyByKeywords(text), izvor: 'kljucne_reci' });
  }
}
