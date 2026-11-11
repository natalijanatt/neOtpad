import type { AppMaterijalOtpada } from '../database/generated/schema';

/**
 * The vocabulary shared by the classifier, the collectors and the drop-off
 * sites (`app.materijal_otpada`). Sites and collectors each state which of
 * these they take; nothing in code maps a material to a site.
 */
export const MATERIJALI: AppMaterijalOtpada[] = [
  'staklo', 'plastika', 'papir', 'kabasti', 'elektronski', 'baterije', 'gume', 'zeleni',
  'metal', 'iverica', 'drvo', 'tekstil', 'gradjevinski',
];

export function isMaterijal(value: unknown): value is AppMaterijalOtpada {
  return typeof value === 'string' && (MATERIJALI as string[]).includes(value);
}

/**
 * What each category means, with the words people actually use for it. This
 * text goes into the model prompt verbatim, so it is written for the model: the
 * examples are colloquial, dialectal and misspelled on purpose, because that is
 * what the search box receives.
 */
export const MATERIJAL_OPIS: Record<AppMaterijalOtpada, string> = {
  staklo: 'glass: bottles and jars (flaše, tegle), window glass, mirrors (ogledalo)',
  plastika: 'plastic: PET bottles, bags (kese, najlon), foil, styrofoam (stiropor), canisters',
  papir: 'paper and cardboard: newspapers (novine), boxes (kutije, karton), books, old "hartija"',
  kabasti: 'bulky household items not made mainly of particle board: sofa (kauč, trosed), mattress (dušek), armchair, carpet (tepih), bed frame',
  elektronski: 'anything with a plug or battery inside: fridge (frižider), freezer, washing machine (veš mašina), stove (šporet), boiler (bojler), TV, phone, computer (kompjuter), heater, small appliances',
  baterije: 'batteries, car batteries (akumulator) and old medicines (lekovi)',
  gume: 'tyres (gume, auto gume, pneumatici)',
  zeleni: 'garden waste: leaves (lišće), grass (trava), branches (granje), vine cuttings (loza), straw (slama)',
  metal: 'scrap metal: iron (gvožđe, železo, željezo), sheet metal (lim), copper (bakar), aluminium, cans, rims (felne), old bicycles, radiators',
  iverica: 'particle board and furniture panels: iverica, univer, MDF, medijapan, šperploča, furniture made of them (ormar, regal, kuhinjski elementi)',
  drvo: 'wood that is not garden waste: planks (daske), pallets (palete), beams, firewood leftovers',
  tekstil: 'textiles: clothes (odeća, garderoba, stvari), shoes (cipele, patike), rags (krpe), blankets (ćebe)',
  gradjevinski: 'construction waste: rubble (šut), bricks (cigle), roof tiles (crep), concrete, tiles (pločice), plaster',
};
