/**
 * Citizen reports — the module where the no-smartphone constraint either holds
 * or quietly breaks.
 *
 * Almost everything optional here is optional because an SMS cannot carry it: no
 * GPS, no photo, often no name. A model that made any of those required would
 * design the rural path out of the product, so `tacka` is nullable and
 * `preciznost_lokacije` carries what the location is actually worth.
 *
 * `telefon_e164` is PII. It lives on the model because notifications need it,
 * and it must never be copied into a response DTO — the public identity of a
 * report is its `kratki_kod`.
 */
import type { Tacka } from '../common/geo';
import type {
  AppKanalPrijave,
  AppPreciznostLokacije,
  AppTipPrijave,
  AppVelicinaProblema,
} from '../database/generated/schema';

export interface Gradjanin {
  id: string;
  /** PII: never in a response DTO. */
  telefon_e164: string | null;
  ime: string | null;
  naselje_id: string | null;
  kanal: AppKanalPrijave | null;
  saglasnost_at: Date | null;
  /** Denormalised from the points ledger, for display only. */
  bodovi: number;
}

/**
 * A local-community president, a school, a health post. Reporting through a
 * person is a first-class path rather than a workaround: it is how a village
 * with no smartphones participates at all.
 */
export interface Posrednik {
  id: string;
  ime: string;
  /** predsednik_mz | skola | dom_zdravlja | drugo. */
  uloga: string;
  mesna_zajednica_id: string | null;
  /** PII: never in a response DTO. */
  telefon_e164: string | null;
  aktivan: boolean;
}

export interface Prijava {
  id: string;
  /** `PR-4821`: what an SMS reply can quote back, and the only public identity. */
  kratki_kod: string;
  kanal: AppKanalPrijave;
  gradjanin_id: string | null;
  posrednik_id: string | null;
  tip: AppTipPrijave;
  opis: string | null;
  /** Null whenever the channel had no GPS to give. */
  tacka: Tacka | null;
  naselje_id: string | null;
  /**
   * How good that location is. `naselje` has to stay a valid answer: an SMS
   * knows the village and nothing finer, and rejecting it would drop exactly the
   * reports that come from where the dumps are.
   */
  preciznost_lokacije: AppPreciznostLokacije;
  kontejner_id: string | null;
  kanonska_id: string | null;
  /** A small problem joins the next truck; a large one needs a crew and machinery. */
  velicina: AppVelicinaProblema | null;
  status: string;
  duplikat_od: string | null;
  prioritet: number | null;
  primljena_at: Date;
  potvrdjena_at: Date | null;
  resena_at: Date | null;
  opis_lokacije: string | null;
  tip_obrade: string | null;
  verzija: number;
  azurirana_at: Date;
}

export interface PrijavaFoto {
  id: string;
  /**
   * Null while the upload is staged. A photo arrives before the report exists,
   * because an anonymous reporter never learns the report id -- only
   * `kratki_kod`, which is a receipt and not a write credential.
   */
  prijava_id: string | null;
  /** Object-store key; the image itself never passes through the database. */
  kljuc: string;
  /** Public address of the object, as built at upload time. */
  javni_url: string;
  /** Determined by sniffing the bytes, never from the client's Content-Type. */
  mime_tip: string;
  velicina_bajt: number;
  sha256: string;
  otpremljena_at: Date;
  /** Staging deadline; null once a report has claimed the photo. */
  istice_at: Date | null;
  snimljeno_at: Date | null;
}

/**
 * Raw inbound SMS/Viber, before parsing. Kept because keyword parsing will be
 * wrong at first and the original text is the only way to find out how.
 */
export interface DolaznaPoruka {
  id: string;
  kanal: AppKanalPrijave;
  /** The sender, as the gateway gives it — a phone number. PII. */
  posiljalac: string;
  tekst: string;
  primljena_at: Date;
  prijava_id: string | null;
  obradjena: boolean;
  greska: string | null;
}
