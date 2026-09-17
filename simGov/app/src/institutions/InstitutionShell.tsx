import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface InstitutionShellProps {
  title: string;
  icon: string;
  healthy: boolean;
  onBack: () => void;
  hideBack?: boolean;
  children: ReactNode;
}

export default function InstitutionShell({ title, icon, healthy, onBack, hideBack, children }: InstitutionShellProps) {
  const { t } = useTranslation('simulator');
  return (
    <div className="inst-detail">
      {!hideBack && (
        <button className="back-btn" onClick={onBack}>
          <span aria-hidden="true">{'\u2190'}</span> {t('actions.back')}
        </button>
      )}
      <div className="inst-detail-header">
        <div className="inst-detail-icon">{icon}</div>
        <h2 className="inst-detail-title">{title}</h2>
        <div className={`health-dot ${healthy ? 'healthy' : 'crisis'}`} aria-label={t(healthy ? 'labels.healthy' : 'labels.crisis')} />
      </div>
      <div className="inst-detail-divider" />
      <div className="inst-detail-body">
        {children}
      </div>
    </div>
  );
}
