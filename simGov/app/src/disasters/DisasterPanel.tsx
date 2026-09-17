import type { GovState, GovAction, DisasterId } from '../simulation/types';
import { DISASTERS } from '../simulation/disasters';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Badge from '../shared/Badge';
import './DisasterPanel.css';

interface Props {
  state: GovState;
  dispatch: React.Dispatch<GovAction>;
  onClose: () => void;
}

export default function DisasterPanel({ dispatch, onClose }: Props) {
  const { t } = useTranslation('simulator');
  const [confirming, setConfirming] = useState<DisasterId | null>(null);

  const handleExecute = (disasterId: DisasterId) => {
    dispatch({ type: 'TRIGGER_DISASTER', disasterId });
    setConfirming(null);
  };

  return (
    <div className="disaster-overlay" onClick={onClose}>
      <div className="disaster-panel" role="dialog" aria-modal="true" aria-labelledby="disaster-title" onClick={(e) => e.stopPropagation()}>
        <div className="disaster-header">
          <div><h2 className="disaster-title" id="disaster-title">{t('disasters.title')}</h2><p>{t('disasters.intro')}</p></div>
          <button className="disaster-close" aria-label={t('disasters.close')} onClick={onClose}>{'\u2715'}</button>
        </div>

        <div className="disaster-list">
          {DISASTERS.map((d) => (
            <div key={d.id} className="disaster-card">
              <div className="disaster-card-header">
                <span className="disaster-card-name">{t(`disasters.scenarios.${d.id}.name`)}</span>
                <div className="disaster-card-tags">
                  {d.affectedInstitutions.map((inst) => (
                    <Badge key={inst} label={t(`institutions.${inst}`)} variant="rose" />
                  ))}
                </div>
              </div>
              <p className="disaster-card-desc">{t(`disasters.scenarios.${d.id}.description`)}</p>
              {confirming === d.id ? (
                <div className="disaster-confirm">
                  <span className="disaster-confirm-text">{t('disasters.confirmation')}</span>
                  <button
                    className="inst-action-btn danger"
                    onClick={() => handleExecute(d.id)}
                  >
                    {t('disasters.confirm')}
                  </button>
                  <button
                    className="inst-action-btn secondary"
                    onClick={() => setConfirming(null)}
                  >
                    {t('disasters.cancel')}
                  </button>
                </div>
              ) : (
                <button
                  className="inst-action-btn danger"
                  onClick={() => setConfirming(d.id)}
                >
                  {t('disasters.execute')}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
