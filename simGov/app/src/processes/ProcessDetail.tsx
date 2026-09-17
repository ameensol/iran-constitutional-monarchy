import type { GovState } from '../simulation/types';
import { personById } from '../simulation/selectors';
import ElectionFlowchart from './ElectionFlowchart';
import FormationFlowchart from './FormationFlowchart';
import AppointmentFlowchart from './AppointmentFlowchart';
import AmendmentFlowchart from './AmendmentFlowchart';
import './ProcessDetail.css';
import { useTranslation } from 'react-i18next';
import { activeLocale, formatNumber, namedEntityDisplayName, personDisplayName } from '../i18n/simulatorFormat';

interface Props {
  processId: string;
  state: GovState;
  onBack: () => void;
}

/**
 * processId format:
 *  - "election-{id}" → ElectionFlowchart
 *  - "formation" → FormationFlowchart
 *  - "appointment-{seatNumber}" → AppointmentFlowchart
 *  - "amendment-{id}" → AmendmentFlowchart
 */
export default function ProcessDetail({ processId, state, onBack }: Props) {
  const { t, i18n } = useTranslation('simulator');
  const locale = activeLocale(i18n.language);
  let title = t('process.process');
  let content: React.ReactNode = null;

  if (processId === 'formation') {
    title = t('process.formation');
    const f = state.executive.formation;
    const nominee = f.nomineeId !== null ? personById(state, f.nomineeId) : null;
    content = (
      <FormationFlowchart
        currentStage={f.stage}
        deadline={f.deadline}
        currentDay={state.day}
        nomineeName={nominee ? personDisplayName(nominee, locale) : null}
      />
    );
  } else if (processId.startsWith('election-')) {
    const elId = parseInt(processId.replace('election-', ''), 10);
    const election = state.elections.processes.find((e) => e.id === elId);
    if (election) {
      const typeLabels: Record<string, string> = {
        majlis_general: t('process.majlisGeneral'), senate: t('process.senate'), provincial: t('process.provincial'),
        majlis_byelection: t('process.majlisByelection'), senate_byelection: t('process.senateByelection'),
      };
      title = typeLabels[election.electionType] || t('process.election');
      content = (
        <ElectionFlowchart
          currentPhase={election.phase}
          seatsContested={election.seatsContested}
          deadline={election.phaseDeadline}
          currentDay={state.day}
        />
      );
    }
  } else if (processId.startsWith('appointment-')) {
    const seatNum = parseInt(processId.replace('appointment-', ''), 10);
    const appt = state.court.appointments.find((a) => a.seatNumber === seatNum);
    if (appt) {
      title = t('process.appointment', { seat: formatNumber(seatNum, locale) });
      content = (
        <AppointmentFlowchart
          currentPhase={appt.phase}
          seatNumber={appt.seatNumber}
          deadline={appt.deadline}
          currentDay={state.day}
        />
      );
    }
  } else if (processId.startsWith('amendment-')) {
    const amId = parseInt(processId.replace('amendment-', ''), 10);
    const amendment = state.amendments.find((a) => a.id === amId);
    if (amendment) {
      title = t('process.amendment', { title: namedEntityDisplayName(amendment.title, locale, t) });
      content = (
        <AmendmentFlowchart
          currentPhase={amendment.phase}
          title={amendment.title}
          deadline={amendment.deadline}
          currentDay={state.day}
          parlYes={amendment.parlYes}
          parlNo={amendment.parlNo}
          refYes={amendment.refYes}
          refNo={amendment.refNo}
          emergency={amendment.emergency}
        />
      );
    }
  }

  return (
    <div className="process-shell">
      <button className="back-btn" onClick={onBack}><span aria-hidden="true">&#x2190;</span> {t('actions.back')}</button>

      <div className="process-header">
        <div className="process-label">{t('process.label')}</div>
        <h2 className="process-title">{title}</h2>
        <div className="process-header-ornament">
          <img src="/assets/eslimi-corner.svg" className="persian-art" alt="" />
        </div>
      </div>

      {content || (
        <div className="process-empty">{t('process.empty')}</div>
      )}
    </div>
  );
}
