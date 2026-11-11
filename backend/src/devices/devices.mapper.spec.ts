import { toUredjaj, toUredjajMontaza } from './devices.mapper';

describe('toUredjaj', () => {
  it('reads the activation day without shifting it across midnight', () => {
    const uredjaj = toUredjaj({
      id: '55555555-5555-5555-5555-555555555555',
      dev_eui: '70B3D57ED0051F2A',
      model: 'DDS75-LB',
      proizvodjac: 'Dragino',
      aktiviran: new Date(2026, 8, 1),
      status: 'aktivan',
    });

    expect(uredjaj.aktiviran).toBe('2026-09-01');
  });
});

describe('toUredjajMontaza', () => {
  it('leaves an open mounting open instead of closing it at the epoch', () => {
    const montaza = toUredjajMontaza({
      id: '66666666-6666-6666-6666-666666666666',
      uredjaj_id: '55555555-5555-5555-5555-555555555555',
      kontejner_id: '44444444-4444-4444-4444-444444444444',
      konfigurisana_dubina_cm: 120,
      montiran_od: new Date('2026-09-01T09:00:00.000Z'),
      montiran_do: null,
    });

    expect(montaza.montiran_do).toBeNull();
    expect(montaza.konfigurisana_dubina_cm).toBe(120);
  });
});
