import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ShahCommentaryResult } from '../simulation/shah';
import { activeLocale } from '../i18n/simulatorFormat';
import { localizeShahCommentary } from '../i18n/shahCopy';

interface ShahSidebarProps {
  result: ShahCommentaryResult | null;
  onDismiss: () => void;
}

/**
 * Shah commentary sidebar. Uses the same .narrator sidebar styling
 * as the tour narrator so they share the same screen position.
 * Only one is visible at a time (tours suppress commentary).
 */
export default function ShahSidebar({ result, onDismiss }: ShahSidebarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { t, i18n } = useTranslation('shah');
  const localized = result ? localizeShahCommentary(result, activeLocale(i18n.language)) : null;

  useEffect(() => {
    if (result && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [result]);

  if (!localized) return null;

  return (
    <div className="narrator" ref={ref}>
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
        onClick={onDismiss}
        title={t('dismiss')}
        aria-label={t('dismiss')}
      >
        {'\u2715'}
      </button>

      {/* Header */}
      <div className="narrator-header">
        <div className="narrator-title">{t('title')}</div>
        <div className="commentary-trigger">{localized.trigger}</div>
      </div>

      {/* Commentary */}
      <div className="narrator-body">
        <div className="shah-dialogue">
          <div className="shah-avatar">
            <img src="/assets/king-and-noble.svg" className="persian-art" alt="" />
          </div>
          <div className="shah-text">
            &ldquo;{localized.text}&rdquo;
          </div>
        </div>
      </div>
    </div>
  );
}
