import type { ReactNode } from 'react';

interface InstitutionShellProps {
  title: string;
  icon: string;
  healthy: boolean;
  onBack: () => void;
  hideBack?: boolean;
  children: ReactNode;
}

export default function InstitutionShell({ title, icon, healthy, onBack, hideBack, children }: InstitutionShellProps) {
  return (
    <div className="inst-detail">
      {!hideBack && (
        <button className="back-btn" onClick={onBack}>
          {'\u2190'} Back
        </button>
      )}
      <div className="inst-detail-header">
        <div className="inst-detail-icon">{icon}</div>
        <h2 className="inst-detail-title">{title}</h2>
        <div className={`health-dot ${healthy ? 'healthy' : 'crisis'}`} />
      </div>
      <div className="inst-detail-divider" />
      <div className="inst-detail-body">
        {children}
      </div>
    </div>
  );
}
