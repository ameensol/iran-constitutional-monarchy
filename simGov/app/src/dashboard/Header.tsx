import type { PlaySpeed } from '../simulation/useSimulation';
import TimeControls from '../shared/TimeControls';

interface HeaderProps {
  day: number;
  year: number;
  speed: PlaySpeed;
  onSetSpeed: (speed: PlaySpeed) => void;
  onSkip: () => void;
  onStartTour: () => void;
  onOpenDisasters?: () => void;
  onLogoClick?: () => void;
}

export default function Header({ day, year, speed, onSetSpeed, onSkip, onStartTour, onOpenDisasters, onLogoClick }: HeaderProps) {
  return (
    <header className="header">
      <div className="logo" onClick={onLogoClick} style={onLogoClick ? { cursor: 'pointer' } : undefined}>
        <img src="/assets/lamassu.svg" className="logo-emblem persian-art" alt="" />
        SIM<span>GOV</span>
      </div>
      <div className="date-display">
        Day {day}, Year {year}{' '}
        <span style={{ fontSize: 12, color: 'var(--pale-gold)', fontStyle: 'italic' }}>
          Sh&#257;hansh&#257;hi
        </span>
      </div>
      <div className="header-actions">
        {onOpenDisasters && (
          <button className="tour-btn disaster-btn" onClick={onOpenDisasters}>
            Disasters
          </button>
        )}
        <button className="tour-btn" onClick={onStartTour}>
          Tours
        </button>
        <TimeControls speed={speed} onSetSpeed={onSetSpeed} onSkip={onSkip} />
      </div>
    </header>
  );
}
