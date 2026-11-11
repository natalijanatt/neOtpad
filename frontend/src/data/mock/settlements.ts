import type { Settlement } from '@/domain/types';

/**
 * Naselja grada Pirota koja koristimo u demo podacima. Imena su stvarna,
 * koordinate su centroidi naselja (iz waste-scraper dataseta ili približno),
 * broj domaćinstava je procena.
 */
export const settlements: Settlement[] = [
  { id: 'pirot', name: 'Pirot', kind: 'grad', lat: 43.1528, lon: 22.586, households: 13500, hasOrganizedCollection: true },
  { id: 'tijabara', name: 'Tijabara', kind: 'prigradsko', lat: 43.1616, lon: 22.5933, households: 1200, hasOrganizedCollection: true },
  { id: 'berilovac', name: 'Berilovac', kind: 'prigradsko', lat: 43.1585, lon: 22.6157, households: 620, hasOrganizedCollection: true },
  { id: 'gnjilan', name: 'Gnjilan', kind: 'prigradsko', lat: 43.163, lon: 22.57, households: 480, hasOrganizedCollection: true },
  { id: 'gradasnica', name: 'Gradašnica', kind: 'selo', lat: 43.1821, lon: 22.6002, households: 210, hasOrganizedCollection: true },
  { id: 'izvor', name: 'Izvor', kind: 'selo', lat: 43.1476, lon: 22.635, households: 260, hasOrganizedCollection: true },
  { id: 'poljska-rzana', name: 'Poljska Ržana', kind: 'selo', lat: 43.1277, lon: 22.6271, households: 280, hasOrganizedCollection: true },
  { id: 'trnjana', name: 'Trnjana', kind: 'selo', lat: 43.121, lon: 22.6536, households: 180, hasOrganizedCollection: true },
  { id: 'krupac', name: 'Krupac', kind: 'selo', lat: 43.116, lon: 22.6751, households: 330, hasOrganizedCollection: true },
  { id: 'veliko-selo', name: 'Veliko Selo', kind: 'selo', lat: 43.1067, lon: 22.6748, households: 150, hasOrganizedCollection: true },
  { id: 'mali-jovanovac', name: 'Mali Jovanovac', kind: 'selo', lat: 43.1062, lon: 22.6684, households: 90, hasOrganizedCollection: true },
  { id: 'veliki-jovanovac', name: 'Veliki Jovanovac', kind: 'selo', lat: 43.1112, lon: 22.6523, households: 140, hasOrganizedCollection: true },
  { id: 'barje-ciflik', name: 'Barje Čiflik', kind: 'selo', lat: 43.1383, lon: 22.5422, households: 120, hasOrganizedCollection: true },
  { id: 'blato', name: 'Blato', kind: 'selo', lat: 43.095, lon: 22.535, households: 180, hasOrganizedCollection: true },
  { id: 'sukovo', name: 'Sukovo', kind: 'selo', lat: 43.0481, lon: 22.6501, households: 210, hasOrganizedCollection: true },
  { id: 'petrovac', name: 'Petrovac', kind: 'selo', lat: 43.0779, lon: 22.6176, households: 95, hasOrganizedCollection: false },
  { id: 'stanicenje', name: 'Stanićenje', kind: 'selo', lat: 43.2041, lon: 22.5101, households: 110, hasOrganizedCollection: true },
  { id: 'crnokliste', name: 'Crnoklište', kind: 'selo', lat: 43.2342, lon: 22.4672, households: 70, hasOrganizedCollection: false },
  { id: 'temska', name: 'Temska', kind: 'selo', lat: 43.274, lon: 22.621, households: 260, hasOrganizedCollection: true },
  { id: 'rsovci', name: 'Rsovci', kind: 'selo', lat: 43.1724, lon: 22.775, households: 60, hasOrganizedCollection: false },
  { id: 'zaskovci', name: 'Zaskovci', kind: 'selo', lat: 43.327, lon: 22.6148, households: 25, hasOrganizedCollection: false },
  { id: 'topli-do', name: 'Topli Do', kind: 'selo', lat: 43.3404, lon: 22.6798, households: 40, hasOrganizedCollection: false },
];

export const settlementById = new Map(settlements.map((s) => [s.id, s]));
