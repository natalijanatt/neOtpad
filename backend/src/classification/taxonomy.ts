/**
 * The vocabulary the classifier works in, and the service each answer belongs to.
 *
 * `tip_prijave` says what the problem is and `tip_obrade` says who answers it —
 * both already exist and both are the dispatcher's to set. What this file adds
 * is the grain underneath: a pile of asbestos sheets and a pile of grass
 * cuttings are both `divlja_deponija` + `ciscenje`, and sending the same crew to
 * both is how a licensed-operator job ends up on a truck with two shovels.
 */
import type { AppPodkategorijaPrijave } from '../database/generated/schema';
import type { ResponseType } from '../reports/vocabulary';

export const PODKATEGORIJE: readonly AppPodkategorijaPrijave[] = [
  'komunalni_otpad',
  'gradjevinski_sut',
  'kabasti_otpad',
  'opasan_otpad',
  'zeleni_otpad',
  'uginula_zivotinja',
  'paljenje_otpada',
  'van_nadleznosti',
  'nepoznato',
];

/** What each one means, in the dispatcher's words. Also the prompt's definition list. */
export const OPIS_PODKATEGORIJE: Record<AppPodkategorijaPrijave, string> = {
  komunalni_otpad: 'obican kucni otpad u kesama ili rasut',
  gradjevinski_sut: 'sut, beton, cigla, crep, malter, zemlja s gradilista',
  kabasti_otpad: 'namestaj, dusek, bela tehnika, gume, veliki komadi',
  opasan_otpad: 'azbest/eternit/salonit, akumulatori, motorno ulje, boje i rastvaraci, medicinski otpad',
  zeleni_otpad: 'grane, lisce, pokosena trava, otpad iz baste i vinograda',
  uginula_zivotinja: 'uginula zivotinja ili zivotinjski ostaci',
  paljenje_otpada: 'otpad koji gori ili je zapaljen',
  van_nadleznosti: 'nije posao komunalnog preduzeca: fekalne vode, ambrozija, ostecen put, javna rasveta',
  nepoznato: 'iz prijave se ne moze zakljuciti sta je otpad',
};

/**
 * Who actually goes out. `tip_obrade` alone stops one step short of an answer:
 * `ciscenje` is a crew with shovels, a crew with an excavator or a licensed
 * hazardous-waste operator depending entirely on what is lying there.
 *
 * Derived rather than stored: it is a label over two columns that are stored,
 * and a municipality that reorganises its services should not need a migration.
 */
export function nadleznaSluzba(odgovor: ResponseType | null, podkategorija: AppPodkategorijaPrijave | null): string {
  if (podkategorija === 'van_nadleznosti') return 'Van nadleznosti JKP - proslediti nadleznoj sluzbi grada';
  if (podkategorija === 'opasan_otpad') return 'Ovlasceni operater za opasan otpad';
  if (podkategorija === 'uginula_zivotinja') return 'Zoohigijenicarska sluzba';
  if (podkategorija === 'paljenje_otpada') return 'Komunalna inspekcija (po potrebi vatrogasci)';

  switch (odgovor) {
    case 'odvoz':
      return 'JKP - redovna posada kamiona';
    case 'ciscenje':
      return podkategorija === 'gradjevinski_sut' || podkategorija === 'kabasti_otpad'
        ? 'JKP - ekipa za ciscenje sa mehanizacijom'
        : 'JKP - ekipa za ciscenje';
    case 'odrzavanje':
      return 'JKP - odrzavanje kontejnera';
    case 'provera_lokacije':
      return 'Dispecer - provera lokacije pre rasporedjivanja';
    default:
      return 'Nije odredjeno';
  }
}
