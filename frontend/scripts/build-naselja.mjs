/**
 * Pravi src/data/mock/naselja.ts iz stvarnog spiska naselja grada Pirota
 * (waste-scraper/data/pirot_naselja.csv).
 *
 * Pokretanje:  node scripts/build-naselja.mjs
 *
 * Zašto generisani fajl a ne API: ugovor ima `/settlements`, ali to je šifarnik
 * (id + naziv). Zastavica `organizovano_prikupljanje`, klasa iz LPUO i brojke iz
 * plana JP Komunalac nemaju rutu, a mapa pokrivenosti stoji upravo na njima.
 * Skripta je idempotentna; pokreni je ponovo kad se CSV promeni.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const csvPath = resolve(here, '../../waste-scraper/data/pirot_naselja.csv');
const outPath = resolve(here, '../src/data/mock/naselja.ts');

// --- CSV parser koji poštuje navodnike (izvori nose zareze u nazivu) -------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Isti oblik ID-ja kao u src/data/mock/settlements.ts, pa se dva skupa poklapaju. */
const slugify = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'dj')
    .replace(/Đ/g, 'Dj')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const num = (v) => (v === '' ? null : Number(v));

// --- Glavni tok -----------------------------------------------------------
const text = readFileSync(csvPath, 'utf8').replace(/^﻿/, '');
const [header, ...rows] = parseCsv(text).filter((r) => r.length > 1);
const col = Object.fromEntries(header.map((h, i) => [h, i]));
const get = (row, name) => row[col[name]] ?? '';

const naselja = rows.map((row) => {
  const naziv = get(row, 'naziv');
  return {
    id: slugify(naziv),
    name: naziv,
    lat: Number(get(row, 'lat')),
    lon: Number(get(row, 'lon')),
    lpuoClass: get(row, 'kategorija_lpuo'),
    hasOrganizedCollection: get(row, 'organizovano_prikupljanje') === 'da',
    coverageSource: get(row, 'pokrivenost_izvor'),
    coverageSourceUrl: get(row, 'pokrivenost_izvor_url') || null,
    coverageYear: num(get(row, 'pokrivenost_godina')),
    pickupsPerWeek: num(get(row, 'odvoz_nedeljno')),
    households: num(get(row, 'broj_domacinstava')),
    containers1100: num(get(row, 'broj_kontejnera_1100l')),
    population2011: num(get(row, 'broj_stanovnika_2011')),
    // null = grad: tabela iz 2024 je spisak SELA sa kontejnerima i o gradu ne tvrdi
    // ništa, pa `false` ovde ne bi bio podatak nego izmišljotina.
    containers2024: get(row, 'kontejneri_2024') === '' ? null : get(row, 'kontejneri_2024') === 'da',
    containers2024Source: get(row, 'kontejneri_2024_izvor') || null,
    containers2024Year: num(get(row, 'kontejneri_2024_godina')),
    geoSource: get(row, 'geo_izvor'),
  };
});

const missingCoords = naselja.filter((n) => !Number.isFinite(n.lat) || !Number.isFinite(n.lon));
if (missingCoords.length) {
  // Naselje bez koordinate se ne može nacrtati, a tiho izostavljanje bi
  // pokazalo manje od 72 pina bez ijedne poruke.
  console.error(`Naselja bez koordinate (${missingCoords.length}): ${missingCoords.map((n) => n.name).join(', ')}`);
  process.exit(1);
}

const covered = naselja.filter((n) => n.hasOrganizedCollection);
const withContainers = naselja.filter((n) => n.containers2024 === true);
const body = naselja.map((n) => '  ' + JSON.stringify(n)).join(',\n');

const out = `import type { SettlementCoverage } from '@/domain/types';

/**
 * GENERISANO — ne menjati ručno. Izvor: waste-scraper/data/pirot_naselja.csv
 * Ponovo generiši sa:  node scripts/build-naselja.mjs
 *
 * Svih ${naselja.length} naselja grada Pirota, sa dva datirana pogleda na pokrivenost:
 *
 *  - \`hasOrganizedCollection\` — plan iznošenja JP Komunalac za 2018: ${covered.length} naselja
 *    (${covered.length - 1} sela + sam grad Pirot iz cenovnika za 2026). Za ostalih ${naselja.length - covered.length}
 *    \`ne\` je zaključak iz LPUO, ne prepis; razlog putuje uz red u \`coverageSource\`.
 *  - \`containers2024\` — spisak sela sa postavljenim kontejnerima iz izveštaja za 2024:
 *    ${withContainers.length} sela. \`false\` znači „nije na spisku“, NE „nema uslugu“ (izveštaj pominje i
 *    tri vozila za iznošenje iz kanti); \`null\` je grad, o kom tabela ne govori.
 */
export const naselja: SettlementCoverage[] = [
${body},
];

export const naseljeById = new Map(naselja.map((n) => [n.id, n]));
`;

writeFileSync(outPath, out);
console.log(
  `Upisano ${naselja.length} naselja u ${outPath} — plan 2018: ${covered.length} pokrivenih, ` +
    `kontejneri 2024: ${withContainers.length} sela`,
);
