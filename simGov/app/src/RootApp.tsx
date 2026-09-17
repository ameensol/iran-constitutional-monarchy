import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LocaleGate, PublicLayout } from './public/PublicLayout';
import { AboutPage, CommunityPage, ConstitutionPage, LandingPage, LearnPage, LearnTopicPage, NotFoundPage, TransparencyPage } from './public/pages';

const Simulator = lazy(() => import('./App'));
const DesignSystemCatalog = lazy(() => import('./design-system/DesignSystemCatalog'));

function InitialRedirect() {
  const saved = localStorage.getItem('constitution-lab-locale');
  const locale = saved === 'fa' || saved === 'en' ? saved : navigator.language.toLowerCase().startsWith('fa') ? 'fa' : 'en';
  return <Navigate to={`/${locale}`} replace />;
}

function LoadingScreen() {
  const { t } = useTranslation('common');
  return <div className="route-loading" role="status"><img src="/assets/rosette.svg" alt="" /><span>{t('loading')}</span></div>;
}

export default function RootApp() {
  return <BrowserRouter><Routes>
    <Route path="/" element={<InitialRedirect />} />
    <Route path="/dev/design-system" element={<Navigate to="/en/dev/design-system" replace />} />
    <Route path="/:locale" element={<LocaleGate />}>
      <Route element={<PublicLayout />}>
        <Route index element={<LandingPage />} />
        <Route path="learn" element={<LearnPage />} />
        <Route path="learn/:topic" element={<LearnTopicPage />} />
        <Route path="constitution" element={<ConstitutionPage />} />
        <Route path="transparency" element={<TransparencyPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="community" element={<CommunityPage />} />
        {import.meta.env.DEV && <Route path="dev/design-system" element={<Suspense fallback={<LoadingScreen />}><DesignSystemCatalog /></Suspense>} />}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="simulate/*" element={<Suspense fallback={<LoadingScreen />}><Simulator /></Suspense>} />
    </Route>
    <Route path="*" element={<Navigate to="/en" replace />} />
  </Routes></BrowserRouter>;
}
