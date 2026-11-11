import type { Selectable } from 'kysely';
import type { DB } from '../database/generated/schema';
import { toPrijava } from './reports.mapper';

const prijava = (
  over: Partial<Selectable<DB['app.prijava']>> = {},
): Selectable<DB['app.prijava']> => ({
  id: '99999999-9999-9999-9999-999999999999',
  kratki_kod: 'PR-4821',
  kanal: 'sms',
  gradjanin_id: null,
  posrednik_id: null,
  tip: 'pun_kontejner',
  opis: 'kontejner kod skole pun',
  tacka: null,
  naselje_id: '11111111-1111-1111-1111-111111111111',
  preciznost_lokacije: 'naselje',
  kontejner_id: null,
  kanonska_id: null,
  velicina: null,
  status: 'nova',
  duplikat_od: null,
  prioritet: '42.50',
  primljena_at: new Date('2026-09-18T07:15:00.000Z'),
  potvrdjena_at: null,
  resena_at: null,
  opis_lokacije: null,
  tip_obrade: null,
  verzija: 1,
  azurirana_at: new Date('2026-09-18T07:15:00.000Z'),
  ...over,
});

describe('toPrijava', () => {
  it('accepts an SMS report that carries a settlement and no coordinate', () => {
    // The rural path depends on this: a report with no GPS is a report, and its
    // location is the settlement at `naselje` precision.
    const report = toPrijava(prijava());

    expect(report.tacka).toBeNull();
    expect(report.preciznost_lokacije).toBe('naselje');
    expect(report.naselje_id).not.toBeNull();
  });

  it('decodes a coordinate when the channel had one', () => {
    const report = toPrijava(
      prijava({
        kanal: 'mobilna',
        preciznost_lokacije: 'gps',
        tacka: '0101000020E610000091990B5C1EAB36402F17F19D988D4540',
      }),
    );

    expect(report.tacka!.lat).toBeCloseTo(43.10622, 5);
  });

  it('reads the numeric priority as a number', () => {
    expect(toPrijava(prijava()).prioritet).toBe(42.5);
  });
});
