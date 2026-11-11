import { toInstant, toInstantOrNull, toNumberOrNull } from '../common/row-values';
import type { ResponseType } from '../reports/vocabulary';
import type { KlasifikacijaRed } from './classification.repository';
import type { ClassificationDto, ClassificationSignalsDto } from './dto/classification.dto';
import { nadleznaSluzba } from './taxonomy';

/** Defaults for a pending row, whose `signali` are still an empty object. */
const PRAZNI_SIGNALI: ClassificationSignalsDto = {
  najblizi_kontejner_id: null,
  najblizi_kontejner_m: null,
  najblizi_kontejner_punjenje: null,
  broj_kandidata_kontejnera: 0,
  pokrivenost: null,
  crna_tacka_m: null,
  kanonska_deponija_m: null,
  broj_fotografija: 0,
  kandidata_za_duplikat: 0,
};

export function classificationResponse(red: KlasifikacijaRed): ClassificationDto {
  const tipObrade = red.predlozeni_tip_obrade as ResponseType | null;
  return {
    status: red.status,
    izvor: red.izvor,
    model: red.model,
    prijava_verzija: red.prijava_verzija,
    predlozeni_tip: red.predlozeni_tip,
    predlozena_podkategorija: red.predlozena_podkategorija,
    predlozena_velicina: red.predlozena_velicina,
    predlozeni_tip_obrade: tipObrade,
    // Derived on read rather than stored: it is a label over two columns that
    // are stored, and a utility that reorganises its crews should not need a
    // migration to rename them.
    nadlezna_sluzba: nadleznaSluzba(tipObrade, red.predlozena_podkategorija),
    predlozeni_prioritet: red.predlozeni_prioritet,
    predlozeni_kontejner_id: red.predlozeni_kontejner_id,
    predlozeni_duplikat_od: red.predlozeni_duplikat_od,
    pouzdanost: toNumberOrNull(red.pouzdanost),
    obrazlozenje: red.obrazlozenje,
    signali: { ...PRAZNI_SIGNALI, ...(red.signali as Partial<ClassificationSignalsDto>) },
    ishod: red.ishod,
    greska: red.greska,
    kreirana_at: toInstant(red.kreirana_at).toISOString(),
    obradjena_at: toInstantOrNull(red.obradjena_at)?.toISOString() ?? null,
  };
}
