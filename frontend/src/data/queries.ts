/**
 * React Query hook-ovi nad repo funkcijama. Komponente koriste ove hook-ove;
 * ključevi su centralizovani da bi invalidacija posle mutacija bila na jednom
 * mestu.
 */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AssistedReportInput, Id, LookupItem, NewReportInput, NewsInput, NewsPatch, RemovePhotoInput, ResolveInput, TriageInput } from '@/domain/types';
import { settlementName } from '@/lib/settlements';
import * as repo from './repo';

export const queryKeys = {
  settlements: ['settlements'] as const,
  settlementOptions: ['settlements', 'lookup'] as const,
  containerOptions: (naselje_id?: Id) => ['containers', 'lookup', naselje_id ?? 'sve'] as const,
  intermediaries: ['intermediaries'] as const,
  containers: (filter: repo.ContainerFilter = {}) => ['containers', filter] as const,
  container: (id: Id) => ['containers', id] as const,
  reports: (filter: repo.ReportFilter = {}) => ['reports', filter] as const,
  report: (id: Id) => ['reports', 'detail', id] as const,
  myReports: ['my-reports'] as const,
  myReport: (id: Id) => ['my-reports', id] as const,
  hotspots: (filter: repo.HotspotFilter = {}) => ['hotspots', filter] as const,
  settlementCoverage: ['settlement-coverage'] as const,
  trucks: ['trucks'] as const,
  plan: (date: string) => ['plan', date] as const,
  schedules: ['schedules'] as const,
  schedule: (settlementId: Id) => ['schedules', settlementId] as const,
  disposalSites: ['disposal-sites'] as const,
  wasteGuide: ['waste-guide'] as const,
  communityProfile: ['community', 'me'] as const,
  settlementRankings: ['community', 'rankings'] as const,
  news: (filter: repo.NewsFilter = {}) => ['news', filter] as const,
  dashboard: ['dashboard'] as const,
  routePlans: (datum: string) => ['route-plans', datum] as const,
};

// --- šifarnici sa backenda ---------------------------------------------------

/** Naselja iz baze; njihovi ID-jevi su jedini koje API prihvata. */
export const useSettlementOptions = () =>
  useQuery({ queryKey: queryKeys.settlementOptions, queryFn: () => repo.getSettlementOptions(), staleTime: 10 * 60_000 });

export const useContainerOptions = (naselje_id?: Id) =>
  useQuery({
    queryKey: queryKeys.containerOptions(naselje_id),
    queryFn: () => repo.getContainerOptions(naselje_id),
    staleTime: 5 * 60_000,
  });

export const useIntermediaries = () =>
  useQuery({ queryKey: queryKeys.intermediaries, queryFn: repo.getIntermediaries, staleTime: 10 * 60_000 });

/**
 * Naziv po ID-ju — tabele prikazuju ime, backend šalje UUID. Rezultat je
 * memoizovan jer ulazi u `useMemo` zavisnosti reda prijava.
 */
export function useLookupNames(items: LookupItem[] | undefined): (id: string | null | undefined) => string {
  return useMemo(() => {
    const map = new Map((items ?? []).map((i) => [i.id, i.naziv]));
    return (id: string | null | undefined) => (id ? (map.get(id) ?? '') : '');
  }, [items]);
}

/**
 * Naziv naselja za građansku zonu, gde se mešaju dva izvora: prijave poslate
 * kroz API nose UUID iz šifarnika, a demo prijave lokalne ID-jeve mock naselja.
 * Kad javno čitanje prijava stigne, ostaje samo prvi slučaj.
 */
export function useSettlementLabel(): (id: string | null | undefined) => string {
  const fromApi = useLookupNames(useSettlementOptions().data);
  return (id) => fromApi(id) || settlementName(id);
}

/**
 * Registar divljih deponija iz baze. Menja se samo pri ponovnom uvozu
 * (`npm run import:deponije`), pa je i kratak staleTime velikodušan.
 */
export const useHotspots = (filter: repo.HotspotFilter = {}) =>
  useQuery({ queryKey: queryKeys.hotspots(filter), queryFn: () => repo.getHotspots(filter), staleTime: 10 * 60_000 });

// --- mock podaci -------------------------------------------------------------

export const useSettlements = () => useQuery({ queryKey: queryKeys.settlements, queryFn: repo.getSettlements, staleTime: Infinity });

