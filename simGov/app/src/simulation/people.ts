import type { GovState, GovEvent, PersonId, PersonStatus } from './types';
import { personName } from './types';
import { recalculateDerived } from './selectors';

/**
 * Apply a status change to a person and trigger constitutional cascades.
 * Returns the updated state with all cascading effects applied.
 */
export function changePersonStatus(
  state: GovState,
  personId: PersonId,
  newStatus: PersonStatus,
): GovState {
  const person = state.people.find((p) => p.id === personId);
  if (!person || person.status !== 'active') return state;

  const events: GovEvent[] = [];
  const verb = newStatus === 'dead' ? 'died' : newStatus === 'incapacitated' ? 'incapacitated' : 'resigned';
  const name = personName(person);

  // Update the person's status
  let newState: GovState = {
    ...state,
    people: state.people.map((p) =>
      p.id === personId ? { ...p, status: newStatus } : p
    ),
  };

  // Role-specific cascades
  switch (person.role) {
    case 'monarch': {
      events.push({
        day: state.day,
        marker: 'crown',
        description: `Monarch ${name} has ${verb}`,
        call: `Crown.monarchVacancy(personId: ${personId}) → succession activated`,
      });

      // Try succession
      const nextHeir = newState.crown.successionList.find((id) => {
        const h = newState.people.find((p) => p.id === id);
        return h && h.status === 'active';
      });

      if (nextHeir) {
        // Coronation: heir becomes monarch
        newState = {
          ...newState,
          people: newState.people.map((p) => {
            if (p.id === nextHeir) return { ...p, role: 'monarch' as const, seatedDay: state.day };
            return p;
          }),
          crown: {
            ...newState.crown,
            successionList: newState.crown.successionList.filter((id) => id !== nextHeir),
          },
        };
        const heir = newState.people.find((p) => p.id === nextHeir)!;
        events.push({
          day: state.day,
          marker: 'crown',
          description: `${personName(heir)} crowned as new monarch`,
          call: `Crown.coronation(personId: ${nextHeir}) → new monarch seated`,
        });
      } else {
        // No heirs: Crown suspended
        newState = {
          ...newState,
          crown: { ...newState.crown, suspended: true },
        };
        events.push({
          day: state.day,
          marker: 'crown',
          description: 'No heirs available; Crown suspended',
          call: 'Crown.suspend() → Crown powers suspended',
        });
      }
      break;
    }

    case 'heir': {
      events.push({
        day: state.day,
        marker: 'crown',
        description: `Heir ${name} has ${verb}; removed from succession`,
        call: `Crown.removeHeir(personId: ${personId})`,
      });
      newState = {
        ...newState,
        crown: {
          ...newState.crown,
          successionList: newState.crown.successionList.filter((id) => id !== personId),
        },
      };
      break;
    }

    case 'majlis_member': {
      events.push({
        day: state.day,
        marker: 'parl',
        description: `Majlis member ${name} has ${verb}; seat vacated`,
        call: `Parliament.vacateMajlisSeat(personId: ${personId}) → by-election scheduled`,
      });
      // Schedule by-election (add to elections)
      const byElectionId = Math.max(0, ...newState.elections.processes.map((e) => e.id)) + 1;
      newState = {
        ...newState,
        elections: {
          ...newState.elections,
          processes: [
            ...newState.elections.processes,
            {
              id: byElectionId,
              electionType: 'majlis_byelection',
              phase: 'registration',
              provinceId: person.provinceId,
              startDay: state.day,
              phaseDeadline: state.day + 30,
              seatsContested: 1,
            },
          ],
        },
      };
      break;
    }

    case 'senator':
    case 'crown_senator': {
      events.push({
        day: state.day,
        marker: 'parl',
        description: `Senator ${name} has ${verb}; seat vacated`,
        call: `Parliament.vacateSenateSeat(personId: ${personId}) → by-election scheduled`,
      });
      if (person.role === 'senator') {
        const byElectionId = Math.max(0, ...newState.elections.processes.map((e) => e.id)) + 1;
        newState = {
          ...newState,
          elections: {
            ...newState.elections,
            processes: [
              ...newState.elections.processes,
              {
                id: byElectionId,
                electionType: 'senate_byelection',
                phase: 'registration',
                provinceId: person.provinceId,
                startDay: state.day,
                phaseDeadline: state.day + 30,
                seatsContested: 1,
              },
            ],
          },
        };
      }
      break;
    }

    case 'justice': {
      events.push({
        day: state.day,
        marker: 'court',
        description: `Justice ${name} (Seat ${person.seatNumber}) has ${verb}; appointment pipeline started`,
        call: `SupremeCourt.vacateSeat(seatNumber: ${person.seatNumber}) → appointment pipeline`,
      });
      // Start appointment pipeline
      if (person.seatNumber !== undefined) {
        newState = {
          ...newState,
          court: {
            ...newState.court,
            appointments: [
              ...newState.court.appointments,
              {
                seatNumber: person.seatNumber,
                phase: 'CrownNom1',
                nomineeId: null,
                deadline: state.day + 30,
              },
            ],
          },
        };
      }
      break;
    }

    case 'prime_minister': {
      events.push({
        day: state.day,
        marker: 'exec',
        description: `Prime Minister ${name} has ${verb}`,
        call: `Executive.pmVacancy(personId: ${personId}) → formation cycle begins`,
      });
      // Deputy takes over as caretaker
      const deputy = newState.people.find(
        (p) => p.role === 'deputy_pm' && p.status === 'active'
      );
      if (deputy) {
        events.push({
          day: state.day,
          marker: 'exec',
          description: `Deputy PM ${personName(deputy)} serving as caretaker`,
          call: `Executive.caretaker(personId: ${deputy.id})`,
        });
        newState = {
          ...newState,
          executive: {
            ...newState.executive,
            caretaker: true,
            formation: {
              stage: 'CrownNom1',
              nomineeId: null,
              deadline: state.day + 14,
              attempt: 1,
            },
          },
        };
      } else {
        // No deputy: immediate formation
        newState = {
          ...newState,
          executive: {
            ...newState.executive,
            caretaker: true,
            formation: {
              stage: 'CrownNom1',
              nomineeId: null,
              deadline: state.day + 14,
              attempt: 1,
            },
          },
        };
      }
      break;
    }

    case 'deputy_pm': {
      events.push({
        day: state.day,
        marker: 'exec',
        description: `Deputy PM ${name} has ${verb}`,
        call: `Executive.deputyVacancy(personId: ${personId})`,
      });
      break;
    }

    case 'minister': {
      events.push({
        day: state.day,
        marker: 'exec',
        description: `Minister ${name} has ${verb}`,
        call: `Executive.ministerVacancy(personId: ${personId})`,
      });
      break;
    }

    case 'provincial_council': {
      events.push({
        day: state.day,
        marker: 'election',
        description: `Provincial council member ${name} has ${verb}`,
        call: `ProvincialCouncil.vacateSeat(personId: ${personId})`,
      });
      break;
    }
  }

  // Prepend events and recalculate derived state
  newState = {
    ...newState,
    events: [...events, ...newState.events],
  };

  return recalculateDerived(newState);
}

/**
 * Apply bulk status changes (for disasters).
 * Applies each change sequentially so cascades chain correctly.
 */
export function bulkChangeStatus(
  state: GovState,
  personIds: PersonId[],
  newStatus: PersonStatus,
): GovState {
  let current = state;
  for (const id of personIds) {
    current = changePersonStatus(current, id, newStatus);
  }
  return current;
}
