import type { GovState } from '../simulation/types';
import type { InstitutionId } from '../shared/useNavigation';
import InstitutionCard from './InstitutionCard';
import Badge from '../shared/Badge';

interface InstitutionGridProps {
  state: GovState;
  onClickInstitution?: (id: InstitutionId) => void;
}

export default function InstitutionGrid({ state, onClickInstitution }: InstitutionGridProps) {
  const { crown, parliament, executive, court, elections, budget, bills } = state;

  const crownBills = bills.filter((b) => b.stage === 'Crown Action');
  const crownDeadline = crownBills.length > 0
    ? Math.min(...crownBills.map((b) => b.deadline)) - state.day
    : null;

  return (
    <div className="inst-grid">
      <InstitutionCard
        icon={'\u2654'}
        title="The Crown"
        healthy={!crown.suspended}
        motif="/assets/lamassu.svg"
        tourId="crown"
        onClick={onClickInstitution ? () => onClickInstitution('crown') : undefined}
        rows={[
          { label: 'Status', value: <Badge label={crown.suspended ? 'Suspended' : 'Active'} variant={crown.suspended ? 'rose' : 'gold'} /> },
          { label: 'Heirs in Succession', value: crown.heirs },
          { label: 'Suspended', value: <span className={crown.suspended ? 'card-value rose' : 'card-value emerald'}>{crown.suspended ? 'Yes' : 'No'}</span> },
          { label: 'Pending Actions', value: <span className="card-value gold">{crown.pendingActions}</span> },
        ]}
        countdown={crownDeadline !== null ? `Crown action deadline: ${crownDeadline}d` : undefined}
      />

      <InstitutionCard
        icon={'\u26E9'}
        title="Parliament"
        healthy={!parliament.dissolved}
        motif="/assets/three-courtiers.svg"
        tourId="parliament"
        onClick={onClickInstitution ? () => onClickInstitution('parliament') : undefined}
        rows={[
          {
            label: 'Majlis Seats',
            value: <>{parliament.majlisSeats} <span style={{ color: 'var(--pale-gold)', fontWeight: 300 }}>/ {parliament.majlisTotal}</span></>,
          },
          {
            label: 'Senate Seats',
            value: <>{parliament.senateSeats} <span style={{ color: 'var(--pale-gold)', fontWeight: 300 }}>/ {parliament.senateTotal}</span></>,
          },
          { label: 'Active Bills', value: <span className="card-value gold">{bills.filter((b) => !['Enacted', 'Rejected', 'Vetoed'].includes(b.stage)).length}</span> },
          { label: 'Dissolved', value: <span className={parliament.dissolved ? 'card-value rose' : 'card-value emerald'}>{parliament.dissolved ? 'Yes' : 'No'}</span> },
          { label: 'Quorum', value: <Badge label={parliament.quorum ? '\u2713' : '\u2717'} variant={parliament.quorum ? 'emerald' : 'rose'} /> },
        ]}
      />

      <InstitutionCard
        icon={'\u2696'}
        title="Executive"
        healthy={executive.pmSeated}
        motif="/assets/offering-bearer.svg"
        tourId="executive"
        onClick={onClickInstitution ? () => onClickInstitution('executive') : undefined}
        rows={[
          { label: 'Prime Minister', value: <Badge label={executive.pmSeated ? 'Seated' : 'Vacant'} variant={executive.pmSeated ? 'gold' : 'rose'} /> },
          { label: 'Caretaker', value: <span className={executive.caretaker ? 'card-value rose' : 'card-value emerald'}>{executive.caretaker ? 'Yes' : 'No'}</span> },
          { label: 'Formation Stage', value: <Badge label={executive.stage} variant={executive.stage === 'Idle' ? 'none' : 'turquoise'} /> },
          { label: 'Cabinet Ministers', value: executive.ministers },
        ]}
      />

      <InstitutionCard
        icon={'\u2696'}
        title="Supreme Court"
        healthy={!court.crisis}
        motif="/assets/king-and-courtier.svg"
        tourId="court"
        onClick={onClickInstitution ? () => onClickInstitution('court') : undefined}
        rows={[
          {
            label: 'Justices',
            value: <>{court.justices} <span style={{ color: court.crisis ? 'var(--rose)' : 'var(--pale-gold)', fontWeight: 300 }}>/ {court.totalSeats}</span></>,
          },
          { label: 'Active Reviews', value: <span className="card-value turquoise">{court.activeReviews}</span> },
          { label: 'Quorum', value: <Badge label={court.justices >= Math.ceil(court.totalSeats * 2 / 3) ? '\u2713' : '\u2717'} variant={court.justices >= Math.ceil(court.totalSeats * 2 / 3) ? 'emerald' : 'rose'} /> },
          { label: 'Appointment', value: court.pendingAppointment !== null ? <Badge label={`Seat ${court.pendingAppointment}`} variant="turquoise" /> : <span className="card-value">None</span> },
        ]}
      />

      <InstitutionCard
        icon={'\u2611'}
        title="Elections"
        healthy={elections.active === 0}
        motif="/assets/palmette.svg"
        tourId="elections"
        onClick={onClickInstitution ? () => onClickInstitution('elections') : undefined}
        rows={[
          { label: 'Active Elections', value: elections.active },
          { label: 'By-elections Pending', value: <span className="card-value gold">{elections.byElectionsPending}</span> },
          { label: 'Next Scheduled', value: `${elections.nextScheduled} days` },
        ]}
        countdown={`Next election: ${elections.nextScheduled}d`}
      />

      <InstitutionCard
        icon={'\u2696'}
        title="Budget"
        healthy={budget.auditClean}
        motif="/assets/noble-with-rhyton.svg"
        tourId="budget"
        onClick={onClickInstitution ? () => onClickInstitution('budget') : undefined}
        rows={[
          { label: 'Fiscal Year', value: budget.fiscalYear },
          { label: 'Status', value: <Badge label={budget.status} variant="gold" /> },
          { label: 'Allocated', value: <span className="card-value">{budget.allocated}%</span> },
          { label: 'Audit', value: <Badge label={budget.auditClean ? '\u2713' : '\u2717'} variant={budget.auditClean ? 'emerald' : 'rose'} /> },
        ]}
      />
    </div>
  );
}
