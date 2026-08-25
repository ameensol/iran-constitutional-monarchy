import ProgressBar from './ProgressBar';
import './Tour.css';
import './TourNarrator.css';

interface TourNarratorProps {
  tourTitle: string;
  frameTitle: string;
  totalSteps: number;
  currentStep: number;
  onClose: () => void;
  onBack?: () => void;
  canGoBack: boolean;
  children: React.ReactNode;
}

export default function TourNarrator({
  tourTitle,
  frameTitle,
  totalSteps,
  currentStep,
  onClose,
  onBack,
  canGoBack,
  children,
}: TourNarratorProps) {
  return (
    <div className="narrator">
      {/* Corner ornaments */}
      <div className="corner-ornament corner-tl">
        <img src="/assets/palmette.svg" className="persian-art-dim" alt="" />
      </div>
      <div className="corner-ornament corner-tr">
        <img src="/assets/palmette.svg" className="persian-art-dim" alt="" />
      </div>
      <div className="corner-ornament corner-bl">
        <img src="/assets/palmette.svg" className="persian-art-dim" alt="" />
      </div>
      <div className="corner-ornament corner-br">
        <img src="/assets/palmette.svg" className="persian-art-dim" alt="" />
      </div>

      {/* Close button */}
      <button
        className="tour-close-btn"
        onClick={onClose}
        title="Close tour"
      >
        {'\u2715'}
      </button>

      {/* Header */}
      <div className="narrator-header">
        <div className="narrator-title">{tourTitle}</div>
        <div className="narrator-frame-title">{frameTitle}</div>
      </div>

      {/* Scrollable content area */}
      <div className="narrator-body">
        {children}
      </div>

      {/* Footer */}
      <div className="narrator-footer">
        <button
          className="tour-back-btn"
          onClick={onBack}
          disabled={!canGoBack}
          aria-label="Previous step"
        >
          {'\u2190'}
        </button>
        <ProgressBar currentStep={currentStep} totalSteps={totalSteps} />
      </div>
    </div>
  );
}
