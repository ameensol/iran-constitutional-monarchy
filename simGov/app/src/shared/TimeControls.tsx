import type { PlaySpeed } from '../simulation/useSimulation';

interface TimeControlsProps {
  speed: PlaySpeed;
  onSetSpeed: (speed: PlaySpeed) => void;
  onSkip: () => void;
}

export default function TimeControls({ speed, onSetSpeed, onSkip }: TimeControlsProps) {
  return (
    <div className="time-controls">
      <button
        className={`time-btn ${speed === 'paused' ? 'active' : ''}`}
        title="Pause"
        aria-label="Pause"
        onClick={() => onSetSpeed('paused')}
      >
        {'\u23F8'}
        <span className="time-btn-label">Pause</span>
      </button>
      <button
        className="time-btn"
        title="Step (1 day)"
        aria-label="Step one day"
        onClick={() => onSetSpeed('step')}
      >
        {'\u23EF'}
        <span className="time-btn-label">Step</span>
      </button>
      <button
        className={`time-btn ${speed === '0.25x' ? 'active' : ''}`}
        title="Slow (1 day/4sec)"
        aria-label="Play at slow speed"
        onClick={() => onSetSpeed('0.25x')}
      >
        {'\u25B6'}
        <span className="time-btn-label">Slow</span>
      </button>
      <button
        className={`time-btn ${speed === '1x' ? 'active' : ''}`}
        title="1x (1 day/sec)"
        aria-label="Play at 1x speed"
        onClick={() => onSetSpeed('1x')}
      >
        {'\u25B6'}
        <span className="time-btn-label">1x</span>
      </button>
      <button
        className={`time-btn ${speed === '10x' ? 'active' : ''}`}
        title="10x"
        aria-label="Play at 10x speed"
        onClick={() => onSetSpeed('10x')}
      >
        {'\u23E9'}
        <span className="time-btn-label">10x</span>
      </button>
      <button
        className={`time-btn ${speed === '100x' ? 'active' : ''}`}
        title="100x"
        aria-label="Play at 100x speed"
        onClick={() => onSetSpeed('100x')}
      >
        {'\u23E9\u23E9'}
        <span className="time-btn-label">100x</span>
      </button>
      <button
        className="time-btn"
        title="Skip to next event"
        aria-label="Skip to next event"
        onClick={onSkip}
      >
        {'\u23ED'}
        <span className="time-btn-label">Skip</span>
      </button>
    </div>
  );
}
