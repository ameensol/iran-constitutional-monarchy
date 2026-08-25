import type { GovState, GovEvent, Amendment } from '../types';
import { seededRandom } from '../engine';

/** Tick amendment/referendum processes. */
export function tickAmendments(state: GovState, day: number): { amendments: Amendment[]; events: GovEvent[] } {
  const events: GovEvent[] = [];

  const amendments = state.amendments.map((amend): Amendment => {
    if (['Enacted', 'Rejected', 'Expired'].includes(amend.phase)) return amend;
    if (day < amend.deadline) {
      // Accumulate votes
      if (amend.phase === 'ParliamentVote') {
        const yesAdd = Math.floor(seededRandom(day * 550 + amend.id) * 6) + 2;
        const noAdd = Math.floor(seededRandom(day * 550 + amend.id + 25) * 3) + 1;
        return { ...amend, parlYes: amend.parlYes + yesAdd, parlNo: amend.parlNo + noAdd };
      }
      if (amend.phase === 'Referendum') {
        const yesAdd = Math.floor(seededRandom(day * 660 + amend.id) * 1000) + 500;
        const noAdd = Math.floor(seededRandom(day * 660 + amend.id + 25) * 800) + 200;
        return { ...amend, refYes: amend.refYes + yesAdd, refNo: amend.refNo + noAdd };
      }
      return amend;
    }

    switch (amend.phase) {
      case 'Proposed': {
        events.push({
          day,
          marker: 'parl',
          description: `Amendment "${amend.title}" placed before Parliament`,
          call: `Referendum.advanceToParliament(amendId: ${amend.id})`,
        });
        return { ...amend, phase: 'ParliamentVote', deadline: day + 30 };
      }

      case 'ParliamentVote': {
        const threshold = 140; // 2/3 of Majlis + Senate combined
        const passed = amend.parlYes >= threshold;
        if (passed) {
          if (amend.emergency) {
            events.push({
              day,
              marker: 'parl',
              description: `Emergency amendment "${amend.title}" enacted by Parliament`,
              call: `Referendum.emergencyEnact(amendId: ${amend.id})`,
            });
            return { ...amend, phase: 'Enacted' };
          }
          events.push({
            day,
            marker: 'parl',
            description: `Amendment "${amend.title}" approved by Parliament; referendum called`,
            call: `Referendum.callReferendum(amendId: ${amend.id})`,
          });
          return { ...amend, phase: 'Referendum', deadline: day + 60, refYes: 0, refNo: 0 };
        } else {
          events.push({
            day,
            marker: 'parl',
            description: `Amendment "${amend.title}" rejected by Parliament`,
            call: `Referendum.parliamentReject(amendId: ${amend.id})`,
          });
          return { ...amend, phase: 'Rejected' };
        }
      }

      case 'Referendum': {
        const passed = amend.refYes > amend.refNo;
        if (passed) {
          events.push({
            day,
            marker: 'election',
            description: `Referendum approved: "${amend.title}" enacted`,
            call: `Referendum.enact(amendId: ${amend.id})`,
          });
          return { ...amend, phase: 'Enacted' };
        } else {
          events.push({
            day,
            marker: 'election',
            description: `Referendum rejected: "${amend.title}"`,
            call: `Referendum.reject(amendId: ${amend.id})`,
          });
          return { ...amend, phase: 'Rejected' };
        }
      }

      default:
        return amend;
    }
  });

  return { amendments, events };
}
