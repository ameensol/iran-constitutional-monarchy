import { useState } from 'react';
import type { GovEvent, EventMarker } from '../simulation/types';
import { useTranslation } from 'react-i18next';
import { activeLocale, formatNumber, TechnicalText } from '../i18n/simulatorFormat';
import { generateLocalizedHeadline, localizedEventSearchText } from '../i18n/eventLocalization';

interface EventLogProps {
  events: GovEvent[];
  onClickEvent?: (event: GovEvent) => void;
}

const MARKERS: (EventMarker | 'all')[] = ['all', 'crown', 'parl', 'exec', 'court', 'election', 'budget'];

export default function EventLog({ events, onClickEvent }: EventLogProps) {
  const { t, i18n } = useTranslation('simulator');
  const locale = activeLocale(i18n.language);
  const [filter, setFilter] = useState<EventMarker | 'all'>('all');
  const [search, setSearch] = useState('');

  const filtered = filter === 'all'
    ? events
    : events.filter((e) => e.marker === filter);

  const searched = search
    ? filtered.filter((e) => {
        const q = search.toLowerCase();
        return localizedEventSearchText(e, locale).includes(q);
      })
    : filtered;

  const displayed = searched.slice(0, 30);

  return (
    <div className="log-card">
      <div className="log-search-bar">
        <input
          className="log-search"
          type="text"
          placeholder={t('gazette.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t('gazette.searchLabel')}
        />
      </div>
      <div className="log-filter-bar">
        {MARKERS.map((m) => (
          <button
            key={m}
            className={`log-filter-chip ${filter === m ? 'active' : ''} ${m !== 'all' ? m : ''}`}
            onClick={() => setFilter(m)}
          >
            {m !== 'all' && <span className={`log-marker-dot ${m}`} />}
            {t(`gazette.${m}`)}
          </button>
        ))}
      </div>

      {displayed.map((event, i) => {
        const headline = generateLocalizedHeadline(event, locale);
        return (
          <div
            className={`headline-card ${onClickEvent ? 'clickable' : ''}`}
            key={i}
            onClick={() => onClickEvent?.(event)}
          >
            <div className="headline-top">
              <span className={`headline-category ${headline.category}`}>
                {t(`gazette.categories.${headline.category}`)}
              </span>
              <span className="headline-day">{t('labels.day', { day: formatNumber(event.day, locale) })}</span>
            </div>
            <div className="headline-text">{headline.text}</div>
            {headline.subtext && (
              <div className="headline-subtext">{headline.subtext}</div>
            )}
            <div className="headline-call"><TechnicalText>{event.call}</TechnicalText></div>
          </div>
        );
      })}
      {displayed.length === 0 && (
        <div style={{ color: 'var(--pale-gold)', textAlign: 'center', padding: 20 }}>
          {filter === 'all' ? t('gazette.noDispatches') : t('gazette.noFiltered', { institution: t(`gazette.${filter}`) })}
        </div>
      )}
    </div>
  );
}
