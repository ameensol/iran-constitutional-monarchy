import type { GovState } from './types';
import { generateInitialPeople } from './nameGen';
import { PROVINCES, TOTAL_MAJLIS_SEATS, SENATE_TOTAL } from './provinces';
import { recalculateDerived } from './selectors';

/** Creates the seeded initial state with ~700 people. */
export function createInitialState(): GovState {
  const startDay = 247;
  const people = generateInitialPeople(startDay);

  // Build succession list from heirs
  const heirs = people.filter((p) => p.role === 'heir' && p.status === 'active');
  const successionList = heirs.map((h) => h.id);

  // Find monarch
  const monarch = people.find((p) => p.role === 'monarch' && p.status === 'active');
  const pm = people.find((p) => p.role === 'prime_minister' && p.status === 'active');
  const deputyPm = people.find((p) => p.role === 'deputy_pm' && p.status === 'active');

  const baseState: GovState = {
    day: startDay,
    year: 2584,

    people,
    provinces: PROVINCES,

    crown: {
      monarchId: monarch?.id ?? null,
      suspended: false,
      successionList,
      pendingActions: 1,
      monarch: monarch ? `${monarch.firstName} ${monarch.lastName}` : '(Vacant)',
      heirs: heirs.length,
    },

    parliament: {
      dissolved: false,
      quorum: true,
      majlisSeats: 142,
      majlisTotal: TOTAL_MAJLIS_SEATS,
      senateSeats: 68,
      senateTotal: SENATE_TOTAL,
    },

    bills: [
      {
        id: 1,
        name: 'Education Reform Act',
        sponsor: 'citizen1',
        submittedDay: 241,
        stage: 'Majlis Voting',
        majlisYes: 68,
        majlisNo: 22,
        senateYes: 0,
        senateNo: 0,
        deadline: 255,
        crownReturned: false,
      },
      {
        id: 2,
        name: 'Infrastructure Budget',
        sponsor: 'citizen2',
        submittedDay: 229,
        stage: 'Senate Review',
        majlisYes: 98,
        majlisNo: 42,
        senateYes: 24,
        senateNo: 8,
        deadline: 265,
        crownReturned: false,
      },
      {
        id: 3,
        name: 'Trade Agreement',
        sponsor: 'citizen3',
        submittedDay: 247,
        stage: 'Crown Action',
        majlisYes: 110,
        majlisNo: 30,
        senateYes: 52,
        senateNo: 16,
        deadline: 259,
        crownReturned: false,
      },
    ],

    executive: {
      pmId: pm?.id ?? null,
      deputyPmId: deputyPm?.id ?? null,
      pmSeated: true,
      caretaker: false,
      formation: {
        stage: 'Idle',
        nomineeId: null,
        deadline: null,
        attempt: 0,
      },
      noConfidence: null,
      stage: 'Idle',
      ministers: 14,
    },

    court: {
      totalSeats: 12,
      appointments: [
        {
          seatNumber: 7,
          phase: 'CrownNom1',
          nomineeId: null,
          deadline: startDay + 30,
        },
      ],
      activeReviews: 1,
      crisis: true,
      justices: 11,
      pendingAppointment: 7,
    },

    elections: {
      processes: [],
      nextScheduled: 42,
      active: 0,
      byElectionsPending: 0,
    },

    budget: {
      fiscalYear: 2584,
      status: 'Active',
      allocated: 72,
      totalAmount: 850,
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
        day: 247,
        marker: 'parl',
        description: 'Trade Agreement submitted to the Majlis',
        call: 'Parliament.submitBill(billId: 3, name: "Trade Agreement", sponsor: citizen3)',
      },
      {
        day: 245,
        marker: 'exec',
        description: 'Prime Minister seated after confidence vote',
        call: 'Executive.grantConfidence(pmAddress: 0x...a1b2) → PM seated',
      },
      {
        day: 242,
        marker: 'crown',
        description: 'The Crown signed the Judicial Reform Act into law',
        call: 'Crown.enactLaw(billId: 0) → Parliament.markEnacted(0)',
      },
      {
        day: 240,
        marker: 'election',
        description: 'Majlis general election tallied, 142 seats filled',
        call: 'Election.tallyMajlis(electionId: 1) → 142 winners seated',
      },
      {
        day: 238,
        marker: 'court',
        description: 'Constitutional review filed for Bill #1',
        call: 'SupremeCourt.fileReview(billId: 1, petitioner: citizen4)',
      },
      {
        day: 235,
        marker: 'budget',
        description: 'Fiscal year 2584 budget enacted',
        call: 'Budget.enact(fiscalYear: 2584) → allocated: 72%',
      },
    ],
  };

  // Recalculate derived counts from actual people array
  return recalculateDerived(baseState);
}
