/**
 * Shared types — single source of truth for the governance system.
 *
 * These mirror the Solidity enums and structs exactly. SimGov imports from here
 * instead of maintaining its own copies. Enum values match Solidity uint8 encoding.
 */

export type { Address } from 'viem';

// ═══════════════════════════════════════════════════════════════════════════════
// Parliament
// ═══════════════════════════════════════════════════════════════════════════════

export enum Chamber {
  Majlis = 0,
  Senate = 1,
}

export enum BillStatus {
  Introduced = 0,
  MajlisVoting = 1,
  SenateReview = 2,
  SenateObjected = 3,
  MajlisOverride = 4,
  CrownAction = 5,
  Enacted = 6,
  Returned = 7,
  Referred = 8,
  Vetoed = 9,
  Rejected = 10,
}

export enum ActionStatus {
  Voting = 0,
  Passed = 1,
  Failed = 2,
  Executed = 3,
}

export interface Bill {
  contentHash: `0x${string}`;
  description: string;
  sponsor: `0x${string}`;
  status: BillStatus;
  majlisYes: bigint;
  majlisNo: bigint;
  senateYes: bigint;
  senateNo: bigint;
  submittedAt: bigint;
  senateDeadline: bigint;
  votingStarted: bigint;
  voteRound: bigint;
  crownActionDeadline: bigint;
  isBudget: boolean;
  crownReturned: boolean;
}

export interface GovernanceAction {
  target: `0x${string}`;
  data: `0x${string}`;
  descriptionHash: `0x${string}`;
  chamber: Chamber;
  threshold: bigint;
  yesVotes: bigint;
  noVotes: bigint;
  votingStart: bigint;
  voteRound: bigint;
  status: ActionStatus;
  proposer: `0x${string}`;
}

