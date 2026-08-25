/* ── Governance Simulation Types ──────────────────── */

// ── Identifiers ────────────────────────────────────

export type PersonId = number;
export type ProvinceId = number;

// ── Person System ──────────────────────────────────

export type PersonRole =
  | 'monarch'
  | 'heir'
  | 'majlis_member'
  | 'senator'
  | 'crown_senator'
  | 'justice'
  | 'prime_minister'
  | 'deputy_pm'
  | 'minister'
  | 'provincial_council';

export type PersonStatus = 'active' | 'dead' | 'incapacitated' | 'resigned' | 'removed';

export type PartyId = string;

export interface Person {
  id: PersonId;
  firstName: string;
  lastName: string;
  role: PersonRole;
  status: PersonStatus;
  provinceId: ProvinceId;
  party: PartyId;
  seatedDay: number;      // day they took office
  termEnd: number | null;  // day their term expires (null = life/indefinite)
  seatNumber?: number;     // for justices (1-12), senators, majlis members
}

export function personName(p: Person): string {
  return `${p.firstName} ${p.lastName}`;
}

// ── Province ───────────────────────────────────────

export type SenateCohort = 'A' | 'B' | 'C';

export interface Province {
  id: ProvinceId;
  name: string;
  senateCohort: SenateCohort;
  majlisSeats: number;     // seats allocated to this province
  councilSize: number;     // provincial council members (15)
}

// ── Bill System (preserved from MVP) ───────────────

export type BillStage =
  | 'Introduced'
  | 'Majlis Voting'
  | 'Senate Review'
  | 'Crown Action'
  | 'Enacted'
  | 'Returned'
  | 'Majlis Revote'
  | 'Senate Objected'
  | 'Majlis Override'
  | 'Referred'
  | 'Rejected'
  | 'Vetoed';

export interface Bill {
  id: number;
  name: string;
  sponsor: string;
  submittedDay: number;
  stage: BillStage;
  majlisYes: number;
  majlisNo: number;
  senateYes: number;
  senateNo: number;
  deadline: number;
  crownReturned: boolean;
}

// ── Election System ────────────────────────────────

export type ElectionType = 'majlis_general' | 'senate' | 'provincial' | 'majlis_byelection' | 'senate_byelection';

export type ElectionPhase = 'registration' | 'voting' | 'tallied' | 'seated';

export interface ElectionProcess {
  id: number;
  electionType: ElectionType;
  phase: ElectionPhase;
  provinceId?: ProvinceId;   // for provincial/by-elections
  startDay: number;
  phaseDeadline: number;
  seatsContested: number;
  results?: { turnout: number; winningParty: string };
}

// ── Executive Formation ────────────────────────────

export type FormationStage =
  | 'Idle'
  | 'CrownNom1'
  | 'Confidence1'
  | 'CrownNom2'
  | 'Confidence2'
  | 'MajlisList'
  | 'CrownPick'
  | 'Dissolved';

export interface FormationProcess {
  stage: FormationStage;
  nomineeId: PersonId | null;
  deadline: number | null;
  attempt: number;  // 1 or 2 for crown nominations
}

// ── Justice Appointment ────────────────────────────

export type AppointmentPhase =
  | 'CrownNom1'
  | 'SenateVote1'
  | 'CrownNom2'
  | 'SenateVote2'
  | 'SenateList'
  | 'CrownPick'
  | 'Seated';

export interface JusticeAppointment {
  seatNumber: number;
  phase: AppointmentPhase;
  nomineeId: PersonId | null;
  deadline: number | null;
  _frozen?: boolean;  // true when Crown suspended + no PM can nominate
}

// ── Amendment & Referendum ─────────────────────────

export type AmendmentPhase =
  | 'Proposed'
  | 'ParliamentVote'
  | 'Referendum'
  | 'Enacted'
  | 'Rejected'
  | 'Expired';

export interface Amendment {
  id: number;
  title: string;
  phase: AmendmentPhase;
  proposedDay: number;
  deadline: number;
  parlYes: number;
  parlNo: number;
  refYes: number;
  refNo: number;
  emergency: boolean;
}

