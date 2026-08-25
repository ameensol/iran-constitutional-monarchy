import type { GovState, GovAction, GovEvent, AppointmentPhase } from './types';
import { recalculateDerived } from './selectors';
import { changePersonStatus, bulkChangeStatus } from './people';
import { getDisaster } from './disasters';
import { createGenesisState, applyGenesisStage } from './genesis';
import { SENATE_CROWN } from './provinces';
import { PARTY_NAMES } from './nameGen';
import { tickBills } from './tickers/bills';
import { tickElections } from './tickers/elections';
import { tickFormation } from './tickers/formation';
import { tickAppointments } from './tickers/appointments';
import { tickAmendments } from './tickers/amendments';
import { tickTerms } from './tickers/terms';
import { tickBudget } from './tickers/budget';
import { tickCourt } from './tickers/court';
import { tickAutoGenerate } from './tickers/autogen';
import { tickNoConfidence } from './tickers/noConfidence';

/**
 * Pure simulation engine. Every function returns a new state object.
 * No mutations, no side effects.
 */

/** Deterministic seeded random for reproducible simulation. */
export function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/** Generate a deterministic hex hash string from a seed. */
export function generateHexHash(seed: number, bytes: number = 32): string {
  let hex = '0x';
  for (let i = 0; i < bytes; i++) {
    const val = Math.floor(seededRandom(seed + i * 7 + 13) * 256);
    hex += val.toString(16).padStart(2, '0');
  }
  return hex;
}

function isTerminal(stage: string): boolean {
  return ['Enacted', 'Rejected', 'Vetoed'].includes(stage);
}

/** Advance state by one day using sequential tickers. */
export function advanceDay(state: GovState): GovState {
  const day = state.day + 1;
  const allEvents: GovEvent[] = [];
  let s: GovState = { ...state, day };

  // 1. Bills: deadlines and vote accumulation
  const billResult = tickBills(s, day);
  s = { ...s, bills: billResult.bills };
  if (billResult.reviewsResolved > 0) {
    s = { ...s, court: { ...s.court, activeReviews: Math.max(0, s.court.activeReviews - billResult.reviewsResolved) } };
  }
  allEvents.push(...billResult.events);

  // 2. Elections: phase advancement
  const electionResult = tickElections(s, day);
  s = electionResult.state;
  allEvents.push(...electionResult.events);

  // 3. Executive formation: deadline advancement
  const formResult = tickFormation(s, day);
  s = formResult.state;
  allEvents.push(...formResult.events);

  // 3b. No-confidence motion: vote accumulation + auto-resolution
  const ncResult = tickNoConfidence(s, day);
  s = ncResult.state;
  allEvents.push(...ncResult.events);

  // 4. Justice appointments: pipeline advancement
  const apptResult = tickAppointments(s, day);
  s = apptResult.state;
  allEvents.push(...apptResult.events);

  // 5. Amendments: parliament votes and referendums
  const amendResult = tickAmendments(s, day);
  s = { ...s, amendments: amendResult.amendments };
  allEvents.push(...amendResult.events);

  // 6. Term expirations
  const termResult = tickTerms(s, day);
  s = termResult.state;
  allEvents.push(...termResult.events);

  // 7. Budget: fiscal year rollover
  const budgetResult = tickBudget(s, day);
  s = { ...s, budget: budgetResult.budget };
  allEvents.push(...budgetResult.events);

  // 8. Court liveness
  const courtResult = tickCourt(s, day);
  allEvents.push(...courtResult.events);

  // 9. Auto-generate bills
  const autoResult = tickAutoGenerate(s, day);
  s = { ...s, bills: autoResult.bills };
  allEvents.push(...autoResult.events);

  // Update Crown pending actions count
  const pendingActions = s.bills.filter((b) => b.stage === 'Crown Action').length;
  s = {
    ...s,
    crown: { ...s.crown, pendingActions },
  };

  // Recalculate derived state from people
  s = recalculateDerived(s);

  // Prepend new events
  s = {
    ...s,
    events: [...allEvents, ...s.events],
  };

  return s;
}

