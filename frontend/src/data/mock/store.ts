import type { DailyPlan, Id, NewReportInput, PhotoReceipt, ReportDetail, ReportDto, ReportReceipt } from '@/domain/types';
import { initialReports } from './reports';
import { buildDailyPlan } from './routes';

/**
 * Promenljivo stanje demo sveta: prijave koje građanin vidi u „Mojim
 * prijavama“ i planovi ruta.
 *
 * Operativa ovo više ne dira — trijaža, rešavanje i vesti idu na backend.
 * Ostaje zato što javno čitanje prijava ne postoji u ugovoru: `POST /reports`
 * vraća samo kratki kod, pa prijava poslata iz čarobnjaka ovde dobija svoj
 * zapis da građanin ima šta da otvori. Nestaje čim backend dobije javnu putanju.
 */
let reports: ReportDetail[] = initialReports.map((r) => ({ ...r }));
const plans = new Map<string, DailyPlan>();

export const store = {
  getReports: (): ReportDetail[] => reports,

  getReport: (id: Id): ReportDetail | undefined => reports.find((r) => r.id === id),

  getReportByCode: (kod: string): ReportDetail | undefined => reports.find((r) => r.kratki_kod === kod),

  /**
   * Zapisuje prijavu koju je backend upravo primio. Kratki kod i vreme prijema
   * dolaze iz potvrde servera, ne iz lokalnog brojača — to su jedini podaci
   * koje građanin kasnije može da pokaže dispečeru. Fotografije su potvrde
   * upload-a: `javni_url` u njima je ista adresa koju će videti i dispečer.
   */
  addLocalReport(input: Omit<NewReportInput, 'fotografije'>, receipt: ReportReceipt, photos: PhotoReceipt[]): ReportDetail {
    const snapshot: ReportDto = {
      id: `local-${receipt.kratki_kod}`,
      kratki_kod: receipt.kratki_kod,
      tip: input.tip,
      status: receipt.status,
      opis: input.opis ?? null,
      opis_lokacije: input.opis_lokacije ?? null,
      naselje_id: input.naselje_id ?? null,
      kontejner_id: input.kontejner_id ?? null,
      // Veza sa registrom deponija nastaje tek pri potvrdi, kod dispečera.
      kanonska_id: null,
      // Čarobnjak je u aplikaciji; SMS, Viber i posrednik ulaze drugim putem.
      kanal: 'mobilna',
      posrednik_id: null,
      preciznost_lokacije: input.preciznost_lokacije ?? (input.tacka ? 'gps' : 'naselje'),
      tacka: input.tacka ?? null,
      velicina: input.velicina ?? null,
      // Prioritet i obrada postoje tek posle trijaže dispečera.
      prioritet: null,
      tip_obrade: null,
      duplikat_od: null,
      primljena_at: receipt.primljena_at,
      potvrdjena_at: null,
      resena_at: null,
      azurirana_at: receipt.primljena_at,
      verzija: 1,
    };

    // Istorija drži snimak stanja posle akcije — isto što backend upisuje u
    // `prijava_istorija` pri kreiranju, sa `prethodno: null`.
    const report: ReportDetail = {
      ...snapshot,
      // Tek primljena prijava još nije klasifikovana; na backendu je to red
      // čekanja koji radnik preuzima za par sekundi.
      klasifikacija: null,
      fotografije: photos.map((f) => ({
        id: f.foto_id,
        javni_url: f.javni_url,
        mime_tip: f.mime_tip,
        velicina_bajt: f.velicina_bajt,
        // Potvrda upload-a ne nosi EXIF vreme; backend ga čita tek pri prikazu.
        snimljeno_at: null,
        otpremljena_at: receipt.primljena_at,
      })),
      istorija: [
        {
          akcija: 'kreirana',
          nastalo_at: receipt.primljena_at,
          korisnik_id: null,
          razlog: null,
          verzija: 1,
          prethodno: null,
          novo: snapshot,
        },
      ],
    };

    reports = [report, ...reports];
    plans.clear();
    return report;
  },

  getPlan(date: string): DailyPlan {
    let plan = plans.get(date);
    if (!plan) {
      plan = buildDailyPlan(date, reports);
      plans.set(date, plan);
    }
    return plan;
  },

  regeneratePlan(date: string): DailyPlan {
    const plan = buildDailyPlan(date, reports);
    plans.set(date, plan);
    return plan;
  },
};