/** Svih 72 naselja sa zastavicom pokrivenosti; generisan skup, pa se ne osvežava. */
export const useSettlementCoverage = () =>
  useQuery({ queryKey: queryKeys.settlementCoverage, queryFn: repo.getSettlementCoverage, staleTime: Infinity });
/**
 * Flota. Podrazumevano samo kontejneri sa senzorom: bez njega nema ni
 * popunjenosti ni prognoze, pa bi mapa dobila stotine tačaka bez ijednog
 * podatka. Rutiranje zna za njih preko svog `bez_senzora` člana.
 */
export const useContainers = (filter: repo.ContainerFilter = { samo_sa_senzorom: true }) =>
  useQuery({ queryKey: queryKeys.containers(filter), queryFn: () => repo.getContainers(filter), staleTime: 60_000 });
export const useContainer = (id: Id | null) =>
  useQuery({ queryKey: queryKeys.container(id ?? ''), queryFn: () => repo.getContainer(id ?? ''), enabled: !!id });
export const useTrucks = () => useQuery({ queryKey: queryKeys.trucks, queryFn: repo.getTrucks });
export const useDailyPlan = (date: string) => useQuery({ queryKey: queryKeys.plan(date), queryFn: () => repo.getDailyPlan(date) });
export const useSchedules = () => useQuery({ queryKey: queryKeys.schedules, queryFn: repo.getSchedules });
export const useSchedule = (settlementId: Id | null) =>
  useQuery({
    queryKey: queryKeys.schedule(settlementId ?? ''),
    queryFn: () => repo.getSchedule(settlementId ?? ''),
    enabled: settlementId !== null,
  });
export const useDisposalSites = () => useQuery({ queryKey: queryKeys.disposalSites, queryFn: repo.getDisposalSites, staleTime: Infinity });
export const useWasteGuide = () => useQuery({ queryKey: queryKeys.wasteGuide, queryFn: repo.getWasteGuide, staleTime: Infinity });
export const useMyCommunityProfile = () =>
  useQuery({ queryKey: queryKeys.communityProfile, queryFn: repo.getMyCommunityProfile, staleTime: Infinity });
export const useSettlementRankings = () =>
  useQuery({ queryKey: queryKeys.settlementRankings, queryFn: repo.getSettlementRankings, staleTime: Infinity });
export const useDashboardSummary = () => useQuery({ queryKey: queryKeys.dashboard, queryFn: repo.getDashboardSummary });
export const useRoutePlans = (datum: string) =>
  useQuery({ queryKey: queryKeys.routePlans(datum), queryFn: () => repo.getRoutePlans(datum), retry: 0 });

// --- prijave -----------------------------------------------------------------

/** Red prijava sa backenda (operativa; traži prijavljenog radnika). */
export const useReports = (filter: repo.ReportFilter = {}) =>
  useQuery({ queryKey: queryKeys.reports(filter), queryFn: () => repo.getReports(filter) });

export const useReport = (id: Id) => useQuery({ queryKey: queryKeys.report(id), queryFn: () => repo.getReport(id), enabled: !!id });

/**
 * Prijava po kratkom kodu. Kod je javna potvrda prijema, ne lozinka — služi
 * dispečeru da nađe prijavu koju građanin pominje telefonom.
 */
export const useReportByCode = (kratki_kod: string) =>
  useQuery({
    queryKey: queryKeys.reports({ kratki_kod }),
    queryFn: async () => (await repo.getReports({ kratki_kod, limit: 1 }))[0] ?? null,
    enabled: kratki_kod.trim().length >= 4,
  });

/** Lokalno zapisane prijave građanina — backend nema javno čitanje. */
export const useMyReports = () => useQuery({ queryKey: queryKeys.myReports, queryFn: repo.getMyReports });
export const useMyReport = (id: Id) => useQuery({ queryKey: queryKeys.myReport(id), queryFn: () => repo.getMyReport(id), enabled: !!id });

/** Sve što zavisi od prijava: liste, detalji, dashboard i planovi ruta. */
function useInvalidateReports() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['reports'] }),
      client.invalidateQueries({ queryKey: queryKeys.myReports }),
      client.invalidateQueries({ queryKey: queryKeys.dashboard }),
      client.invalidateQueries({ queryKey: ['plan'] }),
    ]);
}

export function useCreateReport() {
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: (input: NewReportInput) => repo.createReport(input),
    onSuccess: () => invalidate(),
  });
}

