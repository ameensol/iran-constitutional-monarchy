import type { GovState } from '../simulation/types';
import type { InstitutionId } from '../shared/useNavigation';
import InstitutionCard from './InstitutionCard';
import Badge from '../shared/Badge';
import { useTranslation } from 'react-i18next';
import { activeLocale, formatNumber, formatPercent, formationStageLabel } from '../i18n/simulatorFormat';

interface InstitutionGridProps {
  state: GovState;
  onClickInstitution?: (id: InstitutionId) => void;
}

export default function InstitutionGrid({ state, onClickInstitution }: InstitutionGridProps) {
  const { crown, parliament, executive, court, elections, budget, bills } = state;
  const { t, i18n } = useTranslation('simulator');
  const locale = activeLocale(i18n.language);
  const number = (value: number) => formatNumber(value, locale);

  const crownBills = bills.filter((b) => b.stage === 'Crown Action');
  const crownDeadline = crownBills.length > 0
    ? Math.min(...crownBills.map((b) => b.deadline)) - state.day
    : null;

  return (
    <div className="inst-grid">
      <InstitutionCard
        icon={'\u2654'}
        title={t('institutions.crown')}
        healthy={!crown.suspended}
        motif="/assets/lamassu.svg"
        tourId="crown"
        onClick={onClickInstitution ? () => onClickInstitution('crown') : undefined}
        rows={[
          { label: t('labels.status'), value: <Badge label={t(crown.suspended ? 'labels.suspended' : 'labels.active')} variant={crown.suspended ? 'rose' : 'gold'} /> },
          { label: t('labels.heirs'), value: number(crown.heirs) },
          { label: t('labels.suspended'), value: <span className={crown.suspended ? 'card-value rose' : 'card-value emerald'}>{t(crown.suspended ? 'labels.yes' : 'labels.no')}</span> },
          { label: t('labels.pendingActions'), value: <span className="card-value gold">{number(crown.pendingActions)}</span> },
        ]}
        countdown={crownDeadline !== null ? t('labels.crownDeadline', { days: number(crownDeadline) }) : undefined}
      />

      <InstitutionCard
        icon={'\u26E9'}
        title={t('institutions.parliament')}
        healthy={!parliament.dissolved}
        motif="/assets/three-courtiers.svg"
        tourId="parliament"
        onClick={onClickInstitution ? () => onClickInstitution('parliament') : undefined}
        rows={[
          {
            label: t('labels.majlisSeats'),
            value: <>{number(parliament.majlisSeats)} <span style={{ color: 'var(--pale-gold)', fontWeight: 300 }}>/ {number(parliament.majlisTotal)}</span></>,
          },
          {
            label: t('labels.senateSeats'),
            value: <>{number(parliament.senateSeats)} <span style={{ color: 'var(--pale-gold)', fontWeight: 300 }}>/ {number(parliament.senateTotal)}</span></>,
          },
          { label: t('labels.activeBills'), value: <span className="card-value gold">{number(bills.filter((b) => !['Enacted', 'Rejected', 'Vetoed'].includes(b.stage)).length)}</span> },
          { label: t('labels.dissolved'), value: <span className={parliament.dissolved ? 'card-value rose' : 'card-value emerald'}>{t(parliament.dissolved ? 'labels.yes' : 'labels.no')}</span> },
          { label: t('labels.quorum'), value: <Badge label={parliament.quorum ? '\u2713' : '\u2717'} variant={parliament.quorum ? 'emerald' : 'rose'} /> },
        ]}
      />

      <InstitutionCard
        icon={'\u2696'}
        title={t('institutions.executive')}
        healthy={executive.pmSeated}
        motif="/assets/offering-bearer.svg"
        tourId="executive"
        onClick={onClickInstitution ? () => onClickInstitution('executive') : undefined}
        rows={[
          { label: t('labels.primeMinister'), value: <Badge label={t(executive.pmSeated ? 'labels.seated' : 'labels.vacant')} variant={executive.pmSeated ? 'gold' : 'rose'} /> },
          { label: t('labels.caretaker'), value: <span className={executive.caretaker ? 'card-value rose' : 'card-value emerald'}>{t(executive.caretaker ? 'labels.yes' : 'labels.no')}</span> },
          { label: t('labels.formationStage'), value: <Badge label={formationStageLabel(executive.stage, t)} variant={executive.stage === 'Idle' ? 'none' : 'turquoise'} /> },
          { label: t('labels.cabinetMinisters'), value: number(executive.ministers) },
        ]}
      />

      <InstitutionCard
        icon={'\u2696'}
        title={t('institutions.court')}
        healthy={!court.crisis}
        motif="/assets/king-and-courtier.svg"
        tourId="court"
        onClick={onClickInstitution ? () => onClickInstitution('court') : undefined}
        rows={[
          {
            label: t('labels.justices'),
            value: <>{number(court.justices)} <span style={{ color: court.crisis ? 'var(--rose)' : 'var(--pale-gold)', fontWeight: 300 }}>/ {number(court.totalSeats)}</span></>,
          },
          { label: t('labels.activeReviews'), value: <span className="card-value turquoise">{number(court.activeReviews)}</span> },
          { label: t('labels.quorum'), value: <Badge label={court.justices >= Math.ceil(court.totalSeats * 2 / 3) ? '\u2713' : '\u2717'} variant={court.justices >= Math.ceil(court.totalSeats * 2 / 3) ? 'emerald' : 'rose'} /> },
          { label: t('labels.appointment'), value: court.pendingAppointment !== null ? <Badge label={t('labels.seat', { number: number(court.pendingAppointment) })} variant="turquoise" /> : <span className="card-value">{t('labels.none')}</span> },
        ]}
      />

      <InstitutionCard
        icon={'\u2611'}
        title={t('institutions.elections')}
        healthy={elections.active === 0}
        motif="/assets/palmette.svg"
        tourId="elections"
        onClick={onClickInstitution ? () => onClickInstitution('elections') : undefined}
        rows={[
          { label: t('labels.activeElections'), value: number(elections.active) },
          { label: t('labels.byElections'), value: <span className="card-value gold">{number(elections.byElectionsPending)}</span> },
          { label: t('labels.nextScheduled'), value: t('labels.days', { count: number(elections.nextScheduled) }) },
        ]}
        countdown={t('labels.nextElection', { days: number(elections.nextScheduled) })}
      />

      <InstitutionCard
        icon={'\u2696'}
        title={t('institutions.budget')}
        healthy={budget.auditClean}
        motif="/assets/noble-with-rhyton.svg"
        tourId="budget"
        onClick={onClickInstitution ? () => onClickInstitution('budget') : undefined}
        rows={[
          { label: t('labels.fiscalYear'), value: number(budget.fiscalYear) },
          { label: t('labels.status'), value: <Badge label={t(`budgetStatuses.${budget.status}`)} variant="gold" /> },
          { label: t('labels.allocated'), value: <span className="card-value">{formatPercent(budget.allocated, locale)}</span> },
          { label: t('labels.audit'), value: <Badge label={budget.auditClean ? '\u2713' : '\u2717'} variant={budget.auditClean ? 'emerald' : 'rose'} /> },
        ]}
      />
    </div>
  );
}
