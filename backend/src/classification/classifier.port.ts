/**
 * The classifier, behind a port.
 *
 * Two implementations, and neither is a placeholder for the other. `pravila` is
 * Serbian keyword matching that runs with no API key at all — in CI, on a laptop
 * with no network, and as the last attempt after the model has failed — so the
 * dispatcher's queue is never left without a proposal. `model` is the OpenAI
 * call, which is the only one of the two that can read a photograph or weigh
 * "20 m from a serviced container" against "on a known black spot".
 *
 * Same rationale as `storage.port.ts`: tests bind a fake, and swapping provider
 * is one class rather than a grep.
 */
import type { AppPodkategorijaPrijave, AppTipPrijave, AppVelicinaProblema } from '../database/generated/schema';
import type { ResponseType } from '../reports/vocabulary';
import type { Tacka } from '../common/geo';

/** Injection token for the classifier (di-use-interfaces-tokens). */
export const KLASIFIKATOR = Symbol('KLASIFIKATOR');

/** A container the report might be about. The model may only choose from this list. */
export interface KandidatKontejner {
  id: string;
  oznaka: string;
  tip_otpada: string;
  mesto: string;
  /** Null when the report has no coordinates — the candidate came from the settlement, not from geometry. */
  rastojanje_m: number | null;
  /** Last reading, or null when nothing is mounted. Never read as "0 %" (`sensor-telemetry.md`). */
  punjenje_percent: number | null;
  dana_od_praznjenja: number | null;
}

/** An open report nearby that this one may be repeating. */
export interface KandidatDuplikat {
  id: string;
  kratki_kod: string;
  tip: AppTipPrijave;
  opis: string | null;
  rastojanje_m: number | null;
  sati_ranije: number;
}

/**
 * Everything around the report that a human dispatcher would look up before
 * deciding. This is the difference between classifying and guessing: the same
 * photograph is `prelivanje` beside a serviced container and `divlja_deponija`
 * on a black spot in an uncovered village.
 */
export interface KlasifikacijaKontekst {
  naselje: { naziv: string; pokrivenost: string } | null;
  kontejneri: KandidatKontejner[];
  duplikati: KandidatDuplikat[];
  /** Metres to the nearest recorded black spot, null when none is near or the location is too coarse. */
  crna_tacka_m: number | null;
  /** Metres to the nearest canonical illegal dump from the historical registry. */
  kanonska_deponija_m: number | null;
}

export interface KlasifikacijaUlaz {
  prijava: {
    kratki_kod: string;
    kanal: string;
    /** What the citizen picked. A hint, never the answer — it is the field most often wrong. */
    tip: AppTipPrijave;
    opis: string | null;
    opis_lokacije: string | null;
    velicina: AppVelicinaProblema | null;
    preciznost_lokacije: string;
    tacka: Tacka | null;
    kontejner_id: string | null;
  };
  fotografije: { javni_url: string; mime_tip: string }[];
  kontekst: KlasifikacijaKontekst;
}

export interface KlasifikacijaPredlog {
  tip: AppTipPrijave;
  podkategorija: AppPodkategorijaPrijave;
  velicina: AppVelicinaProblema | null;
  tip_obrade: ResponseType;
  /** 1 most urgent through 5, the same scale as `prijava.prioritet`. */
  prioritet: number;
  /** One of the supplied candidates, or null. Never an invented identifier. */
  kontejner_id: string | null;
  duplikat_od: string | null;
  /** 0..1, the same word and the same meaning as `prognoza_punjenja.pouzdanost`. */
  pouzdanost: number;
  /** One or two sentences in Serbian, for the dispatcher. Staff-only. */
  obrazlozenje: string;
}

export interface ClassifierPort {
  readonly izvor: 'pravila' | 'model';
  /** What produced the row, recorded per proposal: 'gpt-4o-mini', 'pravila-v1'. */
  readonly model: string;
  klasifikuj(ulaz: KlasifikacijaUlaz): Promise<KlasifikacijaPredlog>;
}
