import { useState, useEffect } from 'react';
import type { Headline } from '../simulation/types';
import { useTranslation } from 'react-i18next';

interface BreakingNewsBannerProps {
  headline: Headline | null;
  autoDismissMs: number;
  onDismiss: () => void;
}

export default function BreakingNewsBanner({ headline, autoDismissMs, onDismiss }: BreakingNewsBannerProps) {
  const { t } = useTranslation('simulator');
  const [dismissingHeadline, setDismissingHeadline] = useState<Headline | null>(null);
  const dismissing = headline !== null && dismissingHeadline === headline;

  // Auto-dismiss timer
  useEffect(() => {
    if (!headline || autoDismissMs <= 0) return;
    const timer = setTimeout(() => {
      setDismissingHeadline(headline);
      setTimeout(onDismiss, 400); // match fade-out duration
    }, autoDismissMs);
    return () => clearTimeout(timer);
  }, [headline, autoDismissMs, onDismiss]);

  if (!headline) return null;

  const handleClick = () => {
    setDismissingHeadline(headline);
    setTimeout(onDismiss, 400);
  };

  return (
    <div
      className={`breaking-banner ${dismissing ? 'dismissing' : ''}`}
      onClick={handleClick}
      role="alert"
    >
      <span className="breaking-label">{t('gazette.breaking')}</span>
      <span className="breaking-text">{headline.text}</span>
      {headline.subtext && <span className="breaking-subtext">{headline.subtext}</span>}
    </div>
  );
}
