/**
 * Kategorička paleta za razlikovanje vozila na mapi kad je vidljivo više ruta
 * odjednom. Namerno van semantike prioriteta — crvena/žuta na mapi rute već
 * znače "obavezno"/"opciono" (RoutesPage, RAZLOG_CLASS), pa boja vozila ne
 * sme da se poklopi s tim značenjem.
 */
export const ROUTE_COLORS = [
  '#2563eb', // plava
  '#9333ea', // ljubičasta
  '#0d9488', // tirkizna
  '#ea580c', // narandžasta
  '#db2777', // roze
  '#4f46e5', // indigo
  '#0891b2', // cijan
  '#65a30d', // limun
] as const;

export function routeColor(index: number): string {
  return ROUTE_COLORS[index % ROUTE_COLORS.length] ?? ROUTE_COLORS[0];
}