// ── No-Confidence Motion ───────────────────────────

export interface NoConfidenceMotion {
  filedDay: number;
  deadline: number;   // vote must happen by this day
  yesVotes: number;
  noVotes: number;
  resolved: boolean;
  outcome?: 'pass' | 'fail';
}

// ── Event Log ──────────────────────────────────────

export type EventMarker = 'crown' | 'parl' | 'exec' | 'court' | 'election' | 'budget';

export interface GovEvent {
  day: number;
  marker: EventMarker;
  description: string;
  call: string;
}

// ── Headlines ─────────────────────────────────────

export type HeadlineCategory = 'LEGISLATION' | 'CROWN' | 'EXECUTIVE' | 'JUDICIARY' | 'ELECTIONS' | 'CRISIS' | 'BUDGET' | 'CONSTITUTIONAL';

export interface Headline {
  text: string;
  subtext?: string;
  category: HeadlineCategory;
  breaking: boolean;
}

// ── Player Identity ───────────────────────────────

export interface PlayerIdentity {
  firstName: string;
  lastName: string;
  provinceId: ProvinceId;
  passportNumber: string;   // "IRN-XXXXXXXX"
  issuedDay: number;
}

export interface PlayerVote {
  electionId: number;
  party: PartyId;
  castDay: number;
  proofHash?: string;      // ZK proof hash (deterministic from passport + election)
  nullifierHash?: string;  // double-vote prevention nullifier
}

// ── Budget ─────────────────────────────────────────

export interface BudgetState {
  fiscalYear: number;
  status: 'None' | 'Proposed' | 'Approved' | 'Active' | 'Rejected' | 'Continuation';
  allocated: number;
  totalAmount: number;         // budget total in arbitrary units
  auditClean: boolean;
  proposedDay: number | null;
  deadline: number | null;
  rejectCount: number;
  auditHeadId: PersonId | null;
  auditHeadTermEnd: number | null;
  supplementaryCount: number;  // how many supplementary budgets approved this FY
}

// ── Constitutional Review (direct filing) ─────────

export type ReviewPhase = 'Filed' | 'Voting' | 'Resolved';

export interface ConstitutionalReview {
  id: number;
  petitioner: string;         // 'Crown' | 'PM' | 'Parliament'
  lawDescription: string;
  phase: ReviewPhase;
  filedDay: number;
  deadline: number;
  yesVotes: number;           // constitutional
  noVotes: number;            // unconstitutional
  ruling?: 'constitutional' | 'unconstitutional';
}

// ── Dispute Resolution ────────────────────────────

export type DisputePhase = 'Filed' | 'Voting' | 'Resolved';

export interface Dispute {
  id: number;
  petitioner: string;         // institution name
  respondent: string;         // institution name
  description: string;
  phase: DisputePhase;
  filedDay: number;
  deadline: number;
  yesVotes: number;           // justices voting to uphold petitioner
  noVotes: number;
  ruling?: 'petitioner' | 'respondent';
}

// ── Collective Petition ───────────────────────────

export interface CollectivePetition {
  id: number;
  title: string;
  creatorId: PersonId;
  signatures: number;
  requiredSignatures: number;
  filedDay: number;
  deadline: number;
  activated: boolean;
}

// ── Full Governance State ──────────────────────────

export interface GovState {
  day: number;
  year: number;

  // People-based state
  people: Person[];
  provinces: Province[];

  crown: {
    monarchId: PersonId | null;
    suspended: boolean;
    successionList: PersonId[];
    pendingActions: number;
    // Legacy fields derived from people (kept for backward compat during migration)
    monarch: string;
    heirs: number;
  };

  parliament: {
    dissolved: boolean;
    quorum: boolean;
    // Legacy counts (now derived via selectors)
    majlisSeats: number;
    majlisTotal: number;
    senateSeats: number;
    senateTotal: number;
  };

  bills: Bill[];

  executive: {
    pmId: PersonId | null;
    deputyPmId: PersonId | null;
    pmSeated: boolean;
    caretaker: boolean;
    formation: FormationProcess;
    noConfidence: NoConfidenceMotion | null;
    // Legacy
    stage: FormationStage;
    ministers: number;
  };

