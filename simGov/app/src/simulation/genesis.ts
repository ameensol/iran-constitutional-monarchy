import type { GovState, GovEvent } from './types';
import { PROVINCES, TOTAL_MAJLIS_SEATS, SENATE_TOTAL } from './provinces';
import { recalculateDerived } from './selectors';
import {
  generateRoyalFamily,
  generateMajlis,
  generateSenate,
  generateExecutive,
  generateJustices,
  generateCouncils,
} from './nameGen';

/** Creates an empty day-0 state: constitution deployed, no institutions yet. */
export function createGenesisState(): GovState {
  const baseState: GovState = {
    day: 0,
    year: 2584,

    people: [],
    provinces: PROVINCES,

    crown: {
      monarchId: null,
      suspended: true,
      successionList: [],
      pendingActions: 0,
      monarch: '(Vacant)',
      heirs: 0,
    },

    parliament: {
      dissolved: true,
      quorum: false,
      majlisSeats: 0,
      majlisTotal: TOTAL_MAJLIS_SEATS,
      senateSeats: 0,
      senateTotal: SENATE_TOTAL,
    },

    bills: [],

    executive: {
      pmId: null,
      deputyPmId: null,
      pmSeated: false,
      caretaker: false,
      formation: {
        stage: 'Idle',
        nomineeId: null,
        deadline: null,
        attempt: 0,
      },
      noConfidence: null,
      stage: 'Idle',
      ministers: 0,
    },

    court: {
      totalSeats: 12,
      appointments: [],
      activeReviews: 0,
      crisis: true,
      justices: 0,
      pendingAppointment: null,
    },

    elections: {
      processes: [],
      nextScheduled: 0,
      active: 0,
      byElectionsPending: 0,
    },

    budget: {
      fiscalYear: 2584,
      status: 'None',
      allocated: 0,
      totalAmount: 0,
      auditClean: true,
      proposedDay: null,
      deadline: null,
      rejectCount: 0,
      auditHeadId: null,
      auditHeadTermEnd: null,
      supplementaryCount: 0,
    },

    amendments: [],

    disputes: [],
    petitions: [],
    reviews: [],

    player: null,
    playerVotes: [],

    events: [
      {
        day: 0,
        marker: 'crown',
        description: 'Constitution deployed on-chain',
        call: 'Constitution.deploy() → all governance contracts initialized',
      },
    ],
  };

  return baseState;
}

/** Total number of genesis stages that modify state (stages 1 through GENESIS_MAX_STAGE). */
export const GENESIS_MAX_STAGE = 7;

/**
 * Apply a genesis stage to the state. Each stage populates one set of institutions.
 * Returns a new state with the institution populated and events added.
 *
 * Order:
 *   1 — Coronation
 *   2 — Elections (provincial councils, Majlis, Senate selection)
 *   3 — Parliament convened (seats the elected members)
 *   4 — Executive formation
 *   5 — Supreme Court
 *   6 — First bill
 *   7 — Final sandbox frame (no state change)
 */