/** Apply a user-triggered action. */
export function applyAction(state: GovState, action: GovAction): GovState {
  const budget = state.budget;
  switch (action.type) {
    case 'ADVANCE_DAY':
      return advanceDay(state);

    case 'SIGN_BILL': {
      const bill = state.bills.find((b) => b.id === action.billId);
      if (!bill || bill.stage !== 'Crown Action') return state;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'crown',
        description: `The Crown signed ${bill.name} into law`,
        call: `Crown.enactLaw(billId: ${bill.id}) → Parliament.markEnacted(${bill.id})`,
      };

      return {
        ...state,
        bills: state.bills.map((b) =>
          b.id === action.billId ? { ...b, stage: 'Enacted' as const } : b
        ),
        crown: { ...state.crown, pendingActions: state.crown.pendingActions - 1 },
        events: [newEvent, ...state.events],
      };
    }

    case 'RETURN_BILL': {
      const bill = state.bills.find((b) => b.id === action.billId);
      if (!bill || bill.stage !== 'Crown Action' || bill.crownReturned) return state;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'crown',
        description: `The Crown returned ${bill.name} to the Majlis with objections`,
        call: `Crown.returnBill(billId: ${bill.id}) → Parliament.markReturned(${bill.id})`,
      };

      return {
        ...state,
        bills: state.bills.map((b) =>
          b.id === action.billId
            ? { ...b, stage: 'Returned' as const, crownReturned: true, deadline: state.day + 14 }
            : b
        ),
        crown: { ...state.crown, pendingActions: state.crown.pendingActions - 1 },
        events: [newEvent, ...state.events],
      };
    }

    case 'DISSOLVE_PARLIAMENT': {
      if (state.parliament.dissolved) return state;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'parl',
        description: 'Parliament dissolved; new elections required within 60 days',
        call: `Crown.dissolveParliament() → Election.scheduleGeneral(deadline: ${state.day + 60})`,
      };

      return {
        ...state,
        parliament: { ...state.parliament, dissolved: true, quorum: false },
        elections: { ...state.elections, nextScheduled: 60 },
        events: [newEvent, ...state.events],
      };
    }

    case 'SUBMIT_BILL': {
      const newId = Math.max(0, ...state.bills.map((b) => b.id)) + 1;
      const newBill = {
        id: newId,
        name: action.name,
        sponsor: action.sponsor,
        submittedDay: state.day,
        stage: 'Majlis Voting' as const,
        majlisYes: 0,
        majlisNo: 0,
        senateYes: 0,
        senateNo: 0,
        deadline: state.day + 14,
        crownReturned: false,
      };

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'parl',
        description: `${action.name} submitted to the Majlis`,
        call: `Parliament.submitBill(billId: ${newId}, name: "${action.name}", sponsor: ${action.sponsor})`,
      };

      return {
        ...state,
        bills: [...state.bills, newBill],
        events: [newEvent, ...state.events],
      };
    }

    case 'CROWN_TIMEOUT': {
      const bill = state.bills.find((b) => b.id === action.billId);
      if (!bill || bill.stage !== 'Crown Action') return state;
      if (state.day < bill.deadline) return state;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'crown',
        description: `Anyone enforced the Crown deadline for ${bill.name}; enacted automatically`,
        call: `Crown.claimCrownTimeout(billId: ${bill.id}) → Parliament.markEnacted(${bill.id})`,
      };

      return {
        ...state,
        bills: state.bills.map((b) =>
          b.id === action.billId ? { ...b, stage: 'Enacted' as const } : b
        ),
        crown: { ...state.crown, pendingActions: state.crown.pendingActions - 1 },
        events: [newEvent, ...state.events],
      };
    }

    case 'ADVANCE_BILL_TO_STAGE': {
      const bill = state.bills.find((b) => b.id === action.billId);
      if (!bill) return state;

      const wasAtCrownAction = bill.stage === 'Crown Action';
      const goingToCrownAction = action.stage === 'Crown Action';
      const pastMajlis = !['Introduced', 'Majlis Voting'].includes(action.stage);
      const pastSenate = ['Crown Action', 'Enacted', 'Returned', 'Senate Objected', 'Majlis Override', 'Referred', 'Rejected', 'Vetoed'].includes(action.stage);

      let pendingDelta = 0;
      if (goingToCrownAction && !wasAtCrownAction) pendingDelta = 1;
      if (wasAtCrownAction && !goingToCrownAction) pendingDelta = -1;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'parl',
        description: `${bill.name} advanced to ${action.stage}`,
        call: `Tour.advanceBill(billId: ${bill.id}, stage: "${action.stage}")`,
      };

      return {
        ...state,
        bills: state.bills.map((b) =>
          b.id === action.billId
            ? {
                ...b,
                stage: action.stage,
                majlisYes: pastMajlis ? Math.max(b.majlisYes, 98) : b.majlisYes,
                majlisNo: pastMajlis ? Math.max(b.majlisNo, 64) : b.majlisNo,
                senateYes: pastSenate ? Math.max(b.senateYes, 45) : b.senateYes,
                senateNo: pastSenate ? Math.max(b.senateNo, 22) : b.senateNo,
                deadline: state.day + 14,
              }
            : b
        ),
        crown: {
          ...state.crown,
          pendingActions: state.crown.pendingActions + pendingDelta,
        },
        events: [newEvent, ...state.events],
      };
    }

    // ── People actions ──

    case 'KILL_PERSON':
      return changePersonStatus(state, action.personId, 'dead');

    case 'INCAPACITATE_PERSON':
      return changePersonStatus(state, action.personId, 'incapacitated');

    case 'RESIGN_PERSON':
      return changePersonStatus(state, action.personId, 'resigned');

    case 'KILL_BULK':
      return bulkChangeStatus(state, action.personIds, 'dead');

    // ── Executive actions ──

    case 'CROWN_NOMINATE_PM': {
      if (state.executive.formation.stage !== 'CrownNom1' && state.executive.formation.stage !== 'CrownNom2') {
        return state;
      }
      const confidenceStage = state.executive.formation.stage === 'CrownNom1' ? 'Confidence1' : 'Confidence2';
      const person = state.people.find((p) => p.id === action.personId);
      const name = person ? `${person.firstName} ${person.lastName}` : `Person ${action.personId}`;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'exec',
        description: `Crown nominated ${name} for Prime Minister`,
        call: `Executive.crownNominate(personId: ${action.personId}) → confidence vote`,
      };

      return {
        ...state,
        executive: {
          ...state.executive,
          formation: {
            ...state.executive.formation,
            stage: confidenceStage,
            nomineeId: action.personId,
            deadline: state.day + 14,
          },
        },
        events: [newEvent, ...state.events],
      };
    }

    case 'FILE_NO_CONFIDENCE': {
      if (!state.executive.pmSeated || state.executive.noConfidence) return state;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'exec',
        description: 'No-confidence motion filed against the Prime Minister',
        call: 'Executive.fileNoConfidence() → vote scheduled',
      };

      return {
        ...state,
        executive: {
          ...state.executive,
          noConfidence: {
            filedDay: state.day,
            deadline: state.day + 14,
            yesVotes: 0,
            noVotes: 0,
            resolved: false,
          },
        },
        events: [newEvent, ...state.events],
      };
    }

    case 'RESOLVE_NO_CONFIDENCE': {
      if (!state.executive.noConfidence || state.executive.noConfidence.resolved) return state;

      if (action.outcome === 'pass') {
        const pm = state.people.find((p) => p.role === 'prime_minister' && p.status === 'active');
        const pmName = pm ? `${pm.firstName} ${pm.lastName}` : 'the Prime Minister';

        const newEvent: GovEvent = {
          day: state.day,
          marker: 'exec',
          description: `No-confidence passed: ${pmName} removed from office`,
          call: 'Executive.noConfidencePassed() → PM removed, formation begins',
        };

        let newState: GovState = {
          ...state,
          executive: {
            ...state.executive,
            noConfidence: { ...state.executive.noConfidence, resolved: true, outcome: 'pass' },
          },
          events: [newEvent, ...state.events],
        };

        if (pm) {
          newState = changePersonStatus(newState, pm.id, 'removed');
        }

        return newState;
      } else {
        const newEvent: GovEvent = {
          day: state.day,
          marker: 'exec',
          description: 'No-confidence motion failed: the Prime Minister retains Parliament\'s confidence',
          call: 'Executive.noConfidenceFailed() → PM continues',
        };

        return {
          ...state,
          executive: {
            ...state.executive,
            noConfidence: { ...state.executive.noConfidence, resolved: true, outcome: 'fail' },
          },
          events: [newEvent, ...state.events],
        };
      }
    }

    case 'RESOLVE_CONFIDENCE': {
      const formation = state.executive.formation;
      if (formation.stage !== 'Confidence1' && formation.stage !== 'Confidence2') return state;

      if (action.outcome === 'pass') {
        // Seat the nominee as PM
        const nomineeId = formation.nomineeId;
        if (!nomineeId) return state;
        const nominee = state.people.find((p) => p.id === nomineeId);
        const name = nominee ? `${nominee.firstName} ${nominee.lastName}` : `Person ${nomineeId}`;

        const newEvent: GovEvent = {
          day: state.day,
          marker: 'exec',
          description: `${name} confirmed as Prime Minister by Parliament`,
          call: `Executive.confidencePassed(personId: ${nomineeId}) → PM seated`,
        };

        return recalculateDerived({
          ...state,
          people: state.people.map((p) =>
            p.id === nomineeId ? { ...p, role: 'prime_minister' as const, seatedDay: state.day } : p
          ),
          executive: {
            ...state.executive,
            pmSeated: true,
            caretaker: false,
            formation: { stage: 'Idle', nomineeId: null, deadline: null, attempt: 0 },
          },
          events: [newEvent, ...state.events],
        });
      } else {
        // Confidence failed: advance to next stage
        const nextStage = formation.stage === 'Confidence1' ? 'CrownNom2' : 'MajlisList';
        const label = formation.stage === 'Confidence1' ? 'first' : 'second';

        const newEvent: GovEvent = {
          day: state.day,
          marker: 'exec',
          description: `Parliament denied confidence (${label} attempt); ${nextStage === 'CrownNom2' ? 'Crown nominates again' : 'Majlis presents candidate list'}`,
          call: `Executive.confidenceFailed() → ${nextStage}`,
        };

        return recalculateDerived({
          ...state,
          executive: {
            ...state.executive,
            formation: {
              stage: nextStage as import('./types').FormationStage,
              nomineeId: null,
              deadline: state.day + 14,
              attempt: nextStage === 'CrownNom2' ? 2 : 2,
            },
          },
          events: [newEvent, ...state.events],
        });
      }
    }

    case 'DESIGNATE_DEPUTY_PM': {
      if (!state.executive.pmSeated) return state;
      if (state.executive.deputyPmId !== null) return state;
      const person = state.people.find((p) => p.id === action.personId && p.status === 'active');
      if (!person) return state;

      const name = `${person.firstName} ${person.lastName}`;
      const newEvent: GovEvent = {
        day: state.day,
        marker: 'exec',
        description: `PM designated ${name} as Deputy Prime Minister`,
        call: `Executive.designateDeputyPM(personId: ${action.personId})`,
      };

      return recalculateDerived({
        ...state,
        people: state.people.map((p) =>
          p.id === action.personId ? { ...p, role: 'deputy_pm' as const, seatedDay: state.day } : p
        ),
        events: [newEvent, ...state.events],
      });
    }

    case 'COURT_UPHOLD_BILL': {
      const bill = state.bills.find((b) => b.id === action.billId);
      if (!bill || bill.stage !== 'Referred') return state;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'court',
        description: `Supreme Court upheld ${bill.name}; enacted into law`,
        call: `SupremeCourt.ruling(billId: ${bill.id}) → constitutional, enacted`,
      };

      return {
        ...state,
        bills: state.bills.map((b) =>
          b.id === action.billId ? { ...b, stage: 'Enacted' as const } : b
        ),
        court: { ...state.court, activeReviews: Math.max(0, state.court.activeReviews - 1) },
        events: [newEvent, ...state.events],
      };
    }

    case 'COURT_STRIKE_BILL': {
      const bill = state.bills.find((b) => b.id === action.billId);
      if (!bill || bill.stage !== 'Referred') return state;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'court',
        description: `Supreme Court struck down ${bill.name} as unconstitutional`,
        call: `SupremeCourt.ruling(billId: ${bill.id}) → unconstitutional, vetoed`,
      };

      return {
        ...state,
        bills: state.bills.map((b) =>
          b.id === action.billId ? { ...b, stage: 'Vetoed' as const } : b
        ),
        court: { ...state.court, activeReviews: Math.max(0, state.court.activeReviews - 1) },
        events: [newEvent, ...state.events],
      };
    }

    case 'REFER_TO_COURT': {
      const bill = state.bills.find((b) => b.id === action.billId);
      if (!bill || bill.stage !== 'Crown Action' || !bill.crownReturned) return state;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'court',
        description: `Crown referred ${bill.name} to Supreme Court for constitutional review`,
        call: `Crown.referToCourt(billId: ${bill.id}) → SupremeCourt.fileReview(${bill.id})`,
      };

      return {
        ...state,
        bills: state.bills.map((b) =>
          b.id === action.billId ? { ...b, stage: 'Referred' as const, deadline: state.day + 30 } : b
        ),
        court: { ...state.court, activeReviews: state.court.activeReviews + 1 },
        crown: { ...state.crown, pendingActions: state.crown.pendingActions - 1 },
        events: [newEvent, ...state.events],
      };
    }

    // ── Constitutional Review (direct filing) ──

    case 'FILE_CONSTITUTIONAL_REVIEW': {
      const newId = Math.max(0, ...state.reviews.map((r) => r.id), 0) + 1;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'court',
        description: `${action.petitioner} filed constitutional review: "${action.lawDescription}"`,
        call: `SupremeCourt.fileConstitutionalReview(petitioner: ${action.petitioner}, id: ${newId})`,
      };

      return {
        ...state,
        reviews: [
          ...state.reviews,
          {
            id: newId,
            petitioner: action.petitioner,
            lawDescription: action.lawDescription,
            phase: 'Filed',
            filedDay: state.day,
            deadline: state.day + 30,
            yesVotes: 0,
            noVotes: 0,
          },
        ],
        events: [newEvent, ...state.events],
      };
    }

    case 'RESOLVE_REVIEW': {
      const review = state.reviews.find((r) => r.id === action.reviewId);
      if (!review || review.phase === 'Resolved') return state;

      const label = action.outcome === 'constitutional' ? 'constitutional' : 'unconstitutional';
      const newEvent: GovEvent = {
        day: state.day,
        marker: 'court',
        description: `Supreme Court ruled "${review.lawDescription}" is ${label}`,
        call: `SupremeCourt.finalizeReview(reviewId: ${action.reviewId}, outcome: ${label})`,
      };

      return {
        ...state,
        reviews: state.reviews.map((r) =>
          r.id === action.reviewId
            ? { ...r, phase: 'Resolved' as const, ruling: action.outcome, yesVotes: action.outcome === 'constitutional' ? 8 : 3, noVotes: action.outcome === 'constitutional' ? 3 : 8 }
            : r
        ),
        events: [newEvent, ...state.events],
      };
    }

    // ── Dispute Resolution ──

    case 'FILE_DISPUTE': {
      const newId = Math.max(0, ...state.disputes.map((d) => d.id), 0) + 1;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'court',
        description: `Dispute filed: ${action.petitioner} vs. ${action.respondent} — "${action.description}"`,
        call: `SupremeCourt.fileDispute(petitioner: ${action.petitioner}, respondent: ${action.respondent}, id: ${newId})`,
      };

      return {
        ...state,
        disputes: [
          ...state.disputes,
          {
            id: newId,
            petitioner: action.petitioner,
            respondent: action.respondent,
            description: action.description,
            phase: 'Filed',
            filedDay: state.day,
            deadline: state.day + 30,
            yesVotes: 0,
            noVotes: 0,
          },
        ],
        events: [newEvent, ...state.events],
      };
    }

    case 'RESOLVE_DISPUTE': {
      const dispute = state.disputes.find((d) => d.id === action.disputeId);
      if (!dispute || dispute.phase === 'Resolved') return state;

      const winner = action.outcome === 'petitioner' ? dispute.petitioner : dispute.respondent;
      const newEvent: GovEvent = {
        day: state.day,
        marker: 'court',
        description: `Supreme Court resolved dispute in favor of ${winner}`,
        call: `SupremeCourt.finalizeDispute(disputeId: ${action.disputeId}, ruling: ${action.outcome})`,
      };

      return {
        ...state,
        disputes: state.disputes.map((d) =>
          d.id === action.disputeId
            ? { ...d, phase: 'Resolved' as const, ruling: action.outcome, yesVotes: action.outcome === 'petitioner' ? 7 : 4, noVotes: action.outcome === 'petitioner' ? 4 : 7 }
            : d
        ),
        events: [newEvent, ...state.events],
      };
    }

    // ── Collective Petitions ──

    case 'CREATE_PETITION': {
      const newId = Math.max(0, ...state.petitions.map((p) => p.id), 0) + 1;
      const creator = state.people.find((p) => p.status === 'active' && (p.role === 'majlis_member' || p.role === 'senator'));
      if (!creator) return state;

      const totalMembers = state.parliament.majlisSeats + state.parliament.senateSeats;
      const requiredSigs = Math.ceil(totalMembers * 0.1); // 10% threshold

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'court',
        description: `Collective petition created: "${action.title}" (needs ${requiredSigs} signatures)`,
        call: `SupremeCourt.createCollectivePetition(id: ${newId}, title: "${action.title}")`,
      };

      return {
        ...state,
        petitions: [
          ...state.petitions,
          {
            id: newId,
            title: action.title,
            creatorId: creator.id,
            signatures: 1, // creator auto-signs
            requiredSignatures: requiredSigs,
            filedDay: state.day,
            deadline: state.day + 30,
            activated: false,
          },
        ],
        events: [newEvent, ...state.events],
      };
    }

    case 'SIGN_PETITION': {
      const petition = state.petitions.find((p) => p.id === action.petitionId);
      if (!petition || petition.activated) return state;

      const newSigs = petition.signatures + 1;
      const activated = newSigs >= petition.requiredSignatures;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'court',
        description: activated
          ? `Petition "${petition.title}" activated with ${newSigs} signatures`
          : `Petition "${petition.title}" signed (${newSigs}/${petition.requiredSignatures})`,
        call: `SupremeCourt.signPetition(petitionId: ${action.petitionId}, sigs: ${newSigs})`,
      };

      return {
        ...state,
        petitions: state.petitions.map((p) =>
          p.id === action.petitionId
            ? { ...p, signatures: newSigs, activated }
            : p
        ),
        events: [newEvent, ...state.events],
      };
    }

    // ── Emergency Amendment ──

    case 'PROPOSE_EMERGENCY_AMENDMENT': {
      return applyAction(state, { type: 'PROPOSE_AMENDMENT', title: action.title, emergency: true });
    }

    case 'START_ELECTION': {
      const newId = Math.max(0, ...state.elections.processes.map((e) => e.id), 0) + 1;
      const seats = action.electionType === 'majlis_general' ? state.parliament.majlisTotal : 1;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'election',
        description: `${action.electionType.replace('_', ' ')} election started`,
        call: `Election.start(type: ${action.electionType}, id: ${newId})`,
      };

      return {
        ...state,
        elections: {
          ...state.elections,
          processes: [
            ...state.elections.processes,
            {
              id: newId,
              electionType: action.electionType,
              phase: 'registration',
              provinceId: action.provinceId,
              startDay: state.day,
              phaseDeadline: state.day + 14,
              seatsContested: seats,
            },
          ],
        },
        events: [newEvent, ...state.events],
      };
    }

    case 'PROPOSE_AMENDMENT': {
      const newId = Math.max(0, ...state.amendments.map((a) => a.id), 0) + 1;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'parl',
        description: `Amendment proposed: "${action.title}"${action.emergency ? ' (EMERGENCY)' : ''}`,
        call: `Referendum.propose(amendId: ${newId}, title: "${action.title}")`,
      };

      return {
        ...state,
        amendments: [
          ...state.amendments,
          {
            id: newId,
            title: action.title,
            phase: 'Proposed',
            proposedDay: state.day,
            deadline: state.day + 14,
            parlYes: 0,
            parlNo: 0,
            refYes: 0,
            refNo: 0,
            emergency: action.emergency ?? false,
          },
        ],
        events: [newEvent, ...state.events],
      };
    }

    // ── Crown nominates a justice ──

    case 'CROWN_NOMINATE_JUSTICE': {
      const appt = state.court.appointments.find((a) => a.seatNumber === action.seatNumber);
      if (!appt) return state;
      if (appt.phase !== 'CrownNom1' && appt.phase !== 'CrownNom2') return state;

      const nextPhase: AppointmentPhase = appt.phase === 'CrownNom1' ? 'SenateVote1' : 'SenateVote2';
      const person = state.people.find((p) => p.id === action.personId);
      const name = person ? `${person.firstName} ${person.lastName}` : `Person ${action.personId}`;
      const nominator = state.crown.suspended ? (state.executive.pmSeated ? 'PM' : 'Senate') : 'Crown';

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'court',
        description: `${nominator} nominated ${name} for Justice Seat ${action.seatNumber}`,
        call: `SupremeCourt.nominate(seat: ${action.seatNumber}, personId: ${action.personId}) → ${nextPhase}`,
      };

      return {
        ...state,
        court: {
          ...state.court,
          appointments: state.court.appointments.map((a) =>
            a.seatNumber === action.seatNumber
              ? { ...a, phase: nextPhase, nomineeId: action.personId, deadline: state.day + 14 }
              : a
          ),
        },
        events: [newEvent, ...state.events],
      };
    }

    // ── Resolve justice Senate vote ──

    case 'RESOLVE_JUSTICE_VOTE': {
      const appt = state.court.appointments.find((a) => a.seatNumber === action.seatNumber);
      if (!appt) return state;

      if (action.outcome === 'approve') {
        if (appt.phase !== 'SenateVote1' && appt.phase !== 'SenateVote2' && appt.phase !== 'SenateList' && appt.phase !== 'CrownPick') return state;

        const newEvent: GovEvent = {
          day: state.day,
          marker: 'court',
          description: `Justice Seat ${action.seatNumber}: Senate confirmed the nominee`,
          call: `SupremeCourt.senateApprove(seat: ${action.seatNumber}) → seated`,
        };

        // Reactivate the vacant justice
        let people = state.people;
        const vacant = people.find(
          (p) => p.role === 'justice' && p.seatNumber === action.seatNumber && p.status !== 'active'
        );
        if (vacant) {
          people = people.map((p) =>
            p.id === vacant.id ? { ...p, status: 'active' as const, seatedDay: state.day } : p
          );
        }

        return recalculateDerived({
          ...state,
          people,
          court: {
            ...state.court,
            appointments: state.court.appointments.filter((a) => a.seatNumber !== action.seatNumber),
          },
          events: [newEvent, ...state.events],
        });
      } else {
        // Reject
        const wasFirst = appt.phase === 'SenateVote1' || appt.phase === 'CrownNom1';
        const nextPhase: AppointmentPhase = wasFirst ? 'CrownNom2' : 'SenateList';
        const label = wasFirst ? 'first' : 'second';

        const newEvent: GovEvent = {
          day: state.day,
          marker: 'court',
          description: `Justice Seat ${action.seatNumber}: Senate rejected ${label} nominee; ${nextPhase === 'CrownNom2' ? 'Crown nominates again' : 'Senate presents list'}`,
          call: `SupremeCourt.senateReject(seat: ${action.seatNumber}) → ${nextPhase}`,
        };

        return {
          ...state,
          court: {
            ...state.court,
            appointments: state.court.appointments.map((a) =>
              a.seatNumber === action.seatNumber
                ? { ...a, phase: nextPhase, nomineeId: null, deadline: state.day + 14 }
                : a
            ),
          },
          events: [newEvent, ...state.events],
        };
      }
    }

    // ── Senate approves a bill ──

    case 'SENATE_APPROVE_BILL': {
      const bill = state.bills.find((b) => b.id === action.billId);
      if (!bill || bill.stage !== 'Senate Review') return state;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'parl',
        description: `Senate approved ${bill.name}; sent to the Crown`,
        call: `Parliament.senateApprove(billId: ${bill.id}) → Crown Action`,
      };

      return {
        ...state,
        bills: state.bills.map((b) =>
          b.id === action.billId
            ? { ...b, stage: 'Crown Action' as const, deadline: state.day + 14, senateYes: Math.max(b.senateYes, 40) }
            : b
        ),
        crown: { ...state.crown, pendingActions: state.crown.pendingActions + 1 },
        events: [newEvent, ...state.events],
      };
    }

    // ── Senate objects to a bill ──

    case 'SENATE_OBJECT_BILL': {
      const bill = state.bills.find((b) => b.id === action.billId);
      if (!bill || bill.stage !== 'Senate Review') return state;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'parl',
        description: `Senate objected to ${bill.name}; returned to Majlis`,
        call: `Parliament.senateObject(billId: ${bill.id}) → Senate Objected`,
      };

      return {
        ...state,
        bills: state.bills.map((b) =>
          b.id === action.billId
            ? { ...b, stage: 'Senate Objected' as const, deadline: state.day + 14, senateNo: Math.max(b.senateNo, 35) }
            : b
        ),
        events: [newEvent, ...state.events],
      };
    }

    // ── Majlis overrides Senate objection ──

    case 'MAJLIS_OVERRIDE_SENATE': {
      const bill = state.bills.find((b) => b.id === action.billId);
      if (!bill || bill.stage !== 'Senate Objected') return state;

      // Need absolute majority of Majlis (>50% of total seats)
      const absoluteMajority = Math.ceil(state.parliament.majlisTotal / 2) + 1;
      const hasOverride = bill.majlisYes >= absoluteMajority;

      if (hasOverride) {
        const newEvent: GovEvent = {
          day: state.day,
          marker: 'parl',
          description: `Majlis overrode Senate objection on ${bill.name} (${bill.majlisYes}/${absoluteMajority} needed)`,
          call: `Parliament.majlisOverride(billId: ${bill.id}) → Crown Action`,
        };

        return {
          ...state,
          bills: state.bills.map((b) =>
            b.id === action.billId
              ? { ...b, stage: 'Crown Action' as const, deadline: state.day + 14 }
              : b
          ),
          crown: { ...state.crown, pendingActions: state.crown.pendingActions + 1 },
          events: [newEvent, ...state.events],
        };
      } else {
        const newEvent: GovEvent = {
          day: state.day,
          marker: 'parl',
          description: `Majlis override failed on ${bill.name} (${bill.majlisYes}/${absoluteMajority} needed); bill rejected`,
          call: `Parliament.majlisOverrideFailed(billId: ${bill.id}) → Rejected`,
        };

        return {
          ...state,
          bills: state.bills.map((b) =>
            b.id === action.billId ? { ...b, stage: 'Rejected' as const } : b
          ),
          events: [newEvent, ...state.events],
        };
      }
    }

    // ── Senate starts PM formation during Crown suspension ──

    case 'SENATE_START_FORMATION': {
      if (!state.crown.suspended) return state;
      if (state.executive.pmSeated) return state;
      if (state.executive.formation.stage !== 'Idle') return state;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'exec',
        description: 'Senate initiated PM formation (Crown suspended, Art. VI.5)',
        call: 'Executive.senateInitiateFormation() → CrownNom1 (Senate acts)',
      };

      return {
        ...state,
        executive: {
          ...state.executive,
          formation: {
            stage: 'CrownNom1',
            nomineeId: null,
            deadline: state.day + 14,
            attempt: 1,
          },
        },
        events: [newEvent, ...state.events],
      };
    }

    // ── Appoint a Crown senator ──

    case 'APPOINT_CROWN_SENATOR': {
      const crownSenators = state.people.filter((p) => p.role === 'crown_senator' && p.status === 'active');
      if (crownSenators.length >= SENATE_CROWN) return state;
      if (state.crown.suspended) return state;

      const nextId = Math.max(...state.people.map((p) => p.id)) + 1;
      const seed = state.day * 7919 + nextId * 31;
      const x = Math.sin(seed * 9301 + 49297) * 233280;
      const rng = x - Math.floor(x);

      const firstNames = ['Dariush', 'Cyrus', 'Reza', 'Ali', 'Hassan', 'Kaveh', 'Nader', 'Omid', 'Shirin', 'Maryam', 'Nasrin', 'Parvin'];
      const lastNames = ['Ahmadi', 'Bakhtiari', 'Dabiri', 'Esfahani', 'Golestan', 'Hashemi', 'Karimi', 'Larijani', 'Tehrani', 'Vaezi'];
      const firstName = firstNames[Math.floor(rng * firstNames.length)];
      const lastName = lastNames[Math.floor(seededRandom(seed + 3) * lastNames.length)];

      const newPerson = {
        id: nextId,
        firstName,
        lastName,
        role: 'crown_senator' as const,
        status: 'active' as const,
        provinceId: 1,
        party: '',
        seatedDay: state.day,
        termEnd: null,
      };

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'crown',
        description: `Crown appointed ${firstName} ${lastName} as Senator (${crownSenators.length + 1}/${SENATE_CROWN})`,
        call: `Crown.appointSenator(personId: ${nextId}) → Senate`,
      };

      return recalculateDerived({
        ...state,
        people: [...state.people, newPerson],
        events: [newEvent, ...state.events],
      });
    }

    // ── Resolve an amendment (parliament vote or referendum) ──

    case 'RESOLVE_AMENDMENT': {
      const amend = state.amendments.find((a) => a.id === action.amendmentId);
      if (!amend) return state;

      if (amend.phase === 'Proposed' || amend.phase === 'ParliamentVote') {
        // Parliament vote phase
        if (action.outcome === 'pass') {
          const nextPhase = amend.emergency ? 'Enacted' : 'Referendum';
          const description = amend.emergency
            ? `Emergency amendment "${amend.title}" enacted by Parliament (no referendum required)`
            : `Amendment "${amend.title}" approved by Parliament; referendum called`;

          const newEvent: GovEvent = {
            day: state.day,
            marker: amend.emergency ? 'parl' : 'election',
            description,
            call: `Referendum.parliamentApprove(amendId: ${amend.id}) → ${nextPhase}`,
          };

          return {
            ...state,
            amendments: state.amendments.map((a) =>
              a.id === action.amendmentId
                ? { ...a, phase: nextPhase as typeof a.phase, parlYes: 120, parlNo: 40, deadline: state.day + (nextPhase === 'Referendum' ? 60 : 0) }
                : a
            ),
            events: [newEvent, ...state.events],
          };
        } else {
          const newEvent: GovEvent = {
            day: state.day,
            marker: 'parl',
            description: `Amendment "${amend.title}" rejected by Parliament`,
            call: `Referendum.parliamentReject(amendId: ${amend.id}) → Rejected`,
          };

          return {
            ...state,
            amendments: state.amendments.map((a) =>
              a.id === action.amendmentId ? { ...a, phase: 'Rejected' as const, parlNo: 90 } : a
            ),
            events: [newEvent, ...state.events],
          };
        }
      } else if (amend.phase === 'Referendum') {
        if (action.outcome === 'pass') {
          const newEvent: GovEvent = {
            day: state.day,
            marker: 'election',
            description: `Referendum passed: amendment "${amend.title}" enacted into constitutional law`,
            call: `Referendum.referendumPassed(amendId: ${amend.id}) → Enacted`,
          };

          return {
            ...state,
            amendments: state.amendments.map((a) =>
              a.id === action.amendmentId ? { ...a, phase: 'Enacted' as const, refYes: 6500000, refNo: 3200000 } : a
            ),
            events: [newEvent, ...state.events],
          };
        } else {
          const newEvent: GovEvent = {
            day: state.day,
            marker: 'election',
            description: `Referendum failed: amendment "${amend.title}" rejected by the people`,
            call: `Referendum.referendumFailed(amendId: ${amend.id}) → Rejected`,
          };

          return {
            ...state,
            amendments: state.amendments.map((a) =>
              a.id === action.amendmentId ? { ...a, phase: 'Rejected' as const, refNo: 6500000, refYes: 3200000 } : a
            ),
            events: [newEvent, ...state.events],
          };
        }
      }

      return state;
    }

    // ── God Mode v2: manual resolve for every non-terminal stage ──

    case 'RESOLVE_MAJLIS_VOTE': {
      const bill = state.bills.find((b) => b.id === action.billId);
      if (!bill || (bill.stage !== 'Majlis Voting' && bill.stage !== 'Majlis Revote')) return state;

      const isRevote = bill.stage === 'Majlis Revote';

      if (action.outcome === 'pass') {
        const nextStage = isRevote ? 'Crown Action' as const : 'Senate Review' as const;
        const desc = isRevote
          ? `Majlis re-adopted ${bill.name}; sent back to the Crown`
          : `Majlis passed ${bill.name}; sent to Senate for review`;
        const callStr = isRevote
          ? `Parliament.majlisRevote(billId: ${bill.id}) → Crown Action`
          : `Parliament.majlisPass(billId: ${bill.id}) → Senate Review`;
        const newEvent: GovEvent = {
          day: state.day,
          marker: 'parl',
          description: desc,
          call: callStr,
        };
        return {
          ...state,
          bills: state.bills.map((b) =>
            b.id === action.billId
              ? { ...b, stage: nextStage, deadline: state.day + 14, majlisYes: Math.max(b.majlisYes, 98), majlisNo: Math.max(b.majlisNo, 64) }
              : b
          ),
          crown: isRevote ? { ...state.crown, pendingActions: state.crown.pendingActions + 1 } : state.crown,
          events: [newEvent, ...state.events],
        };
      } else {
        const desc = isRevote
          ? `Majlis dropped ${bill.name} after Crown return`
          : `Majlis rejected ${bill.name}`;
        const callStr = isRevote
          ? `Parliament.majlisRevoteFail(billId: ${bill.id}) → Rejected`
          : `Parliament.majlisReject(billId: ${bill.id}) → Rejected`;
        const newEvent: GovEvent = {
          day: state.day,
          marker: 'parl',
          description: desc,
          call: callStr,
        };
        return {
          ...state,
          bills: state.bills.map((b) =>
            b.id === action.billId
              ? { ...b, stage: 'Rejected' as const, majlisNo: Math.max(b.majlisNo, 98) }
              : b
          ),
          events: [newEvent, ...state.events],
        };
      }
    }

    case 'RESOLVE_RETURNED_BILL': {
      const bill = state.bills.find((b) => b.id === action.billId);
      if (!bill || bill.stage !== 'Returned') return state;

      if (action.outcome === 'readopt') {
        const newEvent: GovEvent = {
          day: state.day,
          marker: 'parl',
          description: `Majlis begins revote on ${bill.name}`,
          call: `Parliament.beginRevote(billId: ${bill.id}) → Majlis Revote`,
        };
        return {
          ...state,
          bills: state.bills.map((b) =>
            b.id === action.billId
              ? { ...b, stage: 'Majlis Revote' as const, deadline: state.day + 14, majlisYes: 0, majlisNo: 0 }
              : b
          ),
          events: [newEvent, ...state.events],
        };
      } else {
        const newEvent: GovEvent = {
          day: state.day,
          marker: 'parl',
          description: `Majlis dropped ${bill.name} after Crown return`,
          call: `Parliament.majlisDrop(billId: ${bill.id}) → Rejected`,
        };
        return {
          ...state,
          bills: state.bills.map((b) =>
            b.id === action.billId ? { ...b, stage: 'Rejected' as const } : b
          ),
          events: [newEvent, ...state.events],
        };
      }
    }

    case 'ADVANCE_ELECTION': {
      const proc = state.elections.processes.find((e) => e.id === action.electionId);
      if (!proc || proc.phase === 'seated') return state;

      const day = state.day;

      if (proc.phase === 'registration') {
        const newEvent: GovEvent = {
          day,
          marker: 'election',
          description: `${formatElectionType(proc.electionType)} voting has begun`,
          call: `Election.startVoting(electionId: ${proc.id})`,
        };
        return {
          ...state,
          elections: {
            ...state.elections,
            processes: state.elections.processes.map((e) =>
              e.id === action.electionId ? { ...e, phase: 'voting' as const, phaseDeadline: day + 7 } : e
            ),
          },
          events: [newEvent, ...state.events],
        };
      }

      if (proc.phase === 'voting') {
        const newEvent: GovEvent = {
          day,
          marker: 'election',
          description: `${formatElectionType(proc.electionType)} votes tallied`,
          call: `Election.tally(electionId: ${proc.id}) → ${proc.seatsContested} seats contested`,
        };
        return {
          ...state,
          elections: {
            ...state.elections,
            processes: state.elections.processes.map((e) =>
              e.id === action.electionId ? { ...e, phase: 'tallied' as const, phaseDeadline: day + 3 } : e
            ),
          },
          events: [newEvent, ...state.events],
        };
      }

      if (proc.phase === 'tallied') {
        // Replicate full seating logic from ticker
        let people = state.people;
        let parliament = state.parliament;

        const playerVote = state.playerVotes.find((v) => v.electionId === proc.id);
        const playerProvince = state.player?.provinceId;
        const coversPlayerProvince = proc.electionType === 'majlis_general'
          || (proc.electionType === 'provincial' && proc.provinceId === playerProvince);

        if (proc.electionType === 'majlis_byelection' || proc.electionType === 'senate_byelection') {
          const role = proc.electionType === 'majlis_byelection' ? 'majlis_member' : 'senator';
          const vacant = people.find(
            (p) => p.role === role && p.status !== 'active' && p.provinceId === proc.provinceId
          );
          if (vacant) {
            const party = PARTY_NAMES[Math.floor(seededRandom(day * 500 + proc.id) * PARTY_NAMES.length)];
            people = people.map((p) =>
              p.id === vacant.id
                ? { ...p, status: 'active' as const, party, seatedDay: day, termEnd: day + (role === 'majlis_member' ? 1460 : 2190) }
                : p
            );
          }
        } else if (proc.electionType === 'majlis_general') {
          people = people.map((p) => {
            if (p.role === 'majlis_member' && p.status === 'removed') {
              let party: string;
              if (playerVote && coversPlayerProvince && p.provinceId === playerProvince) {
                party = playerVote.party;
              } else {
                party = PARTY_NAMES[Math.floor(seededRandom(day * 600 + p.id) * PARTY_NAMES.length)];
              }
              return { ...p, status: 'active' as const, party, seatedDay: day, termEnd: day + 1460 };
            }
            return p;
          });
          parliament = { ...parliament, dissolved: false, quorum: true };
        }

        let winningParty: string;
        if (playerVote && coversPlayerProvince) {
          winningParty = playerVote.party;
        } else {
          winningParty = PARTY_NAMES[Math.floor(seededRandom(day * 700 + proc.id) * PARTY_NAMES.length)];
        }
        const turnout = 0.55 + seededRandom(proc.id * 7) * 0.25;

        const newEvent: GovEvent = {
          day,
          marker: 'election',
          description: `${formatElectionType(proc.electionType)} winners seated`,
          call: `Election.seat(electionId: ${proc.id}) → ${proc.seatsContested} seats filled`,
        };

        return recalculateDerived({
          ...state,
          people,
          parliament,
          elections: {
            ...state.elections,
            processes: state.elections.processes.map((e) =>
              e.id === action.electionId
                ? { ...e, phase: 'seated' as const, phaseDeadline: day, results: { turnout, winningParty } }
                : e
            ),
          },
          events: [newEvent, ...state.events],
        });
      }

      return state;
    }

    case 'FORMATION_PRESENT_LIST': {
      if (state.executive.formation.stage !== 'MajlisList') return state;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'exec',
        description: 'Majlis presented candidate list to the Crown',
        call: 'Executive.majlisPresentList() → CrownPick',
      };

      return {
        ...state,
        executive: {
          ...state.executive,
          formation: {
            ...state.executive.formation,
            stage: 'CrownPick',
            deadline: state.day + 7,
          },
        },
        events: [newEvent, ...state.events],
      };
    }

    case 'FORMATION_PICK_FROM_LIST': {
      if (state.executive.formation.stage !== 'CrownPick') return state;

      // Pick a random majlis member as PM (same as RESOLVE_CONFIDENCE pass)
      const members = state.people.filter((p) => p.role === 'majlis_member' && p.status === 'active');
      const seed = state.day * 7919 + 31;
      const nominee = members[Math.floor(seededRandom(seed) * members.length)];
      if (!nominee) return state;

      const name = `${nominee.firstName} ${nominee.lastName}`;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'exec',
        description: `${state.crown.suspended ? 'Senate' : 'Crown'} picked ${name} from the Majlis list as Prime Minister`,
        call: `Executive.crownPickFromList(personId: ${nominee.id}) → PM seated`,
      };

      return recalculateDerived({
        ...state,
        people: state.people.map((p) =>
          p.id === nominee.id ? { ...p, role: 'prime_minister' as const, seatedDay: state.day } : p
        ),
        executive: {
          ...state.executive,
          pmSeated: true,
          caretaker: false,
          formation: { stage: 'Idle', nomineeId: null, deadline: null, attempt: 0 },
        },
        events: [newEvent, ...state.events],
      });
    }

    case 'ADVANCE_AMENDMENT_TO_VOTE': {
      const amend = state.amendments.find((a) => a.id === action.amendmentId);
      if (!amend || amend.phase !== 'Proposed') return state;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'parl',
        description: `Amendment "${amend.title}" placed before Parliament for vote`,
        call: `Referendum.beginParliamentVote(amendId: ${amend.id}) → ParliamentVote`,
      };

      return {
        ...state,
        amendments: state.amendments.map((a) =>
          a.id === action.amendmentId
            ? { ...a, phase: 'ParliamentVote' as const, deadline: state.day + 30 }
            : a
        ),
        events: [newEvent, ...state.events],
      };
    }

    // ── Budget actions ──

    case 'PROPOSE_BUDGET': {
      if (budget.status !== 'None' && budget.status !== 'Rejected') return state;
      if (!state.executive.pmSeated) return state;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'budget',
        description: `PM proposed FY ${budget.fiscalYear} budget (${action.totalAmount} units)`,
        call: `Budget.proposeBudget(fy: ${budget.fiscalYear}, amount: ${action.totalAmount})`,
      };

      return {
        ...state,
        budget: {
          ...budget,
          status: 'Proposed',
          totalAmount: action.totalAmount,
          proposedDay: state.day,
          deadline: state.day + 45,
        },
        events: [newEvent, ...state.events],
      };
    }

    case 'APPROVE_BUDGET': {
      if (budget.status !== 'Proposed') return state;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'budget',
        description: `Parliament approved FY ${budget.fiscalYear} budget`,
        call: `Budget.approveBudget(fy: ${budget.fiscalYear})`,
      };

      return {
        ...state,
        budget: {
          ...budget,
          status: 'Approved',
          deadline: state.day + 14,
        },
        events: [newEvent, ...state.events],
      };
    }

    case 'REJECT_BUDGET': {
      if (budget.status !== 'Proposed') return state;

      const newRejectCount = budget.rejectCount + 1;
      const newEvent: GovEvent = {
        day: state.day,
        marker: 'budget',
        description: `Parliament rejected FY ${budget.fiscalYear} budget (rejection #${newRejectCount})`,
        call: `Budget.rejectBudget(fy: ${budget.fiscalYear}, count: ${newRejectCount})`,
      };

      return {
        ...state,
        budget: {
          ...budget,
          status: 'Rejected',
          rejectCount: newRejectCount,
          deadline: state.day + 30,
        },
        events: [newEvent, ...state.events],
      };
    }

    case 'ACTIVATE_BUDGET': {
      if (budget.status !== 'Approved') return state;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'budget',
        description: `FY ${budget.fiscalYear} budget activated`,
        call: `Budget.activateBudget(fy: ${budget.fiscalYear})`,
      };

      return {
        ...state,
        budget: {
          ...budget,
          status: 'Active',
          deadline: null,
        },
        events: [newEvent, ...state.events],
      };
    }

    case 'ALLOCATE_FUNDS': {
      if (budget.status !== 'Active' && budget.status !== 'Continuation') return state;
      const newAllocated = Math.min(100, budget.allocated + action.amount);

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'budget',
        description: `Executive allocated ${action.amount}% of budget (total: ${newAllocated}%)`,
        call: `Budget.allocateFunds(amount: ${action.amount}%)`,
      };

      return {
        ...state,
        budget: {
          ...budget,
          allocated: newAllocated,
        },
        events: [newEvent, ...state.events],
      };
    }

    case 'CONTINUE_PRIOR_BUDGET': {
      if (budget.status !== 'None' && budget.status !== 'Rejected') return state;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'budget',
        description: `Parliament continued prior year budget for FY ${budget.fiscalYear} (Art. IX.3)`,
        call: `Budget.continuePriorBudget(fy: ${budget.fiscalYear})`,
      };

      return {
        ...state,
        budget: {
          ...budget,
          status: 'Continuation',
          allocated: 60,
          totalAmount: budget.totalAmount || 700,
          deadline: null,
        },
        events: [newEvent, ...state.events],
      };
    }

    case 'APPROVE_SUPPLEMENTARY': {
      if (budget.status !== 'Active' && budget.status !== 'Continuation') return state;

      const newTotal = budget.totalAmount + action.amount;
      const newCount = budget.supplementaryCount + 1;
      const newEvent: GovEvent = {
        day: state.day,
        marker: 'budget',
        description: `Parliament approved supplementary budget #${newCount} (+${action.amount} units, total: ${newTotal})`,
        call: `Budget.approveSupplementary(amount: ${action.amount}, newTotal: ${newTotal})`,
      };

      return {
        ...state,
        budget: {
          ...budget,
          totalAmount: newTotal,
          supplementaryCount: newCount,
        },
        events: [newEvent, ...state.events],
      };
    }

    case 'SUBMIT_AUDIT_REPORT': {
      if (budget.auditHeadId === null) return state;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'budget',
        description: `Audit Head submitted FY ${budget.fiscalYear} report: ${action.clean ? 'clean' : 'issues found'}`,
        call: `Budget.submitAuditReport(fy: ${budget.fiscalYear}, clean: ${action.clean})`,
      };

      return {
        ...state,
        budget: {
          ...budget,
          auditClean: action.clean,
        },
        events: [newEvent, ...state.events],
      };
    }

    case 'APPOINT_AUDIT_HEAD': {
      if (budget.auditHeadId !== null) return state;

      const nextId = Math.max(...state.people.map((p) => p.id)) + 1;
      const seed = state.day * 7919 + nextId * 31;
      const x = Math.sin(seed * 9301 + 49297) * 233280;
      const rng = x - Math.floor(x);
      const firstNames = ['Dariush', 'Cyrus', 'Reza', 'Ali', 'Hassan', 'Kaveh', 'Nader', 'Omid', 'Shirin', 'Maryam'];
      const lastNames = ['Ahmadi', 'Bakhtiari', 'Dabiri', 'Esfahani', 'Golestan', 'Hashemi', 'Karimi', 'Tehrani'];
      const firstName = firstNames[Math.floor(rng * firstNames.length)];
      const lastName = lastNames[Math.floor(seededRandom(seed + 3) * lastNames.length)];

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'budget',
        description: `Parliament appointed ${firstName} ${lastName} as Audit Head (9-year term)`,
        call: `Budget.appointAuditHead(personId: ${nextId})`,
      };

      return {
        ...state,
        budget: {
          ...budget,
          auditHeadId: nextId,
          auditHeadTermEnd: state.day + 3285, // ~9 years
        },
        events: [newEvent, ...state.events],
      };
    }

    case 'TRIGGER_DISASTER': {
      const disaster = getDisaster(action.disasterId);
      const actions = disaster.generateActions(state, action.provinceId);

      const disasterEvent: GovEvent = {
        day: state.day,
        marker: 'crown',
        description: `DISASTER: ${disaster.name}`,
        call: `Simulation.triggerDisaster(id: "${action.disasterId}")`,
      };

      let s = { ...state, events: [disasterEvent, ...state.events] };
      for (const subAction of actions) {
        s = applyAction(s, subAction);
      }
      return s;
    }

    case 'SUSPEND_CROWN': {
      if (state.crown.suspended) return state;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'crown',
        description: 'Crown powers suspended',
        call: 'Crown.suspend() → all Crown functions disabled',
      };

      return {
        ...state,
        crown: { ...state.crown, suspended: true },
        events: [newEvent, ...state.events],
      };
    }

    case 'ABDICATE': {
      const monarch = state.people.find((p) => p.role === 'monarch' && p.status === 'active');
      if (!monarch) return state;
      if (state.crown.suspended) return state;

      // Find the first heir in the succession list
      const heirId = state.crown.successionList[0];
      const heir = heirId ? state.people.find((p) => p.id === heirId && p.status === 'active') : undefined;

      const monarchName = `${monarch.firstName} ${monarch.lastName}`;

      if (heir) {
        const heirName = `${heir.firstName} ${heir.lastName}`;
        const newEvent: GovEvent = {
          day: state.day,
          marker: 'crown',
          description: `${monarchName} abdicated; ${heirName} crowned as successor`,
          call: `Crown.abdicate(monarchId: ${monarch.id}) → Crown.coronation(heirId: ${heir.id})`,
        };

        return recalculateDerived({
          ...state,
          people: state.people.map((p) => {
            if (p.id === monarch.id) return { ...p, role: 'heir' as const, status: 'resigned' as const };
            if (p.id === heir.id) return { ...p, role: 'monarch' as const, seatedDay: state.day };
            return p;
          }),
          crown: {
            ...state.crown,
            successionList: state.crown.successionList.filter((id) => id !== heir.id),
          },
          events: [newEvent, ...state.events],
        });
      } else {
        // No heir — Crown suspended
        const newEvent: GovEvent = {
          day: state.day,
          marker: 'crown',
          description: `${monarchName} abdicated; no heir available — Crown suspended`,
          call: `Crown.abdicate(monarchId: ${monarch.id}) → Crown.suspend()`,
        };

        return recalculateDerived({
          ...state,
          people: state.people.map((p) =>
            p.id === monarch.id ? { ...p, role: 'heir' as const, status: 'resigned' as const } : p
          ),
          crown: { ...state.crown, suspended: true },
          events: [newEvent, ...state.events],
        });
      }
    }

    case 'RESUME_CROWN': {
      if (!state.crown.suspended) return state;

      // Need a monarch to resume
      const monarch = state.people.find((p) => p.role === 'monarch' && p.status === 'active');
      if (!monarch) {
        // Try to crown the first heir
        const heirId = state.crown.successionList[0];
        const heir = heirId ? state.people.find((p) => p.id === heirId && p.status === 'active') : undefined;
        if (!heir) return state; // can't resume without anyone to be monarch

        const heirName = `${heir.firstName} ${heir.lastName}`;
        const newEvent: GovEvent = {
          day: state.day,
          marker: 'crown',
          description: `Crown resumed: ${heirName} crowned as new monarch`,
          call: `Crown.claimSuccession(heirId: ${heir.id}) → Crown.resume()`,
        };

        return recalculateDerived({
          ...state,
          people: state.people.map((p) =>
            p.id === heir.id ? { ...p, role: 'monarch' as const, seatedDay: state.day } : p
          ),
          crown: {
            ...state.crown,
            suspended: false,
            successionList: state.crown.successionList.filter((id) => id !== heir.id),
          },
          events: [newEvent, ...state.events],
        });
      }

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'crown',
        description: 'Crown powers resumed',
        call: 'Crown.claimCrownResumption() → Crown active',
      };

      return {
        ...state,
        crown: { ...state.crown, suspended: false },
        events: [newEvent, ...state.events],
      };
    }

    case 'UPDATE_SUCCESSION': {
      if (state.crown.suspended) return state;
      const monarch = state.people.find((p) => p.role === 'monarch' && p.status === 'active');
      if (!monarch) return state;

      // Validate all IDs are active heirs
      const validIds = action.heirIds.filter((id) => {
        const p = state.people.find((pp) => pp.id === id);
        return p && p.status === 'active' && p.role === 'heir';
      });

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'crown',
        description: `Succession list updated (${validIds.length} heirs)`,
        call: `Crown.updateSuccessionList(heirs: [${validIds.join(', ')}])`,
      };

      return {
        ...state,
        crown: { ...state.crown, successionList: validIds },
        events: [newEvent, ...state.events],
      };
    }

    // ── Tour helper actions ──

    case 'TOUR_RESIGN_PM': {
      // Find the active PM in the current reducer state (not stale component state)
      const pm = state.people.find((p) => p.role === 'prime_minister' && p.status === 'active');
      if (!pm) return state;
      return changePersonStatus(state, pm.id, 'resigned');
    }

    case 'TOUR_RETIRE_JUSTICE': {
      // Find any active justice in the current reducer state
      const justice = state.people.find((p) => p.role === 'justice' && p.status === 'active');
      if (!justice) return state;
      return changePersonStatus(state, justice.id, 'resigned');
    }

    case 'TOUR_CROWN_NOMINATE_PM': {
      // Nominate a majlis member as PM — the engine finds the nominee from current state
      const members = state.people.filter((p) => p.role === 'majlis_member' && p.status === 'active');
      const nominee = action.attempt === 1 ? members[0] : (members[1] ?? members[0]);
      if (!nominee) return state;
      const confidenceStage = action.attempt === 1 ? 'Confidence1' : 'Confidence2';
      const newEvent: GovEvent = {
        day: state.day,
        marker: 'exec',
        description: `Crown nominated ${nominee.firstName} ${nominee.lastName} for Prime Minister`,
        call: `Executive.crownNominate(personId: ${nominee.id}) → confidence vote`,
      };
      return recalculateDerived({
        ...state,
        executive: {
          ...state.executive,
          formation: {
            ...state.executive.formation,
            stage: confidenceStage as import('./types').FormationStage,
            nomineeId: nominee.id,
            deadline: state.day + 14,
          },
        },
        events: [newEvent, ...state.events],
      });
    }

    case 'TOUR_PM_SEATED': {
      // Confidence passed: seat the nominee as PM
      const nomineeId = state.executive.formation.nomineeId;
      if (!nomineeId) return state;
      const nominee = state.people.find((p) => p.id === nomineeId);
      const name = nominee ? `${nominee.firstName} ${nominee.lastName}` : `Person ${nomineeId}`;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'exec',
        description: `${name} confirmed as Prime Minister by Parliament`,
        call: `Executive.confidencePassed(personId: ${nomineeId}) → PM seated`,
      };

      return recalculateDerived({
        ...state,
        people: state.people.map((p) =>
          p.id === nomineeId ? { ...p, role: 'prime_minister' as const, seatedDay: state.day } : p
        ),
        executive: {
          ...state.executive,
          pmSeated: true,
          caretaker: false,
          formation: { stage: 'Idle', nomineeId: null, deadline: null, attempt: 0 },
        },
        events: [newEvent, ...state.events],
      });
    }

    case 'TOUR_CONFIDENCE_FAIL': {
      const formation = state.executive.formation;
      const nextStage = formation.stage === 'Confidence1' ? 'CrownNom2' : 'MajlisList';
      const label = formation.stage === 'Confidence1' ? 'first' : 'second';

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'exec',
        description: `Parliament denied confidence (${label} attempt); ${nextStage === 'CrownNom2' ? 'Crown nominates again' : 'Majlis presents candidate list'}`,
        call: `Executive.confidenceFailed() → ${nextStage}`,
      };

      return recalculateDerived({
        ...state,
        executive: {
          ...state.executive,
          formation: {
            stage: nextStage as import('./types').FormationStage,
            nomineeId: null,
            deadline: state.day + 14,
            attempt: nextStage === 'CrownNom2' ? 2 : 2,
          },
        },
        events: [newEvent, ...state.events],
      });
    }

    case 'TOUR_SET_FORMATION': {
      return recalculateDerived({
        ...state,
        executive: {
          ...state.executive,
          formation: {
            ...state.executive.formation,
            stage: action.stage,
            deadline: state.day + 14,
          },
        },
      });
    }

    case 'TOUR_CONFIRM_JUSTICE': {
      const appt = state.court.appointments.find((a) => a.seatNumber === action.seatNumber);
      if (!appt) return state;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'court',
        description: `Justice Seat ${action.seatNumber}: Senate confirmed the nominee`,
        call: `SupremeCourt.senateApprove(seat: ${action.seatNumber}) → seated`,
      };

      // Reactivate the vacant justice
      let people = state.people;
      const vacant = people.find(
        (p) => p.role === 'justice' && p.seatNumber === action.seatNumber && p.status !== 'active'
      );
      if (vacant) {
        people = people.map((p) =>
          p.id === vacant.id ? { ...p, status: 'active' as const, seatedDay: state.day } : p
        );
      }

      return recalculateDerived({
        ...state,
        people,
        court: {
          ...state.court,
          appointments: state.court.appointments.filter((a) => a.seatNumber !== action.seatNumber),
        },
        events: [newEvent, ...state.events],
      });
    }

    case 'TOUR_REJECT_JUSTICE': {
      const appt = state.court.appointments.find((a) => a.seatNumber === action.seatNumber);
      if (!appt) return state;

      const wasFirst = appt.phase === 'SenateVote1' || appt.phase === 'CrownNom1';
      const nextPhase = wasFirst ? 'CrownNom2' : 'SenateList';
      const label = wasFirst ? 'first' : 'second';

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'court',
        description: `Justice Seat ${action.seatNumber}: Senate rejected ${label} nominee; ${nextPhase === 'CrownNom2' ? 'Crown nominates again' : 'Senate presents list'}`,
        call: `SupremeCourt.senateReject(seat: ${action.seatNumber}) → ${nextPhase}`,
      };

      return {
        ...state,
        court: {
          ...state.court,
          appointments: state.court.appointments.map((a) =>
            a.seatNumber === action.seatNumber
              ? { ...a, phase: nextPhase as import('./types').AppointmentPhase, deadline: state.day + 14 }
              : a
          ),
        },
        events: [newEvent, ...state.events],
      };
    }

    case 'TOUR_ADVANCE_NOMINATION': {
      // Advance a court appointment from CrownNom1→SenateVote1 or CrownNom2→SenateVote2
      // Picks the first eligible non-justice person as nominee
      const apptAdv = state.court.appointments.find((a) => a.seatNumber === action.seatNumber);
      if (!apptAdv) return state;
      if (apptAdv.phase !== 'CrownNom1' && apptAdv.phase !== 'CrownNom2') return state;

      const nextPhaseAdv: AppointmentPhase = apptAdv.phase === 'CrownNom1' ? 'SenateVote1' : 'SenateVote2';
      const eligibleAdv = state.people.filter((p) => p.status === 'active' && p.role !== 'justice' && p.role !== 'monarch' && p.role !== 'heir');
      const nomineeAdv = apptAdv.phase === 'CrownNom1' ? eligibleAdv[0] : (eligibleAdv[1] ?? eligibleAdv[0]);
      if (!nomineeAdv) return state;

      const nomLabel = state.crown.suspended ? (state.executive.pmSeated ? 'PM' : 'Senate') : 'Crown';
      const newEventAdv: GovEvent = {
        day: state.day,
        marker: 'court',
        description: `${nomLabel} nominated ${nomineeAdv.firstName} ${nomineeAdv.lastName} for Justice Seat ${action.seatNumber}`,
        call: `SupremeCourt.nominate(seat: ${action.seatNumber}, personId: ${nomineeAdv.id}) → ${nextPhaseAdv}`,
      };

      return {
        ...state,
        court: {
          ...state.court,
          appointments: state.court.appointments.map((a) =>
            a.seatNumber === action.seatNumber
              ? { ...a, phase: nextPhaseAdv, nomineeId: nomineeAdv.id, deadline: state.day + 14 }
              : a
          ),
        },
        events: [newEventAdv, ...state.events],
      };
    }

    case 'TOUR_NO_CONFIDENCE_PASSES': {
      if (!state.executive.noConfidence) return state;
      const pm = state.people.find((p) => p.role === 'prime_minister' && p.status === 'active');
      const pmName = pm ? `${pm.firstName} ${pm.lastName}` : 'the Prime Minister';

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'exec',
        description: `No-confidence passed: ${pmName} removed from office`,
        call: 'Executive.noConfidencePassed() → PM removed, formation begins',
      };

      let newState: GovState = {
        ...state,
        executive: {
          ...state.executive,
          noConfidence: { ...state.executive.noConfidence!, resolved: true, outcome: 'pass', yesVotes: 95, noVotes: 54 },
        },
        events: [newEvent, ...state.events],
      };

      // Remove PM via the normal cascade
      if (pm) {
        newState = changePersonStatus(newState, pm.id, 'removed');
      }

      return newState;
    }

    case 'TOUR_NO_CONFIDENCE_FAILS': {
      if (!state.executive.noConfidence) return state;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'exec',
        description: 'No-confidence motion failed: the Prime Minister retains Parliament\'s confidence',
        call: 'Executive.noConfidenceFailed() → PM continues',
      };

      return {
        ...state,
        executive: {
          ...state.executive,
          noConfidence: { ...state.executive.noConfidence!, resolved: true, outcome: 'fail', yesVotes: 54, noVotes: 95 },
        },
        events: [newEvent, ...state.events],
      };
    }

    case 'TOUR_SET_AMENDMENT_PHASE': {
      const amend = state.amendments.find((a) => a.id === action.amendmentId);
      if (!amend) return state;

      const phaseLabels: Record<string, string> = {
        'ParliamentVote': 'placed before Parliament for vote',
        'Referendum': 'approved by Parliament; referendum called',
        'Enacted': 'enacted into constitutional law',
        'Rejected': 'rejected',
      };

      const newEvent: GovEvent = {
        day: state.day,
        marker: action.phase === 'Referendum' || action.phase === 'Enacted' ? 'election' : 'parl',
        description: `Amendment "${amend.title}" ${phaseLabels[action.phase] || action.phase}`,
        call: `Referendum.setPhase(amendId: ${amend.id}, phase: "${action.phase}")`,
      };

      return {
        ...state,
        amendments: state.amendments.map((a) =>
          a.id === action.amendmentId
            ? {
                ...a,
                phase: action.phase,
                deadline: state.day + (action.phase === 'ParliamentVote' ? 30 : action.phase === 'Referendum' ? 60 : 0),
                parlYes: action.parlYes ?? a.parlYes,
                refYes: action.refYes ?? a.refYes,
                refNo: action.refNo ?? a.refNo,
              }
            : a
        ),
        events: [newEvent, ...state.events],
      };
    }

    case 'TOUR_SET_ELECTION_PHASE': {
      const proc = state.elections.processes.find((e) => e.id === action.electionId);
      if (!proc) return state;

      const phaseLabels: Record<string, string> = {
        'registration': 'registration opened',
        'voting': 'voting has begun',
        'tallied': 'votes tallied',
        'seated': 'winners seated',
      };

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'election',
        description: `Election: ${phaseLabels[action.phase] || action.phase}`,
        call: `Election.setPhase(electionId: ${action.electionId}, phase: "${action.phase}")`,
      };

      let people = state.people;
      let parliament = state.parliament;

      // If seating after a general election, reactivate all removed majlis members
      if (action.phase === 'seated' && proc.electionType === 'majlis_general') {
        people = people.map((p) => {
          if (p.role === 'majlis_member' && p.status === 'removed') {
            return { ...p, status: 'active' as const, seatedDay: state.day, termEnd: state.day + 1460 };
          }
          return p;
        });
        parliament = { ...parliament, dissolved: false, quorum: true };
      }

      return recalculateDerived({
        ...state,
        people,
        parliament,
        elections: {
          ...state.elections,
          processes: state.elections.processes.map((e) =>
            e.id === action.electionId
              ? { ...e, phase: action.phase, phaseDeadline: state.day + 14 }
              : e
          ),
        },
        events: [newEvent, ...state.events],
      });
    }

    case 'TOUR_START_PROVINCIAL_ELECTIONS': {
      // Create 31 election processes, one per province, for a Majlis general election
      const baseId = Math.max(0, ...state.elections.processes.map((e) => e.id), 0) + 1;
      const newProcesses = state.provinces.map((prov, i) => ({
        id: baseId + i,
        electionType: 'majlis_general' as const,
        phase: 'registration' as const,
        provinceId: prov.id,
        startDay: state.day,
        phaseDeadline: state.day + 14,
        seatsContested: prov.majlisSeats,
      }));

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'election',
        description: `General election opened across all ${state.provinces.length} provinces`,
        call: `Election.startProvincial(provinces: ${state.provinces.length})`,
      };

      return {
        ...state,
        elections: {
          ...state.elections,
          processes: [...state.elections.processes, ...newProcesses],
        },
        events: [newEvent, ...state.events],
      };
    }

    case 'TOUR_SET_ALL_ELECTIONS_PHASE': {
      const parties = ['Nonahzadan', 'Edalat', 'Sabz', 'Azadi', 'Omid'];
      const activeProcs = state.elections.processes.filter((p) => p.phase !== 'seated');

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'election',
        description: `All elections advanced to ${action.phase}`,
        call: `Election.setAllPhase(phase: "${action.phase}", count: ${activeProcs.length})`,
      };

      let people = state.people;
      let parliament = state.parliament;

      // If seating, reactivate majlis members
      if (action.phase === 'seated') {
        people = people.map((p) => {
          if (p.role === 'majlis_member' && p.status === 'removed') {
            return { ...p, status: 'active' as const, seatedDay: state.day, termEnd: state.day + 1460 };
          }
          return p;
        });
        parliament = { ...parliament, dissolved: false, quorum: true };
      }

      return recalculateDerived({
        ...state,
        people,
        parliament,
        elections: {
          ...state.elections,
          processes: state.elections.processes.map((e) => {
            if (e.phase === 'seated') return e; // skip already completed
            const result = action.phase === 'seated'
              ? { turnout: 0.55 + seededRandom(e.id * 7) * 0.25, winningParty: parties[e.id % parties.length] }
              : undefined;
            return {
              ...e,
              phase: action.phase,
              phaseDeadline: state.day + 14,
              results: result ?? e.results,
            };
          }),
        },
        events: [newEvent, ...state.events],
      });
    }

    case 'TOUR_COMPLETE_BY_ELECTIONS': {
      const toComplete = state.elections.processes.filter((p) => p.phase !== 'seated');
      if (toComplete.length === 0) return state;

      let people = state.people;
      for (const proc of toComplete) {
        if ((proc.electionType === 'senate_byelection' || proc.electionType === 'majlis_byelection') && proc.provinceId) {
          const role = proc.electionType === 'senate_byelection' ? 'senator' : 'majlis_member';
          const termLength = role === 'senator' ? 2190 : 1460;
          const dead = people.find((p) =>
            p.role === role && p.provinceId === proc.provinceId && p.status !== 'active'
          );
          if (dead) {
            people = people.map((p) =>
              p.id === dead.id
                ? { ...p, status: 'active' as const, seatedDay: state.day, termEnd: state.day + termLength }
                : p
            );
          }
        }
      }

      const byElEvent: GovEvent = {
        day: state.day,
        marker: 'election',
        description: `${toComplete.length} by-election(s) completed: new representatives seated`,
        call: `Election.seatByElectionWinners(count: ${toComplete.length})`,
      };

      return recalculateDerived({
        ...state,
        people,
        elections: {
          ...state.elections,
          processes: state.elections.processes.map((e) =>
            e.phase !== 'seated'
              ? { ...e, phase: 'seated' as const, phaseDeadline: state.day }
              : e
          ),
        },
        events: [byElEvent, ...state.events],
      });
    }

    case 'TOUR_SEAT_ALL_APPOINTMENTS': {
      if (state.court.appointments.length === 0) return state;

      let people = state.people;
      let seated = 0;
      for (const appt of state.court.appointments) {
        const justice = people.find((p) =>
          p.role === 'justice' && p.seatNumber === appt.seatNumber && p.status !== 'active'
        );
        if (justice) {
          people = people.map((p) =>
            p.id === justice.id
              ? { ...p, status: 'active' as const, seatedDay: state.day, termEnd: state.day + 3285 }
              : p
          );
          seated++;
        }
      }

      const seatEvent: GovEvent = {
        day: state.day,
        marker: 'court',
        description: `${seated} justice(s) confirmed and seated by the Senate`,
        call: `SupremeCourt.seatAll(count: ${seated})`,
      };

      return recalculateDerived({
        ...state,
        people,
        court: { ...state.court, appointments: [] },
        events: [seatEvent, ...state.events],
      });
    }

    case 'TOUR_CONFIRM_HALF_APPOINTMENTS': {
      const appointments = state.court.appointments;
      if (appointments.length === 0) return state;

      const halfCount = Math.ceil(appointments.length / 2);
      const toConfirm = appointments.slice(0, halfCount);
      const remaining = appointments.slice(halfCount);

      let people = state.people;
      for (const appt of toConfirm) {
        const justice = people.find((p) =>
          p.role === 'justice' && p.seatNumber === appt.seatNumber && p.status !== 'active'
        );
        if (justice) {
          people = people.map((p) =>
            p.id === justice.id
              ? { ...p, status: 'active' as const, seatedDay: state.day, termEnd: state.day + 3285 }
              : p
          );
        }
      }

      const halfEvent: GovEvent = {
        day: state.day,
        marker: 'court',
        description: `${toConfirm.length} justice(s) confirmed by the Senate; ${remaining.length} seat(s) still pending`,
        call: `SupremeCourt.confirmBatch(confirmed: ${toConfirm.length}, pending: ${remaining.length})`,
      };

      return recalculateDerived({
        ...state,
        people,
        court: { ...state.court, appointments: remaining },
        events: [halfEvent, ...state.events],
      });
    }

    case 'TOUR_RESTORE_PROVINCE': {
      const provinceName = state.provinces.find((pv) => pv.id === action.provinceId)?.name ?? 'province';
      const toRestore = state.people.filter((p) =>
        p.role === 'provincial_council' && p.provinceId === action.provinceId && p.status !== 'active'
      );
      if (toRestore.length === 0) return state;

      const restoreIds = new Set(toRestore.map((p) => p.id));
      const people = state.people.map((p) =>
        restoreIds.has(p.id)
          ? { ...p, status: 'active' as const, seatedDay: state.day }
          : p
      );

      const restoreEvent: GovEvent = {
        day: state.day,
        marker: 'election',
        description: `Provincial council rebuilt in ${provinceName}: ${toRestore.length} members seated`,
        call: `ProvincialCouncil.restore(provinceId: ${action.provinceId}, count: ${toRestore.length})`,
      };

      return recalculateDerived({
        ...state,
        people,
        events: [restoreEvent, ...state.events],
      });
    }

    // ── Player actions ──

    case 'ISSUE_PASSPORT': {
      if (state.player) return state; // already issued
      const province = state.provinces.find((p) => p.id === action.provinceId);
      if (!province) return state;

      const passportNum = (action.provinceId * 1000000 + state.day * 1000 + Math.floor(seededRandom(state.day * 999) * 999)).toString().padStart(8, '0');
      const passportNumber = `IRN-${passportNum}`;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'election',
        description: `Passport issued to ${action.firstName} ${action.lastName} in ${province.name}`,
        call: `CitizenRegistry.register(name: "${action.firstName} ${action.lastName}", province: ${province.name})`,
      };

      return {
        ...state,
        player: {
          firstName: action.firstName,
          lastName: action.lastName,
          provinceId: action.provinceId,
          passportNumber,
          issuedDay: state.day,
        },
        events: [newEvent, ...state.events],
      };
    }

    case 'CAST_VOTE': {
      if (!state.player) return state;
      const election = state.elections.processes.find((e) => e.id === action.electionId);
      if (!election || election.phase !== 'voting') return state;
      if (state.playerVotes.some((v) => v.electionId === action.electionId)) return state;

      // Generate deterministic proof and nullifier hashes from passport + election
      const passportSeed = state.player.passportNumber.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const proofHash = generateHexHash(passportSeed * 31 + action.electionId * 7919);
      const nullifierHash = generateHexHash(passportSeed * 47 + action.electionId * 6271 + 9973);

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'election',
        description: `${state.player.firstName} ${state.player.lastName} cast their ballot`,
        call: `Election.castBallot(electionId: ${action.electionId}, party: "${action.party}")`,
      };

      return {
        ...state,
        playerVotes: [...state.playerVotes, {
          electionId: action.electionId,
          party: action.party,
          castDay: state.day,
          proofHash,
          nullifierHash,
        }],
        events: [newEvent, ...state.events],
      };
    }

    case 'START_PLAYER_ELECTION': {
      if (!state.player) return state;
      const playerProvinceId = state.player.provinceId;
      const province = state.provinces.find((p) => p.id === playerProvinceId);
      if (!province) return state;

      // Don't create duplicate — check if there's already a provincial election for this province
      const existing = state.elections.processes.find(
        (e) => e.electionType === 'provincial' && e.provinceId === playerProvinceId && e.phase !== 'seated'
      );
      if (existing) return state;

      const newId = Math.max(0, ...state.elections.processes.map((e) => e.id), 0) + 1;

      const newEvent: GovEvent = {
        day: state.day,
        marker: 'election',
        description: `Provincial council election opened in ${province.name}`,
        call: `Election.startProvincial(provinceId: ${playerProvinceId}, id: ${newId})`,
      };

      return {
        ...state,
        elections: {
          ...state.elections,
          processes: [
            ...state.elections.processes,
            {
              id: newId,
              electionType: 'provincial',
              phase: 'voting', // fast-tracked to voting
              provinceId: playerProvinceId,
              startDay: state.day,
              phaseDeadline: state.day + 7,
              seatsContested: province.councilSize,
            },
          ],
        },
        events: [newEvent, ...state.events],
      };
    }

    // ── Genesis actions ──

    case 'RESET_TO_GENESIS':
      return createGenesisState();

    case 'GENESIS_ADVANCE':
      return applyGenesisStage(state, action.stage);

    default:
      return state;
  }
}

