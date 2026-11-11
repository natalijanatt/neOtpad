import type { Truck } from '@/domain/types';

/** Vozni park JKP — osam kamiona iz opisa projekta. */
export const trucks: Truck[] = [
  { id: 't-01', code: 'PI 021-AB', name: 'Kamion 1 — smećar 16 m³', capacityKg: 9000, driverName: 'Miroslav J.', status: 'na_terenu' },
  { id: 't-02', code: 'PI 034-CD', name: 'Kamion 2 — smećar 16 m³', capacityKg: 9000, driverName: 'Zoran P.', status: 'na_terenu' },
  { id: 't-03', code: 'PI 047-EF', name: 'Kamion 3 — smećar 12 m³', capacityKg: 7000, driverName: 'Dejan S.', status: 'na_terenu' },
  { id: 't-04', code: 'PI 058-GH', name: 'Kamion 4 — smećar 12 m³', capacityKg: 7000, driverName: 'Goran M.', status: 'na_terenu' },
  { id: 't-05', code: 'PI 063-IJ', name: 'Kamion 5 — smećar 8 m³ (sela)', capacityKg: 5000, driverName: 'Saša N.', status: 'na_terenu' },
  { id: 't-06', code: 'PI 071-KL', name: 'Kamion 6 — smećar 8 m³ (sela)', capacityKg: 5000, driverName: 'Ivan R.', status: 'u_bazi' },
  { id: 't-07', code: 'PI 082-MN', name: 'Kamion 7 — kiper (kabasti otpad)', capacityKg: 6000, driverName: 'Bojan T.', status: 'u_bazi' },
  { id: 't-08', code: 'PI 095-OP', name: 'Kamion 8 — smećar 16 m³', capacityKg: 9000, driverName: 'Vladan K.', status: 'servis' },
];

export const truckById = new Map(trucks.map((t) => [t.id, t]));
