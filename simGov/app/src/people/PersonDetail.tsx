import { useState } from 'react';
import type { GovState, GovAction } from '../simulation/types';
import { personName } from '../simulation/types';
import { personById } from '../simulation/selectors';
import { provinceById } from '../simulation/provinces';
import Badge from '../shared/Badge';
import './People.css';

interface Props {
  personId: number;
  state: GovState;
  dispatch: React.Dispatch<GovAction>;
  onBack: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  'monarch': 'Monarch',
  'heir': 'Heir to the Throne',
  'majlis_member': 'Majlis Member',
  'senator': 'Senator (Elected)',
  'crown_senator': 'Senator (Crown-appointed)',
  'justice': 'Supreme Court Justice',
  'prime_minister': 'Prime Minister',
  'deputy_pm': 'Deputy Prime Minister',
  'minister': 'Cabinet Minister',
  'provincial_council': 'Provincial Council Member',
};

export default function PersonDetail({ personId, state, dispatch, onBack }: Props) {
  const person = personById(state, personId);

  if (!person) {
    return (
      <div className="person-detail-shell">
        <button className="back-btn" onClick={onBack}>{'\u2190'} Back</button>
        <div className="inst-empty">Person not found</div>
      </div>
    );
  }

  const province = provinceById(person.provinceId);
  const isActive = person.status === 'active';
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <div className="person-detail-shell">
      <button className="back-btn" onClick={onBack}>{'\u2190'} Back</button>

      <div className="person-detail-header">
        <h2 className="person-detail-name">{personName(person)}</h2>
        <Badge label={ROLE_LABELS[person.role] || person.role} variant="gold" />
        <Badge label={person.status} variant={isActive ? 'emerald' : 'rose'} />
      </div>

      <div className="person-detail-meta">
        <div className="person-meta-row">
          <span className="person-meta-label">Province</span>
          <span className="person-meta-value">{province.name}</span>
        </div>
        {person.party && (
          <div className="person-meta-row">
            <span className="person-meta-label">Party</span>
            <span className="person-meta-value">{person.party}</span>
          </div>
        )}
        <div className="person-meta-row">
          <span className="person-meta-label">Seated</span>
          <span className="person-meta-value">Day {person.seatedDay}</span>
        </div>
        {person.termEnd !== null && (
          <div className="person-meta-row">
            <span className="person-meta-label">Term Ends</span>
            <span className="person-meta-value">Day {person.termEnd}</span>
          </div>
        )}
        {person.seatNumber !== undefined && (
          <div className="person-meta-row">
            <span className="person-meta-label">Seat</span>
            <span className="person-meta-value">#{person.seatNumber}</span>
          </div>
        )}
      </div>

      {isActive && (
        <div className="person-actions">
          {confirming === 'kill' ? (
            <div className="disaster-confirm">
              <span className="disaster-confirm-text">Kill {personName(person)}? This is irreversible.</span>
              <button className="inst-action-btn danger small" onClick={() => { dispatch({ type: 'KILL_PERSON', personId: person.id }); setConfirming(null); }}>Confirm</button>
              <button className="inst-action-btn small secondary" onClick={() => setConfirming(null)}>Cancel</button>
            </div>
          ) : confirming === 'incapacitate' ? (
            <div className="disaster-confirm">
              <span className="disaster-confirm-text">Incapacitate {personName(person)}?</span>
              <button className="inst-action-btn danger small" onClick={() => { dispatch({ type: 'INCAPACITATE_PERSON', personId: person.id }); setConfirming(null); }}>Confirm</button>
              <button className="inst-action-btn small secondary" onClick={() => setConfirming(null)}>Cancel</button>
            </div>
          ) : confirming === 'resign' ? (
            <div className="disaster-confirm">
              <span className="disaster-confirm-text">Resign {personName(person)}?</span>
              <button className="inst-action-btn danger small" onClick={() => { dispatch({ type: 'RESIGN_PERSON', personId: person.id }); setConfirming(null); }}>Confirm</button>
              <button className="inst-action-btn small secondary" onClick={() => setConfirming(null)}>Cancel</button>
            </div>
          ) : (
            <>
              <button className="inst-action-btn danger" onClick={() => setConfirming('kill')}>Kill</button>
              <button className="inst-action-btn secondary" onClick={() => setConfirming('incapacitate')}>Incapacitate</button>
              <button className="inst-action-btn secondary" onClick={() => setConfirming('resign')}>Resign</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
