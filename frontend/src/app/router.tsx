import { createBrowserRouter } from 'react-router';
import { ErrorPage } from './ErrorPage';
import { CitizenLayout } from './layouts/CitizenLayout';
import { OpsLayout } from './layouts/OpsLayout';
import { LandingPage } from '@/features/landing/LandingPage';

/**
 * Sve rute aplikacije. Stranice se učitavaju lenjo po zoni, pa građanin na
 * telefonu ne skida kod za operativu.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <LandingPage /> },

      {
        path: 'gradjanin',
        element: <CitizenLayout />,
        children: [
          { index: true, lazy: () => import('@/features/gradjanin/pocetna/HomePage').then((m) => ({ Component: m.HomePage })) },
          { path: 'prijava', lazy: () => import('@/features/gradjanin/prijava/ReportWizardPage').then((m) => ({ Component: m.ReportWizardPage })) },
          { path: 'prijave', lazy: () => import('@/features/gradjanin/prijave/MyReportsPage').then((m) => ({ Component: m.MyReportsPage })) },
          { path: 'prijave/:id', lazy: () => import('@/features/gradjanin/prijave/ReportDetailPage').then((m) => ({ Component: m.ReportDetailPage })) },
          { path: 'vesti', lazy: () => import('@/features/gradjanin/vesti/NewsFeedPage').then((m) => ({ Component: m.NewsFeedPage })) },
          { path: 'raspored', lazy: () => import('@/features/gradjanin/raspored/SchedulePage').then((m) => ({ Component: m.SchedulePage })) },
          { path: 'mapa', lazy: () => import('@/features/gradjanin/mapa/DisposalMapPage').then((m) => ({ Component: m.DisposalMapPage })) },
          { path: 'vodic', lazy: () => import('@/features/gradjanin/vodic/GuidePage').then((m) => ({ Component: m.GuidePage })) },
          { path: 'profil', lazy: () => import('@/features/gradjanin/profil/ProfilePage').then((m) => ({ Component: m.ProfilePage })) },
        ],
      },

      // Prijava stoji van OpsLayout-a: layout je iza čuvara sesije, pa bi
      // ekran za prijavu unutar njega preusmeravao sam na sebe.
      { path: 'operativa/login', lazy: () => import('@/features/operativa/auth/LoginPage').then((m) => ({ Component: m.LoginPage })) },

      {
        path: 'operativa',
        element: <OpsLayout />,
        children: [
          { index: true, lazy: () => import('@/features/operativa/dashboard/DashboardPage').then((m) => ({ Component: m.DashboardPage })) },
          { path: 'mapa', lazy: () => import('@/features/operativa/mapa/MapPage').then((m) => ({ Component: m.MapPage })) },
          { path: 'pokrivenost', lazy: () => import('@/features/operativa/pokrivenost/CoverageMapPage').then((m) => ({ Component: m.CoverageMapPage })) },
          { path: 'kontejneri', lazy: () => import('@/features/operativa/kontejneri/ContainersPage').then((m) => ({ Component: m.ContainersPage })) },
          { path: 'kontejneri/:id', lazy: () => import('@/features/operativa/kontejneri/ContainerDetailPage').then((m) => ({ Component: m.ContainerDetailPage })) },
          { path: 'prijave', lazy: () => import('@/features/operativa/prijave/ReportsQueuePage').then((m) => ({ Component: m.ReportsQueuePage })) },
          { path: 'prijave/:id', lazy: () => import('@/features/operativa/prijave/OpsReportDetailPage').then((m) => ({ Component: m.OpsReportDetailPage })) },
          { path: 'rute', lazy: () => import('@/features/operativa/rute/RoutesPage').then((m) => ({ Component: m.RoutesPage })) },
          { path: 'vesti', lazy: () => import('@/features/operativa/vesti/NewsAdminPage').then((m) => ({ Component: m.NewsAdminPage })) },
          { path: 'analitika', lazy: () => import('@/features/operativa/analitika/AnalyticsPage').then((m) => ({ Component: m.AnalyticsPage })) },
          { path: 'zajednica', lazy: () => import('@/features/operativa/zajednica/CommunityPage').then((m) => ({ Component: m.CommunityPage })) },
        ],
      },
    ],
  },
]);