  court: {
    totalSeats: number;
    appointments: JusticeAppointment[];
    activeReviews: number;
    crisis: boolean;
    // Legacy
    justices: number;
    pendingAppointment: number | null;
  };

  elections: {
    processes: ElectionProcess[];
    nextScheduled: number;
    // Legacy
    active: number;
    byElectionsPending: number;
  };

  budget: BudgetState;

  amendments: Amendment[];

  disputes: Dispute[];
  petitions: CollectivePetition[];
  reviews: ConstitutionalReview[];

  player: PlayerIdentity | null;
  playerVotes: PlayerVote[];

  events: GovEvent[];
}

// ── Actions ────────────────────────────────────────

export type DisasterId =
  | 'nuke_tehran'
  | 'earthquake'
  | 'plane_crash'
  | 'assassination'
  | 'mass_resignation'
  | 'revolution'
  | 'judicial_massacre'
  | 'economic_crisis'
  | 'provincial_uprising'
  | 'full_1979';

export type GovAction =
  // Existing
  | { type: 'ADVANCE_DAY' }
  | { type: 'SIGN_BILL'; billId: number }
  | { type: 'RETURN_BILL'; billId: number }
  | { type: 'DISSOLVE_PARLIAMENT' }
  | { type: 'SUBMIT_BILL'; name: string; sponsor: string }
  | { type: 'CROWN_TIMEOUT'; billId: number }
  // People actions
  | { type: 'KILL_PERSON'; personId: PersonId }
  | { type: 'INCAPACITATE_PERSON'; personId: PersonId }
  | { type: 'RESIGN_PERSON'; personId: PersonId }
  | { type: 'KILL_BULK'; personIds: PersonId[] }
  // Executive actions
  | { type: 'CROWN_NOMINATE_PM'; personId: PersonId }
  | { type: 'FILE_NO_CONFIDENCE' }
  | { type: 'VOTE_CONFIDENCE'; yes: boolean }
  // Court actions
  | { type: 'CROWN_NOMINATE_JUSTICE'; seatNumber: number; personId: PersonId }
  | { type: 'RESOLVE_JUSTICE_VOTE'; seatNumber: number; outcome: 'approve' | 'reject' }
  | { type: 'REFER_TO_COURT'; billId: number }
  | { type: 'COURT_UPHOLD_BILL'; billId: number }
  | { type: 'COURT_STRIKE_BILL'; billId: number }
  // No-confidence / confidence resolution
  | { type: 'RESOLVE_NO_CONFIDENCE'; outcome: 'pass' | 'fail' }
  | { type: 'RESOLVE_CONFIDENCE'; outcome: 'pass' | 'fail' }
  // Election actions
  | { type: 'START_ELECTION'; electionType: ElectionType; provinceId?: ProvinceId }
  // Amendment actions
  | { type: 'PROPOSE_AMENDMENT'; title: string; emergency?: boolean }
  | { type: 'RESOLVE_AMENDMENT'; amendmentId: number; outcome: 'pass' | 'fail' }
  // Senate actions
  | { type: 'SENATE_APPROVE_BILL'; billId: number }
  | { type: 'SENATE_OBJECT_BILL'; billId: number }
  | { type: 'SENATE_START_FORMATION' }
  // Majlis actions
  | { type: 'MAJLIS_OVERRIDE_SENATE'; billId: number }
  // Crown actions
  | { type: 'APPOINT_CROWN_SENATOR' }
  // Disaster
  | { type: 'TRIGGER_DISASTER'; disasterId: DisasterId; provinceId?: ProvinceId }
  // Crown
  | { type: 'SUSPEND_CROWN' }
  // Tour helpers
  | { type: 'ADVANCE_BILL_TO_STAGE'; billId: number; stage: BillStage }
  | { type: 'TOUR_RESIGN_PM' }
  | { type: 'TOUR_RETIRE_JUSTICE' }
  | { type: 'TOUR_CROWN_NOMINATE_PM'; attempt: 1 | 2 }
  | { type: 'TOUR_PM_SEATED' }
  | { type: 'TOUR_CONFIDENCE_FAIL' }
  | { type: 'TOUR_SET_FORMATION'; stage: FormationStage }
  | { type: 'TOUR_CONFIRM_JUSTICE'; seatNumber: number }
  | { type: 'TOUR_REJECT_JUSTICE'; seatNumber: number }
  | { type: 'TOUR_ADVANCE_NOMINATION'; seatNumber: number }
  | { type: 'TOUR_NO_CONFIDENCE_PASSES' }
  | { type: 'TOUR_NO_CONFIDENCE_FAILS' }
  | { type: 'TOUR_SET_AMENDMENT_PHASE'; amendmentId: number; phase: AmendmentPhase; parlYes?: number; refYes?: number; refNo?: number }
  | { type: 'TOUR_SET_ELECTION_PHASE'; electionId: number; phase: ElectionPhase }
  | { type: 'TOUR_START_PROVINCIAL_ELECTIONS' }
  | { type: 'TOUR_SET_ALL_ELECTIONS_PHASE'; phase: ElectionPhase }
  | { type: 'TOUR_COMPLETE_BY_ELECTIONS' }
  | { type: 'TOUR_SEAT_ALL_APPOINTMENTS' }
  | { type: 'TOUR_CONFIRM_HALF_APPOINTMENTS' }
  | { type: 'TOUR_RESTORE_PROVINCE'; provinceId: ProvinceId }
  // Player
  | { type: 'ISSUE_PASSPORT'; firstName: string; lastName: string; provinceId: ProvinceId }
  | { type: 'CAST_VOTE'; electionId: number; party: PartyId }
  | { type: 'START_PLAYER_ELECTION' }
  // God Mode v2: manual resolve for every non-terminal stage
  | { type: 'RESOLVE_MAJLIS_VOTE'; billId: number; outcome: 'pass' | 'fail' }
  | { type: 'RESOLVE_RETURNED_BILL'; billId: number; outcome: 'readopt' | 'drop' }
  | { type: 'ADVANCE_ELECTION'; electionId: number }
  | { type: 'FORMATION_PRESENT_LIST' }
  | { type: 'FORMATION_PICK_FROM_LIST' }
  | { type: 'ADVANCE_AMENDMENT_TO_VOTE'; amendmentId: number }
  // Budget actions
  | { type: 'PROPOSE_BUDGET'; totalAmount: number }
  | { type: 'APPROVE_BUDGET' }
  | { type: 'REJECT_BUDGET' }
  | { type: 'ACTIVATE_BUDGET' }
  | { type: 'ALLOCATE_FUNDS'; amount: number }
  | { type: 'CONTINUE_PRIOR_BUDGET' }
  | { type: 'APPROVE_SUPPLEMENTARY'; amount: number }
  | { type: 'SUBMIT_AUDIT_REPORT'; clean: boolean }
  | { type: 'APPOINT_AUDIT_HEAD' }
  // Crown actions
  | { type: 'ABDICATE' }
  | { type: 'RESUME_CROWN' }
  | { type: 'UPDATE_SUCCESSION'; heirIds: PersonId[] }
  // Executive actions
  | { type: 'DESIGNATE_DEPUTY_PM'; personId: PersonId }
  // Court actions
  | { type: 'FILE_CONSTITUTIONAL_REVIEW'; petitioner: string; lawDescription: string }
  | { type: 'RESOLVE_REVIEW'; reviewId: number; outcome: 'constitutional' | 'unconstitutional' }
  | { type: 'FILE_DISPUTE'; petitioner: string; respondent: string; description: string }
  | { type: 'RESOLVE_DISPUTE'; disputeId: number; outcome: 'petitioner' | 'respondent' }
  | { type: 'CREATE_PETITION'; title: string }
  | { type: 'SIGN_PETITION'; petitionId: number }
  // Parliament
  | { type: 'PROPOSE_EMERGENCY_AMENDMENT'; title: string }
  // Genesis
  | { type: 'RESET_TO_GENESIS' }
  | { type: 'GENESIS_ADVANCE'; stage: number };
