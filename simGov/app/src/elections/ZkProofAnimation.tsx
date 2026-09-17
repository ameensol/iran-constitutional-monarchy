import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { activeLocale, formatNumber } from '../i18n/simulatorFormat';

const STEP_META = [
  { icon: '\uD83D\uDCF1', label: 'scanning', done: 'citizenship', duration: 1500 },
  { icon: '\uD83D\uDD10', label: 'generating', done: 'sealed', duration: 1500 },
  { icon: '\u26D3\uFE0F', label: 'recording', done: 'recorded', duration: 1500 },
] as const;

interface Props {
  onComplete: () => void;
}

export default function ZkProofAnimation({ onComplete }: Props) {
  const { t, i18n } = useTranslation('simulator');
  const locale = activeLocale(i18n.language);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedThrough, setCompletedThrough] = useState(-1);
  const [showExplanations, setShowExplanations] = useState(false);

  useEffect(() => {
    if (currentStep >= STEP_META.length) {
      // All steps complete, show explanations then signal done
      const timer = setTimeout(() => setShowExplanations(true), 200);
      const doneTimer = setTimeout(onComplete, 1800);
      return () => { clearTimeout(timer); clearTimeout(doneTimer); };
    }

    // After step duration, mark done
    const doneTimer = setTimeout(() => {
      setCompletedThrough(currentStep);
    }, STEP_META[currentStep].duration - 300);

    // Move to next step
    const nextTimer = setTimeout(() => {
      setCurrentStep((s) => s + 1);
    }, STEP_META[currentStep].duration);

    return () => { clearTimeout(doneTimer); clearTimeout(nextTimer); };
  }, [currentStep, onComplete]);

  return (
    <div className="zk-proof-animation">
      {STEP_META.map((step, i) => {
        const isActive = i === currentStep && i > completedThrough;
        const isDone = i <= completedThrough;
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
                {t(`proof.${isDone ? step.done : step.label}`)}
              </div>
              <div className="zk-step-status">
                {isDone ? t('proof.complete', { step: formatNumber(i + 1, locale), total: formatNumber(3, locale) }) : isActive ? t('proof.processing') : ''}
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
          {(['citizen', 'adult', 'single', 'private'] as const).map((key, i) => (
            <div
              key={i}
              className={`zk-explanation visible`}
              style={{ transitionDelay: `${i * 150}ms` }}
            >
              <span className="zk-explanation-bullet">{'\u25C6'}</span>
              <span>{t(`proof.explanations.${key}`)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
