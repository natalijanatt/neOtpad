/**
 * Pravi src/data/mock/hotspots.ts iz stvarnog dataseta divljih deponija
 * (waste-scraper/data/pirot_divlje_deponije_kanonske.csv).
 *
 * Pokretanje:  node scripts/build-hotspots.mjs
 *
 * Skripta je idempotentna; pokreni je ponovo kad se CSV promeni.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const csvPath = resolve(here, '../../waste-scraper/data/pirot_divlje_deponije_kanonske.csv');
const outPath = resolve(here, '../src/data/mock/hotspots.ts');

// --- CSV parser koji poštuje navodnike ------------------------------------
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

// --- Prepoznavanje naselja iz našeg šifarnika -----------------------------
const settlementNames = [
  ['pirot', ['pirot']],
  ['tijabara', ['tijabara']],
  ['berilovac', ['berilovac']],
  ['gnjilan', ['gnjilan']],
  ['gradasnica', ['gradasnica']],
  ['izvor', ['izvor']],
  ['poljska-rzana', ['poljska rzana']],
  ['trnjana', ['trnjana']],
  ['krupac', ['krupac']],
  ['veliko-selo', ['veliko selo']],
  ['mali-jovanovac', ['mali jovanovac']],
  ['veliki-jovanovac', ['veliki jovanovac']],
  ['barje-ciflik', ['barje ciflik']],
  ['blato', ['blato']],
  ['sukovo', ['sukovo']],
  ['petrovac', ['petrovac']],
  ['stanicenje', ['stanicenje']],
  ['crnokliste', ['crnokliste']],
  ['temska', ['temska']],
  ['rsovci', ['rsovci']],
  ['zaskovci', ['zaskovci']],
  ['topli-do', ['topli do']],
];

const stripDiacritics = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'dj')
    .replace(/Đ/g, 'Dj')
    .toLowerCase();

function matchSettlement(naselje, geoPrecision) {
  const n = stripDiacritics(naselje);
  // Gradske četvrti i ulice pripadaju Pirotu; proveravamo ih pre opšteg "pirot".
  for (const [id, keys] of settlementNames) {
    if (id === 'pirot') continue;
    if (keys.some((k) => n.includes(k))) return id;
  }
  if (n.includes('pirot') || n.includes('prcevac') || n.includes('zaluzje') || n.includes('kavak') || n.includes('barje') || n.includes('prisjan') || n.includes('kompezacioni') || n.includes('crveni breg') || n.includes('berilovska')) {
    return 'pirot';
  }
  if (geoPrecision === 'ulica' || geoPrecision === 'centar_grada' || geoPrecision === 'prijava_gradjanina') {
    return 'pirot';
  }
  return null;
}

function mapStatus(raw) {
  const s = stripDiacritics(raw);
  if (s.startsWith('aktivna')) return 'aktivna';
  if (s.startsWith('prijavljeno')) return 'prijavljeno';
  if (s.startsWith('ocisceno')) return 'ocisceno';
  if (s.startsWith('u sanaciji')) return 'u_sanaciji';
  return 'evidentirana';
}

function riskScore({ recurs, years, lastSeen, status }) {
  let score = recurs === 'da' ? 40 : recurs === 'nepoznato' ? 20 : 5;
  score += Math.min(years.length * 8, 30);
  if (lastSeen >= 2025) score += 20;
  else if (lastSeen === 2024) score += 15;
  else if (lastSeen === 2023) score += 10;
  if (status === 'aktivna' || status === 'prijavljeno') score += 10;
  if (status === 'ocisceno') score = Math.min(score, 35);
  if (status === 'u_sanaciji') score = Math.min(score, 30);
  return Math.min(score, 100);
}

const num = (v) => (v === '' ? null : Number(v));

// --- Glavni tok -----------------------------------------------------------
const text = readFileSync(csvPath, 'utf8').replace(/^﻿/, '');
const [header, ...rows] = parseCsv(text).filter((r) => r.length > 1);
const col = Object.fromEntries(header.map((h, i) => [h, i]));
const get = (row, name) => row[col[name]] ?? '';

const hotspots = rows.map((row) => {
  const years = get(row, 'godine_evidentirana')
    .split(';')
    .filter(Boolean)
    .map(Number);
  const status = mapStatus(get(row, 'status'));
  const recurs = get(row, 'ponovo_se_stvara') || 'nepoznato';
  const lastSeen = Number(get(row, 'poslednji_put_zabelezena').slice(0, 4));
  const geoPrecision = get(row, 'geo_preciznost');
  const naselje = get(row, 'naselje');
  return {
    id: get(row, 'kanonski_id'),
    name: get(row, 'naziv'),
    settlementName: naselje.replace(/;\s*/g, ' / '),
    settlementId: matchSettlement(naselje, geoPrecision),
    lat: Number(get(row, 'lat')),
    lon: Number(get(row, 'lon')),
    geoPrecision,
    firstSeenYear: Number(get(row, 'prvi_put_zabelezena').slice(0, 4)),
    lastSeenYear: lastSeen,
    yearsRecorded: years,
    observations: Number(get(row, 'broj_opservacija')),
    sources: get(row, 'izvori')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean),
    areaM2: num(get(row, 'povrsina_m2')),
    volumeM3: num(get(row, 'zapremina_m3')),
    tonnes: num(get(row, 'kolicina_t')),
    cleanedAt: get(row, 'ociscena_datum') || null,
    recurs,
    status,
    statusNote: get(row, 'status'),
    riskScore: riskScore({ recurs, years, lastSeen, status }),
  };
});

const body = hotspots
  .map((h) => '  ' + JSON.stringify(h))
  .join(',\n');

const out = `import type { Hotspot } from '@/domain/types';

/**
 * GENERISANO — ne menjati ručno. Izvor: waste-scraper/data/pirot_divlje_deponije_kanonske.csv
 * Ponovo generiši sa:  node scripts/build-hotspots.mjs
 *
 * ${hotspots.length} kanonskih lokacija divljih deponija na teritoriji grada Pirota.
 */
export const hotspots: Hotspot[] = [
${body},
];
`;

writeFileSync(outPath, out);

const unmatched = hotspots.filter((h) => !h.settlementId);
console.log(`Upisano ${hotspots.length} žarišta u ${outPath}`);
if (unmatched.length) {
  console.log(`Bez prepoznatog naselja (${unmatched.length}):`);
  for (const h of unmatched) console.log(`  ${h.id}  ${h.settlementName}`);
}
