import type { Selectable } from 'kysely';
import { fromPoint } from '../common/geo';
import { toInstant, toInstantOrNull, toNumberOrNull } from '../common/row-values';
import type { DB } from '../database/generated/schema';
import type {
  DolaznaPoruka,
  Gradjanin,
  Posrednik,
  Prijava,
  PrijavaFoto,
} from './reports.model';

type GradjaninRow = Selectable<DB['app.gradjanin']>;
type PosrednikRow = Selectable<DB['app.posrednik']>;
type PrijavaRow = Selectable<DB['app.prijava']>;
type PrijavaFotoRow = Selectable<DB['app.prijava_foto']>;
type DolaznaPorukaRow = Selectable<DB['app.dolazna_poruka']>;

export function toGradjanin(row: GradjaninRow): Gradjanin {
  return {
    id: row.id,
    telefon_e164: row.telefon_e164,
    ime: row.ime,
    naselje_id: row.naselje_id,
    kanal: row.kanal,
    saglasnost_at: toInstantOrNull(row.saglasnost_at),
    bodovi: row.bodovi,
  };
}

export function toPosrednik(row: PosrednikRow): Posrednik {
  return {
    id: row.id,
    ime: row.ime,
    uloga: row.uloga,
    mesna_zajednica_id: row.mesna_zajednica_id,
    telefon_e164: row.telefon_e164,
    aktivan: row.aktivan,
  };
}

export function toPrijava(row: PrijavaRow): Prijava {
  return {
    id: row.id,
    kratki_kod: row.kratki_kod,
    kanal: row.kanal,
    gradjanin_id: row.gradjanin_id,
    posrednik_id: row.posrednik_id,
    tip: row.tip,
    opis: row.opis,
    // An SMS report has no point, and that is a valid report. The settlement and
    // `preciznost_lokacije` are what it is worth; no centroid is substituted
    // here, because a substituted centroid looks exactly like a surveyed one.
    tacka: fromPoint(row.tacka),
    naselje_id: row.naselje_id,
    preciznost_lokacije: row.preciznost_lokacije,
    kontejner_id: row.kontejner_id,
    kanonska_id: row.kanonska_id,
    velicina: row.velicina,
    status: row.status,
    duplikat_od: row.duplikat_od,
    prioritet: toNumberOrNull(row.prioritet),
    primljena_at: toInstant(row.primljena_at),
    potvrdjena_at: toInstantOrNull(row.potvrdjena_at),
    resena_at: toInstantOrNull(row.resena_at),
    opis_lokacije: row.opis_lokacije,
    tip_obrade: row.tip_obrade,
    verzija: row.verzija,
    azurirana_at: toInstant(row.azurirana_at),
  };
}

export function toPrijavaFoto(row: PrijavaFotoRow): PrijavaFoto {
  return {
    id: row.id,
    prijava_id: row.prijava_id,
    kljuc: row.kljuc,
    javni_url: row.javni_url,
    mime_tip: row.mime_tip,
    velicina_bajt: row.velicina_bajt,
    sha256: row.sha256,
    otpremljena_at: toInstant(row.otpremljena_at),
    istice_at: toInstantOrNull(row.istice_at),
    snimljeno_at: toInstantOrNull(row.snimljeno_at),
  };
}

export function toDolaznaPoruka(row: DolaznaPorukaRow): DolaznaPoruka {
  return {
    id: row.id,
    kanal: row.kanal,
    posiljalac: row.posiljalac,
    tekst: row.tekst,
    primljena_at: toInstant(row.primljena_at),
    prijava_id: row.prijava_id,
    obradjena: row.obradjena,
    greska: row.greska,
  };
}
