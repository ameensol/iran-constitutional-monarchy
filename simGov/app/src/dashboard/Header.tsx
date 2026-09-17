import type { PlaySpeed } from '../simulation/useSimulation';
import { useTranslation } from 'react-i18next';
import { activeLocale, formatNumber } from '../i18n/simulatorFormat';
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
  const { t, i18n } = useTranslation('simulator');
  const locale = activeLocale(i18n.language);
  return (
    <header className="header">
      <div className="logo" onClick={onLogoClick} style={onLogoClick ? { cursor: 'pointer' } : undefined}>
        <img src="/assets/lamassu.svg" className="logo-emblem persian-art" alt="" />
        {t('header.brand')}
      </div>
      <div className="date-display">
        {t('header.dayYear', { day: formatNumber(day, locale), year: formatNumber(year, locale) })}{' '}
        <span style={{ fontSize: 12, color: 'var(--pale-gold)', fontStyle: 'italic' }}>
          {t('header.calendar')}
        </span>
      </div>
      <div className="header-actions">
        {onOpenDisasters && (
          <button className="tour-btn disaster-btn" onClick={onOpenDisasters}>
            {t('header.disasters')}
          </button>
        )}
        <button className="tour-btn" onClick={onStartTour}>
          {t('header.tours')}
        </button>
        <TimeControls speed={speed} onSetSpeed={onSetSpeed} onSkip={onSkip} />
      </div>
    </header>
  );
}
