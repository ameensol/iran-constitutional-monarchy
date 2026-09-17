import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

export type InstitutionId = 'crown' | 'parliament' | 'executive' | 'court' | 'elections' | 'budget';

export interface ViewState {
  view: 'dashboard' | 'institution' | 'bill' | 'process' | 'person' | 'tour' | 'tour-hub';
  institutionId?: InstitutionId;
  billId?: number;
  processId?: string;
  personId?: number;
  tourId?: string;
}

export interface NavigationControls {
  viewState: ViewState;
  goBack: () => void;
  goToDashboard: () => void;
  goToInstitution: (id: InstitutionId) => void;
  goToBill: (billId: number) => void;
  goToPerson: (personId: number) => void;
  goToProcess: (processId: string) => void;
  goToTour: (tourId?: string) => void;
  goToTourHub: () => void;
}

function parseView(pathname: string): ViewState {
  const marker = '/simulate';
  const suffix = pathname.slice(pathname.indexOf(marker) + marker.length).replace(/^\/+|\/+$/g, '');
  const [section, rawId] = suffix.split('/');
  if (!section) return { view: 'dashboard' };
  if (section === 'tours' && !rawId) return { view: 'tour-hub' };
  if (section === 'tours' && rawId) return { view: 'tour', tourId: decodeURIComponent(rawId) };
  if (section === 'institutions' && rawId) return { view: 'institution', institutionId: decodeURIComponent(rawId) as InstitutionId };
  if (section === 'bills' && rawId) return { view: 'bill', billId: Number(rawId) };
  if (section === 'people' && rawId) return { view: 'person', personId: Number(rawId) };
  if (section === 'processes' && rawId) return { view: 'process', processId: decodeURIComponent(rawId) };
  return { view: 'dashboard' };
}

export function useNavigation(): NavigationControls {
  const { locale = 'en' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const base = `/${locale}/simulate`;
  const viewState = useMemo(() => parseView(location.pathname), [location.pathname]);

  const goBack = useCallback(() => navigate(-1), [navigate]);
  const goToDashboard = useCallback(() => navigate(base), [base, navigate]);
  const goToInstitution = useCallback((id: InstitutionId) => navigate(`${base}/institutions/${id}`), [base, navigate]);
  const goToBill = useCallback((billId: number) => navigate(`${base}/bills/${billId}`), [base, navigate]);
  const goToPerson = useCallback((personId: number) => navigate(`${base}/people/${personId}`), [base, navigate]);
  const goToProcess = useCallback((processId: string) => navigate(`${base}/processes/${encodeURIComponent(processId)}`), [base, navigate]);
  const goToTour = useCallback((tourId = 'genesis') => navigate(`${base}/tours/${tourId}`), [base, navigate]);
  const goToTourHub = useCallback(() => navigate(`${base}/tours`), [base, navigate]);

  return { viewState, goBack, goToDashboard, goToInstitution, goToBill, goToPerson, goToProcess, goToTour, goToTourHub };
}