export function applyGenesisStage(state: GovState, stage: number): GovState {
  const baseSeed = 42 * 31337; // fixed seed for genesis
  const day = 0;

  switch (stage) {
    // Stage 1: Coronation — monarch + 3 heirs
    case 1: {
      const nextId = state.people.length + 1;
      const royal = generateRoyalFamily(nextId, baseSeed, day);
      const monarch = royal.people.find((p) => p.role === 'monarch');
      const heirs = royal.people.filter((p) => p.role === 'heir');

      const events: GovEvent[] = [
        {
          day: 0,
          marker: 'crown',
          description: `${monarch!.firstName} ${monarch!.lastName} crowned as sovereign`,
          call: `Crown.coronation(monarchId: ${monarch!.id}) → succession list set`,
        },
      ];

      const newState: GovState = {
        ...state,
        people: [...state.people, ...royal.people],
        crown: {
          ...state.crown,
          monarchId: monarch!.id,
          suspended: false,
          successionList: heirs.map((h) => h.id),
          monarch: `${monarch!.firstName} ${monarch!.lastName}`,
          heirs: heirs.length,
        },
        events: [...events, ...state.events],
      };
      return newState;
    }

    // Stage 2: Elections — provincial councils elected, Majlis elected, Senate selected
    case 2: {
      const nextId = state.people.length + 1;
      const councils = generateCouncils(nextId, baseSeed, day);
      const majlis = generateMajlis(councils.nextId, baseSeed, day);
      const senate = generateSenate(majlis.nextId, baseSeed, day);
      const allElected = [...councils.people, ...majlis.people, ...senate.people];

      const events: GovEvent[] = [
        {
          day: 0,
          marker: 'election',
          description: `Elections held: ${councils.people.length} provincial council members, ${majlis.people.length} Majlis members elected, ${senate.people.length} senators selected`,
          call: `Election.runAll() → results certified across ${PROVINCES.length} provinces`,
        },
      ];

      const newState: GovState = {
        ...state,
        people: [...state.people, ...allElected],
        elections: {
          ...state.elections,
          active: 0,
          nextScheduled: 1460, // next general election in ~4 years
        },
        events: [...events, ...state.events],
      };
      return recalculateDerived(newState);
    }

    // Stage 3: Parliament convened — seats the members elected in stage 2
    case 3: {
      const majlisMembers = state.people.filter((p) => p.role === 'majlis_member');
      const senateMembers = state.people.filter((p) => p.role === 'senator' || p.role === 'crown_senator');

      const events: GovEvent[] = [
        {
          day: 0,
          marker: 'parl',
          description: `First Parliament convened: ${majlisMembers.length} Majlis members, ${senateMembers.length} senators`,
          call: `Parliament.convene() → quorum established`,
        },
      ];

      const newState: GovState = {
        ...state,
        parliament: {
          ...state.parliament,
          dissolved: false,
          quorum: true,
          majlisSeats: majlisMembers.length,
          senateSeats: senateMembers.length,
        },
        events: [...events, ...state.events],
      };
      return recalculateDerived(newState);
    }

    // Stage 4: Executive Formation — PM + Deputy PM + 14 ministers
    case 4: {
      const nextId = state.people.length + 1;
      const exec = generateExecutive(nextId, baseSeed, day);
      const pm = exec.people.find((p) => p.role === 'prime_minister');
      const deputyPm = exec.people.find((p) => p.role === 'deputy_pm');
      const ministers = exec.people.filter((p) => p.role === 'minister');

      const events: GovEvent[] = [
        {
          day: 0,
          marker: 'exec',
          description: `${pm!.firstName} ${pm!.lastName} confirmed as Prime Minister with ${ministers.length}-member cabinet`,
          call: `Executive.grantConfidence(pmId: ${pm!.id}) → cabinet seated`,
        },
      ];

      const newState: GovState = {
        ...state,
        people: [...state.people, ...exec.people],
        executive: {
          ...state.executive,
          pmId: pm!.id,
          deputyPmId: deputyPm!.id,
          pmSeated: true,
          ministers: ministers.length,
        },
        events: [...events, ...state.events],
      };
      return recalculateDerived(newState);
    }

    // Stage 5: Supreme Court — 12 justices
    case 5: {
      const nextId = state.people.length + 1;
      const justices = generateJustices(nextId, baseSeed, day);

      const events: GovEvent[] = [
        {
          day: 0,
          marker: 'court',
          description: `Supreme Court seated: ${justices.people.length} justices confirmed`,
          call: `SupremeCourt.seatAll() → constitutional review enabled`,
        },
      ];

      const newState: GovState = {
        ...state,
        people: [...state.people, ...justices.people],
        court: {
          ...state.court,
          justices: justices.people.length,
          crisis: false,
          appointments: [],
        },
        events: [...events, ...state.events],
      };
      return recalculateDerived(newState);
    }

    // Stage 6: First Bill
    case 6: {
      const newBill = {
        id: 1,
        name: 'Education Reform Act',
        sponsor: 'citizen1',
        submittedDay: 0,
        stage: 'Introduced' as const,
        majlisYes: 0,
        majlisNo: 0,
        senateYes: 0,
        senateNo: 0,
        deadline: 14,
        crownReturned: false,
      };

      const events: GovEvent[] = [
        {
          day: 0,
          marker: 'parl',
          description: 'Education Reform Act submitted to the Majlis',
          call: 'Parliament.submitBill(billId: 1, name: "Education Reform Act")',
        },
      ];

      const newState: GovState = {
        ...state,
        bills: [newBill],
        events: [...events, ...state.events],
      };
      return recalculateDerived(newState);
    }

    // Stage 7: Final frame (no state change, just explanation)
    case 7:
      return state;

    default:
      return state;
  }
}