export function useCreateAssistedReport() {
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: (input: AssistedReportInput) => repo.createAssistedReport(input),
    onSuccess: () => invalidate(),
  });
}

/**
 * Trijaža nosi `verzija` iz poslednjeg čitanja; posle uspeha se detalj mora
 * ponovo pročitati jer je verzija odmah zastarela za sledeću izmenu.
 */
export function useTriageReport() {
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: ({ id, ...body }: TriageInput & { id: Id }) => repo.triageReport(id, body),
    onSuccess: () => invalidate(),
  });
}

/**
 * Ponovna klasifikacija. Osvežava samo prijave: predlog stoji uz prijavu i
 * nigde drugde, pa dashboard i planovi ruta nemaju šta da preuzmu.
 */
export function useClassifyReport() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: Id) => repo.classifyReport(id),
    onSuccess: (_data, id) =>
      Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.report(id) }),
        client.invalidateQueries({ queryKey: ['reports'] }),
      ]),
  });
}

export function useResolveReport() {
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: ({ id, ...body }: ResolveInput & { id: Id }) => repo.resolveReport(id, body),
    onSuccess: () => invalidate(),
  });
}

// --- vesti -------------------------------------------------------------------

/**
 * Feed vesti sa backenda. Redosled (zakačene prvo, pa najnovije) dolazi sa
 * servera; filter po naselju uz objave tog naselja vraća i opštinske.
 */
export const useNews = (filter: repo.NewsFilter = {}) =>
  useQuery({ queryKey: queryKeys.news(filter), queryFn: () => repo.getNews(filter) });

/**
 * Jedna invalidacija za sve četiri administratorske radnje: feed građanina i
 * spisak u operativi čitaju isti izvor, pa izmena mora da osveži oba.
 */
function useInvalidateNews() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ['news'] });
}

export function useCreateNews() {
  const invalidate = useInvalidateNews();
  return useMutation({ mutationFn: (input: NewsInput) => repo.createNews(input), onSuccess: () => invalidate() });
}

/** `verzija` je obavezna — bez nje backend ne zna da li je izmena zastarela. */
export function useUpdateNews() {
  const invalidate = useInvalidateNews();
  return useMutation({
    mutationFn: ({ id, ...patch }: NewsPatch & { id: Id }) => repo.updateNews(id, patch),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteNews() {
  const invalidate = useInvalidateNews();
  return useMutation({ mutationFn: (id: Id) => repo.deleteNews(id), onSuccess: () => invalidate() });
}

export function useSetNewsPinned() {
  const invalidate = useInvalidateNews();
  return useMutation({
    mutationFn: ({ id, verzija, zakacena }: { id: Id; verzija: number; zakacena: boolean }) =>
      repo.setNewsPinned(id, verzija, zakacena),
    onSuccess: () => invalidate(),
  });
}

/**
 * Upload fotografije pre slanja prijave. Nema invalidacije: potvrda živi
 * samo u stanju čarobnjaka dok je prijava ne preuzme kroz `foto_ids`.
 */
export function useUploadReportPhoto() {
  return useMutation({ mutationFn: (file: File) => repo.uploadReportPhoto(file) });
}

/** Uklanjanje fotografije sa prijave (operativa); osvežava detalj i red. */
export function useRemoveReportPhoto() {
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: ({ id, fotoId, ...body }: RemovePhotoInput & { id: Id; fotoId: Id }) => repo.removeReportPhoto(id, fotoId, body),
    onSuccess: () => invalidate(),
  });
}

// --- pretraga „gde da odložim“ ---------------------------------------------

/**
 * Mutacija, ne upit: pretraga se šalje samo kad korisnik pritisne dugme.
 * `useQuery` bi je ponavljao sam (pri montiranju, osvežavanju, ponovnom
 * pokušaju), a svako ponavljanje je plaćen poziv modelu.
 */
export function useSuggestDisposal() {
  return useMutation({ mutationFn: (upit: string) => repo.suggestDisposal(upit), retry: false });
}

export function useGenerateDailyPlan() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (date: string) => repo.generateDailyPlan(date),
    onSuccess: (plan) => client.setQueryData(queryKeys.plan(plan.date), plan),
  });
}

/** Generiše plan preko pravog backenda i osvežava listu za taj datum sa istim odgovorom. */
export function useGenerateRoutePlan() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (datum: string) => repo.generateRoutePlan(datum),
    onSuccess: (result) => client.setQueryData(queryKeys.routePlans(result.datum), result.planovi),
  });
}
