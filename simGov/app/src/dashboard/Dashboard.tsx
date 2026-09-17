import type { SimulationControls } from '../simulation/useSimulation';
import type { InstitutionId } from '../shared/useNavigation';
import InstitutionGrid from './InstitutionGrid';
import BillsTable from './BillsTable';
import EventLog from './EventLog';
import BreakingNewsBanner from './BreakingNewsBanner';
import { useTranslation } from 'react-i18next';
import './Dashboard.css';

interface DashboardProps {
  sim: SimulationControls;
  onSelectBill: (billId: number) => void;
  onClickInstitution?: (id: InstitutionId) => void;
  onClickEventInstitution?: (id: InstitutionId) => void;
}

export default function Dashboard({ sim, onSelectBill, onClickInstitution, onClickEventInstitution }: DashboardProps) {
  const { state } = sim;
  const { t } = useTranslation('simulator');

  return (
    <>
      <div className="bg-watermark">
        <img src="/assets/simorgh.svg" className="persian-art" alt="" />
      </div>

      <div className="shell">
        <BreakingNewsBanner
          headline={sim.breakingHeadline}
          autoDismissMs={sim.breakingAutoDismissMs}
          onDismiss={sim.dismissBreaking}
        />

        <div className="section-title">{t('sections.institutions')}</div>
        <InstitutionGrid state={state} onClickInstitution={onClickInstitution} />

        <div className="section-title">{t('sections.activeBills')}</div>
        <div className="section-divider" />
        <div data-tour-id="bills">
          <BillsTable bills={state.bills} currentDay={state.day} onSelectBill={onSelectBill} />
        </div>

        <div className="section-title">{t('sections.gazette')}</div>
        <div className="section-divider" />
        <div data-tour-id="events">
          <EventLog
            events={state.events}
            onClickEvent={onClickEventInstitution ? (event) => {
              const markerToInstitution: Record<string, InstitutionId> = {
                crown: 'crown',
                parl: 'parliament',
                exec: 'executive',
                court: 'court',
                election: 'elections',
                budget: 'budget',
              };
              const inst = markerToInstitution[event.marker];
              if (inst) onClickEventInstitution(inst);
            } : undefined}
          />
        </div>
      </div>
    </>
  );
}
