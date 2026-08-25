import { useState, useEffect } from 'react';
import type { Headline } from '../simulation/types';

interface BreakingNewsBannerProps {
  headline: Headline | null;
  autoDismissMs: number;
  onDismiss: () => void;
}

export default function BreakingNewsBanner({ headline, autoDismissMs, onDismiss }: BreakingNewsBannerProps) {
  const [dismissing, setDismissing] = useState(false);

  // Reset dismissing state when headline changes
  useEffect(() => {
    setDismissing(false);
  }, [headline]);

  // Auto-dismiss timer
  useEffect(() => {
    if (!headline || autoDismissMs <= 0) return;
    const timer = setTimeout(() => {
      setDismissing(true);
      setTimeout(onDismiss, 400); // match fade-out duration
    }, autoDismissMs);
    return () => clearTimeout(timer);
  }, [headline, autoDismissMs, onDismiss]);

  if (!headline) return null;

  const handleClick = () => {
    setDismissing(true);
    setTimeout(onDismiss, 400);
  };

  return (
    <div
      className={`breaking-banner ${dismissing ? 'dismissing' : ''}`}
      onClick={handleClick}
      role="alert"
    >
      <span className="breaking-label">BREAKING</span>
      <span className="breaking-text">{headline.text}</span>
      {headline.subtext && <span className="breaking-subtext">{headline.subtext}</span>}
    </div>
  );
}
