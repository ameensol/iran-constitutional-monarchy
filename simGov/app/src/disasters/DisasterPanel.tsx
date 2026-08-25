import type { GovState, GovAction, DisasterId } from '../simulation/types';
import { DISASTERS } from '../simulation/disasters';
import { useState } from 'react';
import Badge from '../shared/Badge';
import './DisasterPanel.css';

interface Props {
  state: GovState;
  dispatch: React.Dispatch<GovAction>;
  onClose: () => void;
}

export default function DisasterPanel({ dispatch, onClose }: Props) {
  const [confirming, setConfirming] = useState<DisasterId | null>(null);

  const handleExecute = (disasterId: DisasterId) => {
    dispatch({ type: 'TRIGGER_DISASTER', disasterId });
    setConfirming(null);
  };

  return (
    <div className="disaster-overlay" onClick={onClose}>
      <div className="disaster-panel" onClick={(e) => e.stopPropagation()}>
        <div className="disaster-header">
          <h2 className="disaster-title">Disaster Scenarios</h2>
          <button className="disaster-close" onClick={onClose}>{'\u2715'}</button>
        </div>

        <div className="disaster-list">
          {DISASTERS.map((d) => (
            <div key={d.id} className="disaster-card">
              <div className="disaster-card-header">
                <span className="disaster-card-name">{d.name}</span>
                <div className="disaster-card-tags">
                  {d.affectedInstitutions.map((inst) => (
                    <Badge key={inst} label={inst} variant="rose" />
                  ))}
                </div>
              </div>
              <p className="disaster-card-desc">{d.description}</p>
              {confirming === d.id ? (
                <div className="disaster-confirm">
                  <span className="disaster-confirm-text">Are you sure? This cannot be undone.</span>
                  <button
                    className="inst-action-btn danger"
                    onClick={() => handleExecute(d.id)}
                  >
                    Confirm
                  </button>
                  <button
                    className="inst-action-btn secondary"
                    onClick={() => setConfirming(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="inst-action-btn danger"
                  onClick={() => setConfirming(d.id)}
                >
                  Execute
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
