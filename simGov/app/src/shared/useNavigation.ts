import { useState, useCallback, useEffect } from 'react';

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

const INITIAL_STATE: ViewState = { view: 'dashboard' };

function navigate(setViewState: React.Dispatch<React.SetStateAction<ViewState>>, state: ViewState) {
  setViewState(state);
  history.pushState(state, '', null);
}

export function useNavigation(): NavigationControls {
  const [viewState, setViewState] = useState<ViewState>(INITIAL_STATE);

  // Replace the initial history entry with our state so popstate always has ViewState
  useEffect(() => {
    history.replaceState(INITIAL_STATE, '', null);

    const onPopState = (e: PopStateEvent) => {
      if (e.state && typeof e.state.view === 'string') {
        setViewState(e.state as ViewState);
      } else {
        setViewState(INITIAL_STATE);
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const goBack = useCallback(() => {
    history.back();
  }, []);

  const goToDashboard = useCallback(() => {
    navigate(setViewState, { view: 'dashboard' });
  }, []);

  const goToInstitution = useCallback((id: InstitutionId) => {
    navigate(setViewState, { view: 'institution', institutionId: id });
  }, []);

  const goToBill = useCallback((billId: number) => {
    navigate(setViewState, { view: 'bill', billId });
  }, []);

  const goToPerson = useCallback((personId: number) => {
    navigate(setViewState, { view: 'person', personId });
  }, []);

  const goToProcess = useCallback((processId: string) => {
    navigate(setViewState, { view: 'process', processId });
  }, []);

  const goToTour = useCallback((tourId?: string) => {
    navigate(setViewState, { view: 'tour', tourId });
  }, []);

  const goToTourHub = useCallback(() => {
    navigate(setViewState, { view: 'tour-hub' });
  }, []);

  return {
    viewState,
    goBack,
    goToDashboard,
    goToInstitution,
    goToBill,
    goToPerson,
    goToProcess,
    goToTour,
    goToTourHub,
  };
}
