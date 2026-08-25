import { TOURS, TOUR_CATEGORIES } from './tourRegistry';
import { useTourCompletion } from './useTourCompletion';
import './TourHub.css';

interface TourHubProps {
  onBack: () => void;
  onStartTour: (tourId: string) => void;
}

export default function TourHub({ onBack, onStartTour }: TourHubProps) {
  const { isCompleted } = useTourCompletion();

  return (
    <div className="tour-hub">
      <div className="tour-hub-header">
        <button className="tour-hub-back" onClick={onBack}>
          {'\u2190'} Dashboard
        </button>
        <h1 className="tour-hub-title">Walkthroughs</h1>
        <p className="tour-hub-subtitle">
          Learn how constitutional governance works, one institution at a time.
        </p>
      </div>

      {TOUR_CATEGORIES.map((cat) => {
        const tours = TOURS.filter((t) => t.category === cat.key);
        if (tours.length === 0) return null;
        return (
          <div key={cat.key} className="tour-hub-section">
            <h2 className="tour-hub-section-title">{cat.label}</h2>
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
                      <div className="tour-card-check" title="Completed">
                        {'\u2713'}
                      </div>
                    )}

                    <div className="tour-card-body">
                      <div className="tour-card-title">{tour.title}</div>
                      <div className="tour-card-desc">{tour.description}</div>
                      <div className="tour-card-meta">
                        <span>{tour.totalSteps} steps</span>
                        {tour.resetsState && (
                          <span className="tour-card-warning">Resets simulation</span>
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