export interface VacancyProposal {
  member: `0x${string}`;
  chamber: Chamber;
  yesVotes: bigint;
  noVotes: bigint;
  votingStart: bigint;
  voteRound: bigint;
  resolved: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Executive
// ═══════════════════════════════════════════════════════════════════════════════

export enum FormationStage {
  Idle = 0,
  CrownNom1 = 1,
  CrownNom2 = 2,
  MajlisList = 3,
  Dissolved = 4,
}

// ═══════════════════════════════════════════════════════════════════════════════
// Supreme Court
// ═══════════════════════════════════════════════════════════════════════════════

export enum ReviewStatus {
  Voting = 0,
  Constitutional = 1,
  Unconstitutional = 2,
  Executed = 3,
}

export enum DisputeStatus {
  Voting = 0,
  Resolved = 1,
}

export enum AppointmentStage {
  Idle = 0,
  CrownNom1 = 1,
  CrownNom2 = 2,
  SenateList = 3,
  CrownFromList = 4,
  Completed = 5,
}

export interface Justice {
  addr: `0x${string}`;
  termStart: bigint;
  termEnd: bigint;
  active: boolean;
}

export interface JusticeAppointment {
  seat: bigint;
  stage: AppointmentStage;
  nominee1: `0x${string}`;
  nominee2: `0x${string}`;
  senateList: readonly [`0x${string}`, `0x${string}`, `0x${string}`];
  stageDeadline: bigint;
}

export interface ConstitutionalReview {
  lawId: bigint;
  petitionHash: `0x${string}`;
  petitioner: `0x${string}`;
  status: ReviewStatus;
  yesConstitutional: bigint;
  noUnconstitutional: bigint;
  filedAt: bigint;
}

export interface Dispute {
  disputeHash: `0x${string}`;
  petitioner: `0x${string}`;
  status: DisputeStatus;
  rulingHash: `0x${string}`;
  yesVotes: bigint;
  noVotes: bigint;
  filedAt: bigint;
}

export interface CollectivePetition {
  lawId: bigint;
  petitionHash: `0x${string}`;
  chamber: Chamber;
  signatureCount: bigint;
  filed: boolean;
  reviewId: bigint;
  createdAt: bigint;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Election
// ═══════════════════════════════════════════════════════════════════════════════

export enum ElectionType {
  Majlis = 0,
  Senate = 1,
  ProvincialCouncil = 2,
}

export enum ElectionPhase {
  Registration = 0,
  Voting = 1,
  Tallied = 2,
  Seated = 3,
}

export interface ElectionData {
  electionType: ElectionType;
  phase: ElectionPhase;
  registrationStart: bigint;
  registrationEnd: bigint;
  votingStart: bigint;
  votingEnd: bigint;
  candidateCount: bigint;
  totalVotes: bigint;
  seated: boolean;
  provinceId: number;
  seatDeadline: bigint;
}

export interface Candidate {
  addr: `0x${string}`;
  partyHash: `0x${string}`;
  voteCount: bigint;
  registered: boolean;
}

export interface ProofPoints {
  a: readonly [bigint, bigint];
  b: readonly [readonly [bigint, bigint], readonly [bigint, bigint]];
  c: readonly [bigint, bigint];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Provincial Council
// ═══════════════════════════════════════════════════════════════════════════════

export interface Province {
  id: number;
  name: `0x${string}`;
  councilSize: bigint;
  senateSeatCount: bigint;
  majlisSeatCount: bigint;
  currentCouncilCount: bigint;
  staggerCohort: number;
  initialized: boolean;
}

export interface SenateSelection {
  provinceId: number;
  registrationStart: bigint;
  registrationEnd: bigint;
  votingStart: bigint;
  votingEnd: bigint;
  candidateCount: bigint;
  totalVotes: bigint;
  tallied: boolean;
  seated: boolean;
  seatDeadline: bigint;
}

export interface SenateCandidate {
  addr: `0x${string}`;
  voteCount: bigint;
}

export interface ProvinceInit {
  id: number;
  name: `0x${string}`;
  councilSize: bigint;
  senateSeatCount: bigint;
  majlisSeatCount: bigint;
  cohort: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Referendum
// ═══════════════════════════════════════════════════════════════════════════════

export enum AmendmentStatus {
  Proposed = 0,
  Voting = 1,
  Approved = 2,
  Enacted = 3,
  Rejected = 4,
  Expired = 5,
  Confirmed = 6,
  Superseded = 7,
}

export enum AmendmentType {
  Parameter = 0,
  Role = 1,
  Contract = 2,
}

export interface Amendment {
  amendmentHash: `0x${string}`;
  parameterKey: `0x${string}`;
  newValue: bigint;
  oldValue: bigint;
  targetAddress: `0x${string}`;
  amendType: AmendmentType;
  proposer: `0x${string}`;
  status: AmendmentStatus;
  yesVotes: bigint;
  noVotes: bigint;
  votingStart: bigint;
  votingEnd: bigint;
  emergency: boolean;
  enactedAt: bigint;
  expiresAt: bigint;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Budget
// ═══════════════════════════════════════════════════════════════════════════════

export enum BudgetStatus {
  Proposed = 0,
  Approved = 1,
  Active = 2,
  Rejected = 3,
  Superseded = 4,
}

export interface BudgetData {
  budgetHash: `0x${string}`;
  fiscalYear: bigint;
  totalAmount: bigint;
  allocatedAmount: bigint;
  proposer: `0x${string}`;
  status: BudgetStatus;
  proposedAt: bigint;
  approvedAt: bigint;
  isContinuation: boolean;
}

export interface AuditReport {
  reportHash: `0x${string}`;
  fiscalYear: bigint;
  auditor: `0x${string}`;
  submittedAt: bigint;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Role & Parameter Keys (matching Constitution.sol constants)
// ═══════════════════════════════════════════════════════════════════════════════

/** keccak256("ROLE_MONARCH") etc. — read at deploy time from Constitution contract */
export const ROLE_KEYS = [
  'ROLE_MONARCH',
  'ROLE_REGENT',
  'ROLE_PRIME_MINISTER',
  'ROLE_AUDIT_HEAD',
] as const;

export const CONTRACT_KEYS = [
  'CONTRACT_CITIZEN_REGISTRY',
  'CONTRACT_CROWN',
  'CONTRACT_PARLIAMENT',
  'CONTRACT_EXECUTIVE',
  'CONTRACT_SUPREME_COURT',
  'CONTRACT_ELECTION',
  'CONTRACT_REFERENDUM',
  'CONTRACT_BUDGET',
  'CONTRACT_PROVINCIAL_COUNCIL',
  'CONTRACT_BALLOT_VERIFIER',
] as const;

export const PARAM_KEYS = [
  'PARAM_MAJLIS_TERM',
  'PARAM_SENATE_TERM',
  'PARAM_JUSTICE_TERM',
  'PARAM_JUSTICE_COUNT',
  'PARAM_COURT_QUORUM',
  'PARAM_SENATE_CROWN_PCT',
  'PARAM_CROWN_LAW_DEADLINE',
  'PARAM_SENATE_REVIEW_PERIOD',
  'PARAM_CONFIDENCE_HONEYMOON',
  'PARAM_NOMINATION_DEADLINE',
  'PARAM_MAJLIS_LIST_DEADLINE',
  'PARAM_ELECTION_REG_PERIOD',
  'PARAM_ELECTION_VOTE_PERIOD',
  'PARAM_DISSOLUTION_ELECTION_DEADLINE',
  'PARAM_AMENDMENT_THRESHOLD',
  'PARAM_EMERGENCY_AMEND_THRESHOLD',
  'PARAM_EMERGENCY_AMEND_DURATION',
  'PARAM_CROWN_APPOINT_DEADLINE',
  'PARAM_CROWN_JUSTICE_APPOINT_DEADLINE',
  'PARAM_CONFIDENCE_VOTE_PERIOD',
  'PARAM_MAJLIS_QUORUM',
  'PARAM_SENATE_QUORUM',
  'PARAM_MIN_VOTING_PERIOD',
  'PARAM_PETITION_TIMEOUT',
  'PARAM_FACT_CERT_PERIOD',
  'PARAM_BY_ELECTION_DEADLINE',
  'PARAM_VACANCY_VOTE_PERIOD',
  'PARAM_COURT_LIVENESS_PERIOD',
  'PARAM_COURT_INACTIVITY_PERIOD',
  'PARAM_COUNCIL_TERM',
  'PARAM_SENATE_SELECTION_REG_PERIOD',
  'PARAM_SENATE_SELECTION_VOTE_PERIOD',
  'PARAM_SUCCESSION_REFERENDUM_DEADLINE',
  'PARAM_DEPUTY_DESIGNATION_DEADLINE',
  'PARAM_TOTAL_MAJLIS_SEATS',
  'PARAM_CROWN_SEAT_DEADLINE',
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// ZK Constants (matching ProofHelper.sol)
// ═══════════════════════════════════════════════════════════════════════════════

/** Mock CSCA key hash used in tests — must match CitizenRegistry.setCscaKey() */
export const MOCK_CSCA_KEY_HASH = 0xDEADn;

/** Mock currentDate in YYYYMMDD format */
export const MOCK_CURRENT_DATE = 20260217n;

/** Iran citizenship constant (pubSignals[6]) */
export const CITIZENSHIP_IRAN = 0x495241n;

/** Number of public signals in ZK ballot proofs */
export const PUB_SIGNALS_COUNT = 23;
