import { useState } from 'react';
import type { GovEvent, EventMarker } from '../simulation/types';
import { generateHeadline } from './headlines';

interface EventLogProps {
  events: GovEvent[];
  onClickEvent?: (event: GovEvent) => void;
}

const MARKERS: { key: EventMarker | 'all'; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'crown',    label: 'Crown' },
  { key: 'parl',     label: 'Parliament' },
  { key: 'exec',     label: 'Executive' },
  { key: 'court',    label: 'Court' },
  { key: 'election', label: 'Elections' },
  { key: 'budget',   label: 'Budget' },
];

export default function EventLog({ events, onClickEvent }: EventLogProps) {
  const [filter, setFilter] = useState<EventMarker | 'all'>('all');
  const [search, setSearch] = useState('');

  const filtered = filter === 'all'
    ? events
    : events.filter((e) => e.marker === filter);

  const searched = search
    ? filtered.filter((e) => {
        const q = search.toLowerCase();
        const headline = generateHeadline(e);
        return e.description.toLowerCase().includes(q)
          || headline.text.toLowerCase().includes(q)
          || (headline.subtext?.toLowerCase().includes(q) ?? false);
      })
    : filtered;

  const displayed = searched.slice(0, 30);

  return (
    <div className="log-card">
      <div className="log-search-bar">
        <input
          className="log-search"
          type="text"
          placeholder="Search the Royal Gazette..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search events"
        />
      </div>
      <div className="log-filter-bar">
        {MARKERS.map((m) => (
          <button
            key={m.key}
            className={`log-filter-chip ${filter === m.key ? 'active' : ''} ${m.key !== 'all' ? m.key : ''}`}
            onClick={() => setFilter(m.key)}
          >
            {m.key !== 'all' && <span className={`log-marker-dot ${m.key}`} />}
            {m.label}
          </button>
        ))}
      </div>

      {displayed.map((event, i) => {
        const headline = generateHeadline(event);
        return (
          <div
            className={`headline-card ${onClickEvent ? 'clickable' : ''}`}
            key={i}
            onClick={() => onClickEvent?.(event)}
          >
            <div className="headline-top">
              <span className={`headline-category ${headline.category}`}>
                {headline.category}
              </span>
              <span className="headline-day">Day {event.day}</span>
            </div>
            <div className="headline-text">{headline.text}</div>
            {headline.subtext && (
              <div className="headline-subtext">{headline.subtext}</div>
            )}
            <div className="headline-call">{event.call}</div>
          </div>
        );
      })}
      {displayed.length === 0 && (
        <div style={{ color: 'var(--pale-gold)', textAlign: 'center', padding: 20 }}>
          {filter === 'all' ? 'No dispatches yet' : `No ${filter} dispatches`}
        </div>
      )}
    </div>
  );
}
