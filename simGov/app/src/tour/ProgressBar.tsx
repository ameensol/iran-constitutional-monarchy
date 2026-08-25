interface ProgressBarProps {
  currentStep: number;
  totalSteps?: number;
}

export default function ProgressBar({ currentStep, totalSteps = 6 }: ProgressBarProps) {
  return (
    <div className="tour-progress">
      {Array.from({ length: totalSteps }, (_, i) => {
        const step = i + 1;
        let cls = 'progress-dot';
        if (step < currentStep) cls += ' completed';
        else if (step === currentStep) cls += ' current';
        else cls += ' future';
        return <div key={step} className={cls} />;
      })}
      <span className="frame-label">{currentStep} / {totalSteps}</span>
    </div>
  );
}
