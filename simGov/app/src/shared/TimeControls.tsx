import type { PlaySpeed } from '../simulation/useSimulation';
import { useTranslation } from 'react-i18next';
import { activeLocale, formatNumber } from '../i18n/simulatorFormat';

interface TimeControlsProps {
  speed: PlaySpeed;
  onSetSpeed: (speed: PlaySpeed) => void;
  onSkip: () => void;
}

export default function TimeControls({ speed, onSetSpeed, onSkip }: TimeControlsProps) {
  const { t, i18n } = useTranslation('simulator');
  const locale = activeLocale(i18n.language);
  const speedLabel = (value: number) => `${formatNumber(value, locale)}×`;
  return (
    <div className="time-controls">
      <button
        className={`time-btn ${speed === 'paused' ? 'active' : ''}`}
        title={t('time.pause')}
        aria-label={t('time.pauseLabel')}
        onClick={() => onSetSpeed('paused')}
      >
        {'\u23F8'}
        <span className="time-btn-label">{t('time.pause')}</span>
      </button>
      <button
        className="time-btn"
        title={t('time.stepTitle')}
        aria-label={t('time.stepLabel')}
        onClick={() => onSetSpeed('step')}
      >
        {'\u23EF'}
        <span className="time-btn-label">{t('time.step')}</span>
      </button>
      <button
        className={`time-btn ${speed === '0.25x' ? 'active' : ''}`}
        title={t('time.slowTitle')}
        aria-label={t('time.slowLabel')}
        onClick={() => onSetSpeed('0.25x')}
      >
        {'\u25B6'}
        <span className="time-btn-label">{t('time.slow')}</span>
      </button>
      <button
        className={`time-btn ${speed === '1x' ? 'active' : ''}`}
        title={t('time.fastLabel', { speed: speedLabel(1) })}
        aria-label={t('time.normalLabel')}
        onClick={() => onSetSpeed('1x')}
      >
        {'\u25B6'}
        <span className="time-btn-label">{speedLabel(1)}</span>
      </button>
      <button
        className={`time-btn ${speed === '10x' ? 'active' : ''}`}
        title={t('time.fastLabel', { speed: speedLabel(10) })}
        aria-label={t('time.fastLabel', { speed: speedLabel(10) })}
        onClick={() => onSetSpeed('10x')}
      >
        {'\u23E9'}
        <span className="time-btn-label">{speedLabel(10)}</span>
      </button>
      <button
        className={`time-btn ${speed === '100x' ? 'active' : ''}`}
        title={t('time.fastLabel', { speed: speedLabel(100) })}
        aria-label={t('time.fastLabel', { speed: speedLabel(100) })}
        onClick={() => onSetSpeed('100x')}
      >
        {'\u23E9\u23E9'}
        <span className="time-btn-label">{speedLabel(100)}</span>
      </button>
      <button
        className="time-btn"
        title={t('time.skipTitle')}
        aria-label={t('time.skipTitle')}
        onClick={onSkip}
      >
        {'\u23ED'}
        <span className="time-btn-label">{t('time.skip')}</span>
      </button>
    </div>
  );
}
