import type { GovState, GovEvent, JusticeAppointment } from '../types';
import { seededRandom } from '../engine';

/** Tick justice appointment pipelines. */
export function tickAppointments(state: GovState, day: number): { state: GovState; events: GovEvent[] } {
  const events: GovEvent[] = [];

  if (state.court.appointments.length === 0) return { state, events };

  const suspended = state.crown.suspended;
  const hasPM = state.executive.pmSeated;
  // During Crown suspension: PM nominates justices (Art. VI.5).
  // If no PM either: appointments freeze at Crown stages — nobody can nominate.
  const nominatorLabel = suspended ? (hasPM ? 'PM' : null) : 'Crown';

  const appointments = state.court.appointments.map((appt): JusticeAppointment => {
    if (appt.phase === 'Seated') return appt;
    if (appt.deadline === null || day < appt.deadline) return appt;

    switch (appt.phase) {
      case 'CrownNom1': {
        // During suspension without PM: freeze — extend deadline
        if (suspended && !hasPM) {
          if (!appt._frozen) {
            events.push({
              day,
              marker: 'court',
              description: `Justice Seat ${appt.seatNumber}: nomination frozen (Crown suspended, no PM)`,
              call: `SupremeCourt.freeze(seat: ${appt.seatNumber}) → waiting for PM`,
            });
          }
          return { ...appt, deadline: day + 14, _frozen: true };
        }
        events.push({
          day,
          marker: 'court',
          description: `Justice Seat ${appt.seatNumber}: ${nominatorLabel} nomination submitted to Senate`,
          call: `SupremeCourt.nominate(seat: ${appt.seatNumber}, by: ${nominatorLabel}) → Senate vote`,
        });
        return { ...appt, phase: 'SenateVote1', deadline: day + 14, _frozen: false };
      }

      case 'SenateVote1': {
        const approved = seededRandom(day * 301 + appt.seatNumber) > 0.4;
        if (approved) {
          events.push({
            day,
            marker: 'court',
            description: `Justice Seat ${appt.seatNumber}: Senate approved nominee`,
            call: `SupremeCourt.senateApprove(seat: ${appt.seatNumber}) → seated`,
          });
          return { ...appt, phase: 'Seated', deadline: null };
        } else {
          events.push({
            day,
            marker: 'court',
            description: `Justice Seat ${appt.seatNumber}: Senate rejected nominee; second attempt`,
            call: `SupremeCourt.senateReject(seat: ${appt.seatNumber}) → Nom2`,
          });
          return { ...appt, phase: 'CrownNom2', deadline: day + 14 };
        }
      }

      case 'CrownNom2': {
        // During suspension without PM: freeze
        if (suspended && !hasPM) {
          if (!appt._frozen) {
            events.push({
              day,
              marker: 'court',
              description: `Justice Seat ${appt.seatNumber}: second nomination frozen (Crown suspended, no PM)`,
              call: `SupremeCourt.freeze(seat: ${appt.seatNumber}) → waiting for PM`,
            });
          }
          return { ...appt, deadline: day + 14, _frozen: true };
        }
        events.push({
          day,
          marker: 'court',
          description: `Justice Seat ${appt.seatNumber}: ${nominatorLabel} second nomination submitted`,
          call: `SupremeCourt.nominate2(seat: ${appt.seatNumber}, by: ${nominatorLabel}) → Senate vote`,
        });
        return { ...appt, phase: 'SenateVote2', deadline: day + 14, _frozen: false };
      }

      case 'SenateVote2': {
        const approved = seededRandom(day * 401 + appt.seatNumber) > 0.3;
        if (approved) {
          events.push({
            day,
            marker: 'court',
            description: `Justice Seat ${appt.seatNumber}: Senate approved second nominee`,
            call: `SupremeCourt.senateApprove2(seat: ${appt.seatNumber}) → seated`,
          });
          return { ...appt, phase: 'Seated', deadline: null };
        } else {
          events.push({
            day,
            marker: 'court',
            description: `Justice Seat ${appt.seatNumber}: Senate rejected again; Senate list phase`,
            call: `SupremeCourt.senateReject2(seat: ${appt.seatNumber}) → SenateList`,
          });
          return { ...appt, phase: 'SenateList', deadline: day + 14 };
        }
      }

      case 'SenateList': {
        const pickerLabel = suspended ? (hasPM ? 'PM' : 'Senate') : 'Crown';
        events.push({
          day,
          marker: 'court',
          description: `Justice Seat ${appt.seatNumber}: Senate presented list; ${pickerLabel} picks`,
          call: `SupremeCourt.senateList(seat: ${appt.seatNumber}) → ${pickerLabel}Pick`,
        });
        return { ...appt, phase: 'CrownPick', deadline: day + 7 };
      }

      case 'CrownPick': {
        // During suspension without PM: Senate's first-ranked candidate auto-appointed
        const pickerLabel = suspended ? (hasPM ? 'PM' : 'Senate (auto)') : 'Crown';
        events.push({
          day,
          marker: 'court',
          description: `Justice Seat ${appt.seatNumber}: ${pickerLabel} picked from list; justice seated`,
          call: `SupremeCourt.pick(seat: ${appt.seatNumber}, by: ${pickerLabel}) → seated`,
        });
        return { ...appt, phase: 'Seated', deadline: null };
      }

      default:
        return appt;
    }
  });

  // Seat newly appointed justices
  let people = state.people;
  for (const appt of appointments) {
    if (appt.phase === 'Seated') {
      const existingAppt = state.court.appointments.find(
        (a) => a.seatNumber === appt.seatNumber
      );
      if (existingAppt && existingAppt.phase !== 'Seated') {
        // Reactivate the vacant justice seat
        const vacant = people.find(
          (p) => p.role === 'justice' && p.seatNumber === appt.seatNumber && p.status !== 'active'
        );
        if (vacant) {
          people = people.map((p) =>
            p.id === vacant.id ? { ...p, status: 'active' as const, seatedDay: day } : p
          );
        }
      }
    }
  }

  // Remove completed appointments
  const activeAppointments = appointments.filter((a) => a.phase !== 'Seated');

  return {
    state: {
      ...state,
      people,
      court: {
        ...state.court,
        appointments: activeAppointments,
      },
    },
    events,
  };
}
