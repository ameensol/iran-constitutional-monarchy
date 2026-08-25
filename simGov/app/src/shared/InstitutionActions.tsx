import { useState } from 'react';
import { useTourAction, findTourTarget } from '../tour/TourActionContext';

export interface ActionItem {
  label: string;
  description: string;
  onClick: () => void;
  enabled: boolean;
  disabledReason?: string;
  danger?: boolean;
  confirmText?: string;  // If set, shows confirm step before executing
  tourActionId?: string; // e.g. 'SUBMIT_BILL' — matches TourActionTarget.actionType
}

interface Props {
  title: string;
  actions: ActionItem[];
}

export default function InstitutionActions({ title, actions }: Props) {
  const [confirmingIndex, setConfirmingIndex] = useState<number | null>(null);
  const { tourMode, activeTargets } = useTourAction();

  if (actions.length === 0) return null;

  return (
    <div className="inst-section">
      <h3 className="inst-section-title">{title}</h3>
      <div className="inst-actions-list">
        {actions.map((action, i) => {
          const target = action.tourActionId
            ? findTourTarget(activeTargets, action.tourActionId)
            : undefined;
          const isTourTarget = tourMode && !!target;

          // In tour mode, override enabled: only tour targets are clickable
          const effectiveEnabled = tourMode
            ? isTourTarget
            : action.enabled;

          // In tour mode, hide non-targeted actions entirely
          if (tourMode && !isTourTarget) return null;

          const isConfirming = confirmingIndex === i;

          const handleClick = () => {
            action.onClick();
            if (target) target.onActionTaken();
          };

          if (isConfirming) {
            return (
              <div key={i} className="inst-action-row confirming">
                <span className="inst-action-confirm-text">{action.confirmText}</span>
                <div className="inst-action-confirm-btns">
                  <button
                    className={`inst-action-btn small ${action.danger ? 'danger' : ''}`}
                    onClick={() => { handleClick(); setConfirmingIndex(null); }}
                  >
                    Confirm
                  </button>
                  <button
                    className="inst-action-btn small secondary"
                    onClick={() => setConfirmingIndex(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div key={i} className={`inst-action-row ${!effectiveEnabled ? 'disabled' : ''}`}>
              <div className="inst-action-info">
                <span className="inst-action-label">{action.label}</span>
                <span className="inst-action-desc">
                  {effectiveEnabled ? action.description : action.disabledReason || action.description}
                </span>
              </div>
              <button
                className={`inst-action-btn small ${action.danger ? 'danger' : ''} ${isTourTarget ? 'tour-action-target' : ''}`}
                disabled={!effectiveEnabled}
                onClick={() => action.confirmText ? setConfirmingIndex(i) : handleClick()}
              >
                {action.label.split(' ').slice(0, 2).join(' ')}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
