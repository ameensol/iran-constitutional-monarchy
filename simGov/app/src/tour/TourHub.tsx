import { TOURS, TOUR_CATEGORIES } from './tourRegistry';
import { useTourCompletion } from './useTourCompletion';
import './TourHub.css';
import { useTranslation } from 'react-i18next';
import { activeLocale, formatNumber } from '../i18n/simulatorFormat';
import { localizeTourCategory, localizeTourDescription, localizeTourTitle } from '../i18n/tourCopy';

interface TourHubProps {
  onBack: () => void;
  onStartTour: (tourId: string) => void;
}

export default function TourHub({ onBack, onStartTour }: TourHubProps) {
  const { isCompleted } = useTourCompletion();
  const { t, i18n } = useTranslation('tours');
  const locale = activeLocale(i18n.language);

  return (
    <div className="tour-hub">
      <div className="tour-hub-header">
        <button className="tour-hub-back" onClick={onBack}>
          <span aria-hidden="true">{'\u2190'}</span> {t('hub.back')}
        </button>
        <h1 className="tour-hub-title">{t('hub.title')}</h1>
        <p className="tour-hub-subtitle">
          {t('hub.intro')}
        </p>
      </div>

      {TOUR_CATEGORIES.map((cat) => {
        const tours = TOURS.filter((t) => t.category === cat.key);
        if (tours.length === 0) return null;
        return (
          <div key={cat.key} className="tour-hub-section">
            <h2 className="tour-hub-section-title">{localizeTourCategory(cat.label, locale)}</h2>
            <div className="tour-hub-grid">
              {tours.map((tour) => {
                const completed = isCompleted(tour.id);
                return (
                  <button
                    key={tour.id}
                    className="tour-card"
                    onClick={() => onStartTour(tour.id)}
                  >
                    <div className="tour-card-art">
                      <img src={tour.artSrc} className="persian-art-dim" alt="" />
                    </div>

                    {completed && (
                      <div className="tour-card-check" title={t('hub.completed')}>
                        {'\u2713'}
                      </div>
                    )}

                    <div className="tour-card-body">
                      <div className="tour-card-title">{localizeTourTitle(tour.title, locale)}</div>
                      <div className="tour-card-desc">{localizeTourDescription(tour.description, locale)}</div>
                      <div className="tour-card-meta">
                        <span>{locale === 'fa' ? `${formatNumber(tour.totalSteps, locale)} گام` : `${tour.totalSteps} steps`}</span>
                        {tour.resetsState && (
                          <span className="tour-card-warning">{locale === 'fa' ? 'شبیه‌سازی را بازنشانی می‌کند' : 'Resets simulation'}</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
