import type { ReactNode } from 'react';

export interface CardRow {
  label: string;
  value: ReactNode;
}

interface InstitutionCardProps {
  icon: string;
  title: string;
  healthy: boolean;
  rows: CardRow[];
  countdown?: string;
  motif: string;
  onClick?: () => void;
  tourId?: string;
}

export default function InstitutionCard({
  icon,
  title,
  healthy,
  rows,
  countdown,
  motif,
  onClick,
  tourId,
}: InstitutionCardProps) {
  return (
    <div
      className={`card ${onClick ? 'card-clickable' : ''}`}
      onClick={onClick}
      data-tour-id={tourId}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick(); } : undefined}
    >
      <div className="card-bg-motif">
        <img src={motif} alt="" />
      </div>
      <div className="card-header">
        <div className="card-title">
          <div className="card-icon">{icon}</div>
          {title}
        </div>
        <div className={`health-dot ${healthy ? 'healthy' : 'crisis'}`} aria-label={healthy ? 'Healthy' : 'Crisis'}>
          <span className="health-icon">{healthy ? '\u2713' : '!'}</span>
          <span className="sr-only">{healthy ? 'Healthy' : 'Crisis'}</span>
        </div>
      </div>
      <div className="card-rows">
        {rows.map((row, i) => (
          <div className="card-row" key={i}>
            <span className="card-label">{row.label}</span>
            <span className="card-value">{row.value}</span>
          </div>
        ))}
      </div>
      {countdown && (
        <div className="countdown">{'\u23F1'} {countdown}</div>
      )}
    </div>
  );
}