function formatElectionType(electionType: string): string {
  switch (electionType) {
    case 'majlis_general': return 'Majlis general election';
    case 'senate': return 'Senate election';
    case 'provincial': return 'Provincial council election';
    case 'majlis_byelection': return 'Majlis by-election';
    case 'senate_byelection': return 'Senate by-election';
    default: return electionType;
  }
}

/** Find the next day on which something interesting happens. */
export function findNextEventDay(state: GovState): number {
  const deadlines: number[] = [];

  // Bill deadlines
  for (const b of state.bills) {
    if (!isTerminal(b.stage)) deadlines.push(b.deadline);
  }

  // Election countdowns
  if (state.elections.nextScheduled > 0) {
    deadlines.push(state.day + state.elections.nextScheduled);
  }
  for (const proc of state.elections.processes) {
    if (proc.phase !== 'seated') deadlines.push(proc.phaseDeadline);
  }

  // Formation deadline
  if (state.executive.formation.deadline) {
    deadlines.push(state.executive.formation.deadline);
  }

  // Appointment deadlines
  for (const appt of state.court.appointments) {
    if (appt.deadline) deadlines.push(appt.deadline);
  }

  // Amendment deadlines
  for (const amend of state.amendments) {
    if (!['Enacted', 'Rejected', 'Expired'].includes(amend.phase)) {
      deadlines.push(amend.deadline);
    }
  }

  // Budget deadline
  if (state.budget.deadline) {
    deadlines.push(state.budget.deadline);
  }

  // No-confidence
  if (state.executive.noConfidence && !state.executive.noConfidence.resolved) {
    deadlines.push(state.executive.noConfidence.deadline);
  }

  if (deadlines.length === 0) return state.day + 1;
  return Math.min(...deadlines.filter((d) => d > state.day));
}
