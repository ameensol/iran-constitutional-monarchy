import { useEffect } from 'react';
import './TourSpotlight.css';

/**
 * Applies .tour-highlight to elements matching [data-tour-id] in highlightIds,
 * and .tour-dimmed to institution cards that don't match.
 * Clears all classes when highlightIds is empty.
 */
export function useTourSpotlight(highlightIds: string[]) {
  useEffect(() => {
    const allTourElements = document.querySelectorAll<HTMLElement>('[data-tour-id]');

    if (highlightIds.length === 0) {
      // Clear all spotlight classes
      allTourElements.forEach((el) => {
        el.classList.remove('tour-highlight', 'tour-dimmed');
      });
      return;
    }

    let firstHighlighted: HTMLElement | null = null;
    allTourElements.forEach((el) => {
      const tourId = el.getAttribute('data-tour-id');
      if (tourId && highlightIds.includes(tourId)) {
        el.classList.add('tour-highlight');
        el.classList.remove('tour-dimmed');
        if (!firstHighlighted) firstHighlighted = el;
      } else {
        el.classList.add('tour-dimmed');
        el.classList.remove('tour-highlight');
      }
    });

    // Scroll the first highlighted element into view
    if (firstHighlighted) {
      (firstHighlighted as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Cleanup on unmount or change
    return () => {
      allTourElements.forEach((el) => {
        el.classList.remove('tour-highlight', 'tour-dimmed');
      });
    };
  }, [highlightIds]);
}
