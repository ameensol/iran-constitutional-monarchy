import { useEffect, useRef } from 'react';

interface ShahSidebarProps {
  text: string | null;
  trigger?: string | null;
  onDismiss: () => void;
}

/**
 * Shah commentary sidebar. Uses the same .narrator sidebar styling
 * as the tour narrator so they share the same screen position.
 * Only one is visible at a time (tours suppress commentary).
 */
export default function ShahSidebar({ text, trigger, onDismiss }: ShahSidebarProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (text && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [text]);

  if (!text) return null;

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
        title="Dismiss"
      >
        {'\u2715'}
      </button>

      {/* Header */}
      <div className="narrator-header">
        <div className="narrator-title">The Shah Speaks</div>
        {trigger && (
          <div className="commentary-trigger">on: {trigger}</div>
        )}
      </div>

      {/* Commentary */}
      <div className="narrator-body">
        <div className="shah-dialogue">
          <div className="shah-avatar">
            <img src="/assets/king-and-noble.svg" className="persian-art" alt="" />
          </div>
          <div className="shah-text">
            &ldquo;{text}&rdquo;
          </div>
        </div>
      </div>
    </div>
  );
}
