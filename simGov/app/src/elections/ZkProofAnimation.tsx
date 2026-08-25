import { useState, useEffect } from 'react';

const STEPS = [
  { icon: '\uD83D\uDCF1', label: 'Scanning passport...', done: 'Citizenship confirmed', duration: 1500 },
  { icon: '\uD83D\uDD10', label: 'Generating mathematical proof...', done: 'Identity sealed', duration: 1500 },
  { icon: '\u26D3\uFE0F', label: 'Recording ballot on-chain...', done: 'Vote recorded', duration: 1500 },
];

const EXPLANATIONS = [
  'Proves you are an Iranian citizen',
  'Proves you are over 18',
  'Creates a one-time key preventing double voting',
  'Encrypts your ballot so no one sees your choice',
];

interface Props {
  onComplete: () => void;
}

export default function ZkProofAnimation({ onComplete }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [stepPhase, setStepPhase] = useState<'active' | 'done'>('active');
  const [showExplanations, setShowExplanations] = useState(false);

  useEffect(() => {
    if (currentStep >= STEPS.length) {
      // All steps complete, show explanations then signal done
      const timer = setTimeout(() => setShowExplanations(true), 200);
      const doneTimer = setTimeout(onComplete, 1800);
      return () => { clearTimeout(timer); clearTimeout(doneTimer); };
    }

    // Start as active
    setStepPhase('active');

    // After step duration, mark done
    const doneTimer = setTimeout(() => {
      setStepPhase('done');
    }, STEPS[currentStep].duration - 300);

    // Move to next step
    const nextTimer = setTimeout(() => {
      setCurrentStep((s) => s + 1);
    }, STEPS[currentStep].duration);

    return () => { clearTimeout(doneTimer); clearTimeout(nextTimer); };
  }, [currentStep, onComplete]);

  return (
    <div className="zk-proof-animation">
      {STEPS.map((step, i) => {
        const isActive = i === currentStep && stepPhase === 'active';
        const isDone = i < currentStep || (i === currentStep && stepPhase === 'done');
        const isVisible = i <= currentStep;

        const cls = [
          'zk-step',
          isVisible ? 'visible' : '',
          isActive ? 'active' : '',
          isDone ? 'done' : '',
        ].filter(Boolean).join(' ');

        return (
          <div key={i} className={cls}>
            <div className="zk-step-icon">{step.icon}</div>
            <div className="zk-step-content">
              <div className="zk-step-label">
                {isDone ? step.done : step.label}
              </div>
              <div className="zk-step-status">
                {isDone ? 'Step ' + (i + 1) + ' of 3 complete' : isActive ? 'Processing...' : ''}
              </div>
              <div className="zk-progress">
                <div
                  className="zk-progress-fill"
                  style={{ width: isDone ? '100%' : isActive ? '80%' : '0%' }}
                />
              </div>
            </div>
            <div className="zk-step-check">{isDone ? '\u2713' : ''}</div>
          </div>
        );
      })}

      {showExplanations && (
        <div className="zk-explanations">
          {EXPLANATIONS.map((text, i) => (
            <div
              key={i}
              className={`zk-explanation visible`}
              style={{ transitionDelay: `${i * 150}ms` }}
            >
              <span className="zk-explanation-bullet">{'\u25C6'}</span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
