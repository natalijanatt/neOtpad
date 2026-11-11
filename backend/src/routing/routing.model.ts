/**
 * Vehicles, the daily plans generated for them, and the stops on those plans.
 *
 * A plan is generated as a proposal and approved by a dispatcher, so the model
 * carries the things that approval is made of: the weights the plan was produced
 * with, and a reason on every single stop.
 */
import type { Tacka } from '../common/geo';

export interface Vozilo {
  id: string;
  oznaka: string;
  kapacitet_m3: number;
  kapacitet_kg: number | null;
  potrosnja_l_100km: number | null;
  /** Where the route starts and ends. */
  depo: Tacka;
  aktivno: boolean;
}

/**
 * The objective weights a plan was produced with, stored per plan rather than
 * read from configuration. Cost and the ecological goal are claimed to be one
 * objective; keeping the weights is what lets anyone check that claim against a
 * route that was actually driven.
 */
export type CiljFunkcija = Record<string, number>;

export interface PlanRute {
  id: string;
  datum: string;
  vozilo_id: string;
  /** predlog | odobren | u_toku | zavrsen — a plan is never dispatched unapproved. */
  status: string;
  generisan_at: Date;
  algoritam: string;
  cilj_funkcija: CiljFunkcija;
  ukupna_distanca_m: number | null;
  ukupno_trajanje_min: number | null;
}

export interface StajalisteRute {
  id: string;
  plan_rute_id: string;
  redosled: number;
  sabirno_mesto_id: string | null;
  kontejner_id: string | null;
  prijava_id: string | null;
  planirani_dolazak: Date | null;
  ocekivano_punjenje: number | null;
  /**
   * rutinski | prelivanje_rizik | rizik_divlje_deponije | prijava | usput.
   * A remote village has to be able to show its own reason for being on the
   * route, because distance alone would always argue for dropping it.
   */
  razlog: string;
  doprinos_ceni: number | null;
  stvarni_dolazak: Date | null;
  izvrseno: boolean;
  /** senzor_praznjenje | vozac | gps — how we know the stop really happened. */
  potvrda_izvora: string | null;
}

/**
 * A cached distance between two points. `izvor` separates a straight-line
 * estimate from a real road distance, so swapping in OSRM later adds rows
 * instead of rewriting them.
 */
export interface Rastojanje {
  id: string;
  od_tacka: Tacka;
  do_tacka: Tacka;
  /** haversine | osrm. */
  izvor: string;
  distanca_m: number;
  trajanje_s: number | null;
  izracunato_at: Date;
}
