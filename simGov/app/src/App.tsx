import { useState, useCallback } from 'react';
import { useSimulation } from './simulation/useSimulation';
import { useNavigation } from './shared/useNavigation';
import type { TourViewTarget } from './tour/tourTypes';
import type { TourActionContextValue } from './tour/TourActionContext';
import { TourActionProvider } from './tour/TourActionContext';
import Header from './dashboard/Header';
import Dashboard from './dashboard/Dashboard';
import BillDetail from './bill-lifecycle/BillDetail';
import BillLifecycleTour from './tour/BillLifecycleTour';
import GenesisTour from './tour/GenesisTour';
import PMFormationTour from './tour/PMFormationTour';
import GuardiansTour from './tour/GuardiansTour';
import ElectionDayTour from './tour/ElectionDayTour';
import PeoplesVetoTour from './tour/PeoplesVetoTour';
import RewritingRulesTour from './tour/RewritingRulesTour';
import SystemBreaksTour from './tour/SystemBreaksTour';
import TourHub from './tour/TourHub';
import InstitutionDetail from './institutions/InstitutionDetail';
import PersonDetail from './people/PersonDetail';
import ProcessDetail from './processes/ProcessDetail';
import DisasterPanel from './disasters/DisasterPanel';
import ShahSidebar from './shared/ShahToast';
import './tour/Tour.css';
import './tour/TourNarrator.css';

export default function App() {
  const sim = useSimulation();
  const nav = useNavigation();
  const [disasterOpen, setDisasterOpen] = useState(false);
  const [tourView, setTourView] = useState<TourViewTarget | undefined>(undefined);
  const [tourActionCtx, setTourActionCtx] = useState<TourActionContextValue>({ tourMode: false, activeTargets: [] });

  const setTourActions = useCallback((ctx: TourActionContextValue) => {
    setTourActionCtx(ctx);
  }, []);

  const { viewState } = nav;

  const selectedBill = viewState.billId !== undefined
    ? sim.state.bills.find((b) => b.id === viewState.billId)
    : null;

  // Sidebar is open when a tour is active or Shah commentary is showing
  const isTour = viewState.view === 'tour';
  const sidebarOpen = isTour || sim.commentary !== null;

  const handleTourClose = useCallback(() => {
    setTourView(undefined);
    setTourActionCtx({ tourMode: false, activeTargets: [] });
    sim.clearCommentary();
    nav.goBack();
  }, [nav, sim]);

  // Common tour props
  const tourProps = {
    state: sim.state,
    dispatch: sim.dispatch,
    speed: sim.speed,
    setSpeed: sim.setSpeed,
    onClose: handleTourClose,
    setTourView,
    setTourActions,
  };

  // What to show in the main area during a tour
  const showInstitutionDuringTour = isTour && tourView?.type === 'institution';

  // Show disasters button on dashboard and during tours (not on detail views)
  const showDisasters = viewState.view === 'dashboard' || isTour;

  return (
    <div className={sidebarOpen ? 'app-layout sidebar-open' : 'app-layout'}>
      <div className="app-main">
        {/* Always-visible header with speed controls */}
        <div className="global-header">
          <Header
            day={sim.state.day}
            year={sim.state.year}
            speed={sim.speed}
            onSetSpeed={sim.setSpeed}
            onSkip={sim.skip}
            onStartTour={() => nav.goToTourHub()}
            onOpenDisasters={showDisasters ? () => setDisasterOpen(true) : undefined}
            onLogoClick={viewState.view !== 'dashboard' ? () => nav.goToDashboard() : undefined}
          />
        </div>

        {/* Dashboard view */}
        {viewState.view === 'dashboard' && (
          <div className="view-enter"><Dashboard
            sim={sim}
            onSelectBill={(billId) => nav.goToBill(billId)}
            onClickInstitution={(id) => nav.goToInstitution(id)}
            onClickEventInstitution={(id) => nav.goToInstitution(id)}
          /></div>
        )}

        {/* Tour Hub view */}
        {viewState.view === 'tour-hub' && (
          <div className="view-enter"><TourHub
            onBack={() => nav.goBack()}
            onStartTour={(tourId) => nav.goToTour(tourId)}
          /></div>
        )}

        {/* Institution detail view */}
        {viewState.view === 'institution' && viewState.institutionId && (
          <div className="view-enter"><InstitutionDetail
            institutionId={viewState.institutionId}
            state={sim.state}
            dispatch={sim.dispatch}
            onBack={() => nav.goBack()}
            onClickPerson={(personId) => nav.goToPerson(personId)}
            onClickProcess={(processId) => nav.goToProcess(processId)}
            onClickBill={(billId) => nav.goToBill(billId)}
          /></div>
        )}

        {/* Bill detail view */}
        {viewState.view === 'bill' && selectedBill && (
          <div className="view-enter"><BillDetail
            bill={selectedBill}
            currentDay={sim.state.day}
            year={sim.state.year}
            onBack={() => nav.goBack()}
          /></div>
        )}

        {/* Person detail view */}
        {viewState.view === 'person' && viewState.personId !== undefined && (
          <div className="view-enter"><PersonDetail
            personId={viewState.personId}
            state={sim.state}
            dispatch={sim.dispatch}
            onBack={() => nav.goBack()}
          /></div>
        )}

        {/* Process detail view */}
        {viewState.view === 'process' && viewState.processId && (
          <div className="view-enter"><ProcessDetail
            processId={viewState.processId}
            state={sim.state}
            onBack={() => nav.goBack()}
          /></div>
        )}

        {/* Tour: show institution panel or dashboard behind the sidebar */}
        {isTour && (
          <TourActionProvider value={tourActionCtx}>
            {showInstitutionDuringTour ? (
              <div className="view-enter">
                <InstitutionDetail
                  institutionId={tourView.id}
                  state={sim.state}
                  dispatch={sim.dispatch}
                  onBack={() => setTourView({ type: 'dashboard' })}
                  readOnly
                  hideBack
                />
              </div>
            ) : (
              <Dashboard
                sim={sim}
                onSelectBill={(billId) => nav.goToBill(billId)}
              />
            )}
          </TourActionProvider>
        )}
      </div>

      {/* Right sidebar: tour narrator or Shah commentary */}
      {isTour && viewState.tourId === 'bill-lifecycle' && (
        <BillLifecycleTour {...tourProps} />
      )}

      {isTour && viewState.tourId === 'genesis' && (
        <GenesisTour {...tourProps} />
      )}

      {isTour && viewState.tourId === 'pm-formation' && (
        <PMFormationTour {...tourProps} />
      )}

      {isTour && viewState.tourId === 'guardians' && (
        <GuardiansTour {...tourProps} />
      )}

      {isTour && viewState.tourId === 'election-day' && (
        <ElectionDayTour {...tourProps} />
      )}

      {isTour && viewState.tourId === 'peoples-veto' && (
        <PeoplesVetoTour {...tourProps} />
      )}

      {isTour && viewState.tourId === 'rewriting-rules' && (
        <RewritingRulesTour {...tourProps} />
      )}

      {isTour && viewState.tourId === 'system-breaks' && (
        <SystemBreaksTour {...tourProps} />
      )}

      {!isTour && (
        <ShahSidebar text={sim.commentary} trigger={sim.commentaryTrigger} onDismiss={sim.clearCommentary} />
      )}

      {/* Disaster side panel */}
      {disasterOpen && (
        <DisasterPanel
          state={sim.state}
          dispatch={sim.dispatch}
          onClose={() => setDisasterOpen(false)}
        />
      )}
    </div>
  );
}
