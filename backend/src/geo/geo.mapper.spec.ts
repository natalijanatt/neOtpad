import type { Selectable } from 'kysely';
import type { DB } from '../database/generated/schema';
import { toNaselje, toPlanOdvoza } from './geo.mapper';

/** Krupac as the database returns it: EWKB centroid, numeric as a string. */
const krupac = (): Selectable<DB['app.naselje']> => ({
  id: '11111111-1111-1111-1111-111111111111',
  naziv: 'Krupac',
  sifra_mesta: '732397',
  mesna_zajednica_id: null,
  opstina: 'Pirot',
  centroid: '0101000020E610000091990B5C1EAB36402F17F19D988D4540',
  granica: null,
  broj_domacinstava: 212,
  kategorija_naselja: 'II',
  organizovano_prikupljanje: 'da',
  pristup_kamionu: null,
  udaljenost_od_baze_km: '12.40',
});

describe('toNaselje', () => {
  it('turns the EWKB centroid into a coordinate the map can use', () => {
    const naselje = toNaselje(krupac());

    expect(naselje.centroid.lat).toBeCloseTo(43.10622, 5);
    expect(naselje.centroid.lon).toBeCloseTo(22.668432, 5);
  });

  it('reads the string pg delivers for a numeric distance as a number', () => {
    expect(toNaselje(krupac()).udaljenost_od_baze_km).toBe(12.4);
  });

  it('keeps coverage three-state instead of collapsing it to a boolean', () => {
    const nepoznato = { ...krupac(), organizovano_prikupljanje: 'nepoznato' as const };

    expect(toNaselje(nepoznato).organizovano_prikupljanje).toBe('nepoznato');
  });

  it('refuses a settlement with no centroid rather than placing it at 0,0', () => {
    expect(() => toNaselje({ ...krupac(), centroid: '' })).toThrow(/no centroid/);
  });
});

describe('toPlanOdvoza', () => {
  it('keeps the anchor date on the day it was published', () => {
    // pg hands `date` over at local midnight; toISOString() would move a Monday
    // anchor to the Sunday before it, and the schedule would answer wrongly.
    const plan = toPlanOdvoza({
      id: '22222222-2222-2222-2222-222222222222',
      naselje_id: '11111111-1111-1111-1111-111111111111',
      zona: null,
      tip_otpada: 'suvi_reciklabilni',
      dan_u_nedelji: 1,
      ciklus_dana: 14,
      referentni_datum: new Date(2026, 0, 12),
      izvor: 'JP Komunalac',
      izvor_url: null,
      vazi_od: new Date(2026, 0, 1),
      vazi_do: null,
    });

    expect(plan.referentni_datum).toBe('2026-01-12');
    expect(plan.vazi_od).toBe('2026-01-01');
  });
});
