/**
 * Election RPC tests — TypeScript port of Election.t.sol
 *
 * Five test contracts:
 * 1. Construction — election start, modifiers, boundary checks
 * 2. Registration — candidate registration, open voting
 * 3. Voting — cast ballot, nullifiers, reverts
 * 4. Tallied — tally results, seat members, timeouts
 * 5. Provincial — province enforcement for registration and voting
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { type Address, keccak256, toHex, encodePacked } from 'viem';
import { setupGovBase, writeAs, contractAs, walletForAddress, type GovTestEnv } from '../setup/fixtures.js';
import { setupMajlis, executeMajlisAction, prepareMajlisAction } from '../setup/mixins.js';
import { makeAddr, expectRevert } from '../setup/testUtils.js';
import { identityHash, mockBallotProof, castBallot } from '../setup/proofHelper.js';
import { asAccount, warpForward, warpTo, DAYS } from '../../src/client/AnvilHelpers.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Shared election test setup
// ═══════════════════════════════════════════════════════════════════════════════

interface ElectionTestEnv extends GovTestEnv {
  eC1: Address;
  eC2: Address;
  eC3: Address;
  eC4: Address;
  eC5: Address;
  PARAM_REG_PERIOD: `0x${string}`;
  PARAM_VOTE_PERIOD: `0x${string}`;
}

async function setupElectionBase(): Promise<ElectionTestEnv> {
  const base = await setupGovBase();
  await setupMajlis(base);

  const PARAM_REG_PERIOD = (await base.contracts.constitution.read('PARAM_ELECTION_REG_PERIOD')) as `0x${string}`;
  const PARAM_VOTE_PERIOD = (await base.contracts.constitution.read('PARAM_ELECTION_VOTE_PERIOD')) as `0x${string}`;

  // Register 5 fresh citizens in province 2
  const eC1 = makeAddr('eC1');
  const eC2 = makeAddr('eC2');
  const eC3 = makeAddr('eC3');
  const eC4 = makeAddr('eC4');
  const eC5 = makeAddr('eC5');

  const authWallet = walletForAddress(base.actors.authorityKey);
  const authRegistry = contractAs(base.contracts.registry, base.publicClient, authWallet);

  for (const [citizen, name] of [[eC1, 'eC1'], [eC2, 'eC2'], [eC3, 'eC3'], [eC4, 'eC4'], [eC5, 'eC5']] as const) {
    await asAccount(base.testClient, base.actors.authorityKey, async () => {
      await authRegistry.write('registerCitizen', [citizen, keccak256(toHex(`${name}-id`)), 2], base.actors.authorityKey);
    });
  }

  return { ...base, eC1, eC2, eC3, eC4, eC5, PARAM_REG_PERIOD, PARAM_VOTE_PERIOD };
}

// Helpers
async function startMajlisElection(env: ElectionTestEnv): Promise<bigint> {
  const startData = env.contracts.election.encode('startMajlisElection', [2]);
  await executeMajlisAction(env, env.addresses.election, startData);
  return ((await env.contracts.election.read('electionCount')) as bigint) - 1n;
}

async function registerCandidates(env: ElectionTestEnv, electionId: bigint): Promise<void> {
  await writeAs(env.contracts.election, env.publicClient, env.eC1, env.testClient,
    'registerCandidate', [electionId, keccak256(toHex('Party A'))]);
  await writeAs(env.contracts.election, env.publicClient, env.eC2, env.testClient,
    'registerCandidate', [electionId, keccak256(toHex('Party B'))]);
  await writeAs(env.contracts.election, env.publicClient, env.eC3, env.testClient,
    'registerCandidate', [electionId, keccak256(toHex('Party C'))]);
}

async function advanceToVoting(env: ElectionTestEnv, electionId: bigint): Promise<void> {
  const regPeriod = (await env.contracts.constitution.read('getParameter', [env.PARAM_REG_PERIOD])) as bigint;
  await warpForward(env.testClient, regPeriod);
  env.currentTime += regPeriod;
  await env.contracts.election.write('openVoting', [electionId]);
}

async function runFullElection(env: ElectionTestEnv): Promise<bigint> {
  const electionId = await startMajlisElection(env);
  await registerCandidates(env, electionId);
  await advanceToVoting(env, electionId);

  // Vote: eC1→0, eC2→0, eC3→1, eC4→2, eC5→0
  await castBallot(env, env.eC1, electionId, 0n, 2);
  await castBallot(env, env.eC2, electionId, 0n, 2);
  await castBallot(env, env.eC3, electionId, 1n, 2);
  await castBallot(env, env.eC4, electionId, 2n, 2);
  await castBallot(env, env.eC5, electionId, 0n, 2);

  const votePeriod = (await env.contracts.constitution.read('getParameter', [env.PARAM_VOTE_PERIOD])) as bigint;
  await warpForward(env.testClient, votePeriod);
  env.currentTime += votePeriod;

  await env.contracts.election.write('tallyVotes', [electionId]);
  return electionId;
}

async function seatMembers(env: ElectionTestEnv, electionId: bigint): Promise<void> {
  const seatData = env.contracts.election.encode('seatMembers', [electionId]);
  await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
    'executeMinisterialAct', [env.addresses.election, seatData]);
}

async function startProvincialElection(env: ElectionTestEnv, provinceId: number): Promise<bigint> {
  const startData = env.contracts.election.encode('startProvincialElection', [provinceId]);
  await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
    'executeMinisterialAct', [env.addresses.election, startData]);
  return ((await env.contracts.election.read('electionCount')) as bigint) - 1n;
}

async function reassignProvince(env: ElectionTestEnv, citizen: Address, province: number): Promise<void> {
  await asAccount(env.testClient, env.actors.authorityKey, async () => {
    const c = contractAs(env.contracts.registry, env.publicClient, walletForAddress(env.actors.authorityKey));
    await c.write('assignProvince', [citizen, province], env.actors.authorityKey);
  });
}

const unauthorized = makeAddr('unauthorized');
const nonCitizen = makeAddr('nonCitizen');

// ═══════════════════════════════════════════════════════════════════════════════
// 1. CONSTRUCTION & ELECTION START
// ═══════════════════════════════════════════════════════════════════════════════

describe('Election: Construction & Start', () => {
  let env: ElectionTestEnv;
  let snapshot: `0x${string}`;

  beforeAll(async () => {
    env = await setupElectionBase();
    snapshot = await env.testClient.snapshot();
  }, 60_000);

  beforeEach(async () => {
    await env.testClient.revert({ id: snapshot });
    snapshot = await env.testClient.snapshot();
  });

  it('constructor: sets constitution', async () => {
    const addr = (await env.contracts.election.read('constitution')) as string;
    expect(addr.toLowerCase()).toBe(env.addresses.constitution.toLowerCase());
    const count = (await env.contracts.election.read('electionCount')) as bigint;
    expect(Number(count)).toBeGreaterThan(0); // setupMajlis ran one
  });

  // ── Start Majlis Election ──────────────────────────────────────────

  it('startMajlisElection: happy case', async () => {
    const countBefore = (await env.contracts.election.read('electionCount')) as bigint;
    const id = await startMajlisElection(env);
    expect(id).toBe(countBefore);
    expect(await env.contracts.election.read('electionCount')).toBe(countBefore + 1n);
    const phase = await env.contracts.election.read('getElectionPhase', [id]);
    expect(Number(phase)).toBe(0); // Registration
    const [eType, , provId] = (await env.contracts.election.read('getElection', [id])) as [number, any, number, any];
    expect(Number(eType)).toBe(0); // Majlis
    expect(provId).toBe(2);
  });

  it('startMajlisElection: timing', async () => {
    const id = await startMajlisElection(env);
    const regPeriod = (await env.contracts.constitution.read('getParameter', [env.PARAM_REG_PERIOD])) as bigint;
    const votePeriod = (await env.contracts.constitution.read('getParameter', [env.PARAM_VOTE_PERIOD])) as bigint;

    const [regStart, regEnd, voteStart, voteEnd] = (await env.contracts.election.read('getElectionTiming', [id])) as bigint[];
    expect(regEnd - regStart).toBe(regPeriod);
    expect(voteStart).toBe(regEnd);
    expect(voteEnd - voteStart).toBe(votePeriod);
  });

  it('startMajlisElection: counts (0 candidates, 0 votes)', async () => {
    const id = await startMajlisElection(env);
    const [candidateCount, totalVotes] = (await env.contracts.election.read('getElectionCounts', [id])) as bigint[];
    expect(candidateCount).toBe(0n);
    expect(totalVotes).toBe(0n);
  });

  // ── Start Senate Election ──────────────────────────────────────────

  it('startSenateElection: happy case', async () => {
    const countBefore = (await env.contracts.election.read('electionCount')) as bigint;
    const startData = env.contracts.election.encode('startElection', [1]); // 1 = Senate
    await executeMajlisAction(env, env.addresses.election, startData);
    const id = ((await env.contracts.election.read('electionCount')) as bigint) - 1n;
    expect(id).toBe(countBefore);
    const [eType] = (await env.contracts.election.read('getElection', [id])) as [number];
    expect(Number(eType)).toBe(1); // Senate
  });

  // ── Start Provincial Election ──────────────────────────────────────

  it('startProvincialElection: happy case', async () => {
    const countBefore = (await env.contracts.election.read('electionCount')) as bigint;
    const id = await startProvincialElection(env, 1);
    expect(id).toBe(countBefore);
    const [eType, , provId] = (await env.contracts.election.read('getElection', [id])) as [number, any, number];
    expect(Number(eType)).toBe(2); // ProvincialCouncil
    expect(provId).toBe(1);
  });

  // ── Start Election Reverts ─────────────────────────────────────────

  it('revert: startElection rejects Majlis type (ExecutionFailed)', async () => {
    const data = env.contracts.election.encode('startElection', [0]); // 0 = Majlis
    const actionId = await prepareMajlisAction(env, env.addresses.election, data);
    await expectRevert(env.contracts.parliament.write('executeGovernanceAction', [actionId]), 'ExecutionFailed');
  });

  it('revert: startMajlisElection invalidProvince 0 (ExecutionFailed)', async () => {
    const data = env.contracts.election.encode('startMajlisElection', [0]);
    const actionId = await prepareMajlisAction(env, env.addresses.election, data);
    await expectRevert(env.contracts.parliament.write('executeGovernanceAction', [actionId]), 'ExecutionFailed');
  });

  it('revert: startMajlisElection invalidProvince 32 (ExecutionFailed)', async () => {
    const data = env.contracts.election.encode('startMajlisElection', [32]);
    const actionId = await prepareMajlisAction(env, env.addresses.election, data);
    await expectRevert(env.contracts.parliament.write('executeGovernanceAction', [actionId]), 'ExecutionFailed');
  });

  it('revert: startProvincialElection invalidProvince 0 (ExecutionFailed)', async () => {
    const data = env.contracts.election.encode('startProvincialElection', [0]);
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'executeMinisterialAct', [env.addresses.election, data]),
      'ExecutionFailed',
    );
  });

  it('revert: startProvincialElection invalidProvince 32 (ExecutionFailed)', async () => {
    const data = env.contracts.election.encode('startProvincialElection', [32]);
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'executeMinisterialAct', [env.addresses.election, data]),
      'ExecutionFailed',
    );
  });

  // ── Modifier Tests ─────────────────────────────────────────────────

  it('modifier: startElection onlyParliament', async () => {
    await expectRevert(
      writeAs(env.contracts.election, env.publicClient, unauthorized, env.testClient,
        'startElection', [1]),
      'NotAuthorized',
    );
  });

  it('modifier: startElection rejectsCrown', async () => {
    await asAccount(env.testClient, env.addresses.crown, async () => {
      const c = contractAs(env.contracts.election, env.publicClient, walletForAddress(env.addresses.crown));
      await expectRevert(c.write('startElection', [1], env.addresses.crown), 'NotAuthorized');
    });
  });

  it('modifier: startMajlisElection onlyParliament', async () => {
    await expectRevert(
      writeAs(env.contracts.election, env.publicClient, unauthorized, env.testClient,
        'startMajlisElection', [1]),
      'NotAuthorized',
    );
  });

  it('modifier: startProvincialElection onlyCrown', async () => {
    await expectRevert(
      writeAs(env.contracts.election, env.publicClient, unauthorized, env.testClient,
        'startProvincialElection', [1]),
      'NotAuthorized',
    );
  });

  it('modifier: startProvincialElection rejectsParliament', async () => {
    await asAccount(env.testClient, env.addresses.parliament, async () => {
      const c = contractAs(env.contracts.election, env.publicClient, walletForAddress(env.addresses.parliament));
      await expectRevert(c.write('startProvincialElection', [1], env.addresses.parliament), 'NotAuthorized');
    });
  });

  // ── Boundary: Invalid Election IDs ─────────────────────────────────

  it('boundary: getCandidateVotes invalidElection', async () => {
    await expectRevert(env.contracts.election.read('getCandidateVotes', [999n, 0n]), 'InvalidElection');
  });

  it('boundary: getElectionPhase invalidElection', async () => {
    await expectRevert(env.contracts.election.read('getElectionPhase', [999n]), 'InvalidElection');
  });

  it('boundary: getElection invalidElection', async () => {
    await expectRevert(env.contracts.election.read('getElection', [999n]), 'InvalidElection');
  });

  it('boundary: getElectionTiming invalidElection', async () => {
    await expectRevert(env.contracts.election.read('getElectionTiming', [999n]), 'InvalidElection');
  });

  it('boundary: getElectionCounts invalidElection', async () => {
    await expectRevert(env.contracts.election.read('getElectionCounts', [999n]), 'InvalidElection');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. REGISTRATION PHASE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Election: Registration', () => {
  let env: ElectionTestEnv;
  let electionId: bigint;
  let snapshot: `0x${string}`;

  beforeAll(async () => {
    env = await setupElectionBase();
    electionId = await startMajlisElection(env);
    snapshot = await env.testClient.snapshot();
  }, 60_000);

  beforeEach(async () => {
    await env.testClient.revert({ id: snapshot });
    snapshot = await env.testClient.snapshot();
  });

  it('registerCandidate: happy case', async () => {
    await writeAs(env.contracts.election, env.publicClient, env.eC1, env.testClient,
      'registerCandidate', [electionId, keccak256(toHex('Party A'))]);
    expect(await env.contracts.election.read('isCandidate', [electionId, env.eC1])).toBe(true);
    expect(((await env.contracts.election.read('getCandidateAddr', [electionId, 0n])) as string).toLowerCase())
      .toBe(env.eC1.toLowerCase());
  });

  it('registerMultipleCandidates', async () => {
    await registerCandidates(env, electionId);
    const [candidateCount] = (await env.contracts.election.read('getElectionCounts', [electionId])) as bigint[];
    expect(candidateCount).toBe(3n);
  });

  it('revert: registerCandidate notCitizen', async () => {
    await expectRevert(
      writeAs(env.contracts.election, env.publicClient, nonCitizen, env.testClient,
        'registerCandidate', [electionId, keccak256(toHex('Party X'))]),
      'NotCitizen',
    );
  });

  it('revert: registerCandidate alreadyRegistered', async () => {
    await writeAs(env.contracts.election, env.publicClient, env.eC1, env.testClient,
      'registerCandidate', [electionId, keccak256(toHex('Party A'))]);
    await expectRevert(
      writeAs(env.contracts.election, env.publicClient, env.eC1, env.testClient,
        'registerCandidate', [electionId, keccak256(toHex('Party A'))]),
      'AlreadyRegistered',
    );
  });

  it('revert: registerCandidate afterRegistrationEnds', async () => {
    const regPeriod = (await env.contracts.constitution.read('getParameter', [env.PARAM_REG_PERIOD])) as bigint;
    await warpForward(env.testClient, regPeriod + 1n);
    await expectRevert(
      writeAs(env.contracts.election, env.publicClient, env.eC1, env.testClient,
        'registerCandidate', [electionId, keccak256(toHex('Party A'))]),
      'RegistrationPeriodEnded',
    );
  });

  it('revert: registerCandidate invalidElection', async () => {
    await expectRevert(
      writeAs(env.contracts.election, env.publicClient, env.eC1, env.testClient,
        'registerCandidate', [999n, keccak256(toHex('Party A'))]),
      'InvalidElection',
    );
  });

  it('boundary: getCandidateAddr invalidCandidate', async () => {
    await expectRevert(env.contracts.election.read('getCandidateAddr', [electionId, 0n]), 'InvalidCandidate');
  });

  // ── Open Voting ────────────────────────────────────────────────────

  it('openVoting: happy case', async () => {
    await registerCandidates(env, electionId);
    const regPeriod = (await env.contracts.constitution.read('getParameter', [env.PARAM_REG_PERIOD])) as bigint;
    await warpForward(env.testClient, regPeriod);
    await env.contracts.election.write('openVoting', [electionId]);
    const phase = await env.contracts.election.read('getElectionPhase', [electionId]);
    expect(Number(phase)).toBe(1); // Voting
  });

  it('revert: openVoting tooEarly', async () => {
    await registerCandidates(env, electionId);
    await expectRevert(env.contracts.election.write('openVoting', [electionId]), 'RegistrationNotEnded');
  });

  it('revert: openVoting noCandidates', async () => {
    const regPeriod = (await env.contracts.constitution.read('getParameter', [env.PARAM_REG_PERIOD])) as bigint;
    await warpForward(env.testClient, regPeriod);
    await expectRevert(env.contracts.election.write('openVoting', [electionId]), 'NoCandidates');
  });

  it('revert: openVoting invalidElection', async () => {
    await expectRevert(env.contracts.election.write('openVoting', [999n]), 'InvalidElection');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. VOTING PHASE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Election: Voting', () => {
  let env: ElectionTestEnv;
  let electionId: bigint;
  let snapshot: `0x${string}`;

  beforeAll(async () => {
    env = await setupElectionBase();
    electionId = await startMajlisElection(env);
    await registerCandidates(env, electionId);
    await advanceToVoting(env, electionId);
    snapshot = await env.testClient.snapshot();
  }, 60_000);

  beforeEach(async () => {
    await env.testClient.revert({ id: snapshot });
    snapshot = await env.testClient.snapshot();
  });

  it('castBallot: happy case', async () => {
    await castBallot(env, env.eC1, electionId, 0n, 2);
    const idHash = identityHash(env.eC1);
    const nullifier = BigInt(keccak256(encodePacked(['bytes32', 'uint256'], [idHash, electionId])));
    expect(await env.contracts.election.read('isNullifierUsed', [electionId, nullifier])).toBe(true);
    expect(await env.contracts.election.read('getCandidateVotes', [electionId, 0n])).toBe(1n);
  });

  it('multipleBallots: vote counts correct', async () => {
    await castBallot(env, env.eC1, electionId, 0n, 2);
    await castBallot(env, env.eC2, electionId, 0n, 2);
    await castBallot(env, env.eC3, electionId, 1n, 2);
    expect(await env.contracts.election.read('getCandidateVotes', [electionId, 0n])).toBe(2n);
    expect(await env.contracts.election.read('getCandidateVotes', [electionId, 1n])).toBe(1n);
    expect(await env.contracts.election.read('getCandidateVotes', [electionId, 2n])).toBe(0n);
  });

  it('revert: castBallot invalidProof wrongCitizenship', async () => {
    const idHash = identityHash(env.eC1);
    const { proof, pubSignals } = mockBallotProof(idHash, electionId, 0n, 2);
    pubSignals[6] = 0xDEADn;
    await expectRevert(
      env.contracts.election.write('castBallot', [electionId, 0n, proof, pubSignals]),
      'InvalidProof',
    );
  });

  it('revert: castBallot alreadyVoted', async () => {
    await castBallot(env, env.eC1, electionId, 0n, 2);
    const idHash = identityHash(env.eC1);
    const { proof, pubSignals } = mockBallotProof(idHash, electionId, 0n, 2);
    await expectRevert(
      env.contracts.election.write('castBallot', [electionId, 0n, proof, pubSignals]),
      'AlreadyVoted',
    );
  });

  it('revert: castBallot invalidCandidate', async () => {
    const idHash = identityHash(env.eC1);
    const { proof, pubSignals } = mockBallotProof(idHash, electionId, 99n, 2);
    await expectRevert(
      env.contracts.election.write('castBallot', [electionId, 99n, proof, pubSignals]),
      'InvalidCandidate',
    );
  });

  it('revert: castBallot votingEnded', async () => {
    const votePeriod = (await env.contracts.constitution.read('getParameter', [env.PARAM_VOTE_PERIOD])) as bigint;
    await warpForward(env.testClient, votePeriod + 1n);
    const idHash = identityHash(env.eC1);
    const { proof, pubSignals } = mockBallotProof(idHash, electionId, 0n, 2);
    await expectRevert(
      env.contracts.election.write('castBallot', [electionId, 0n, proof, pubSignals]),
      'VotingNotOpen',
    );
  });

  it('revert: castBallot wrongElectionBinding', async () => {
    const idHash = identityHash(env.eC1);
    const { proof, pubSignals } = mockBallotProof(idHash, 999n, 0n, 2);
    await expectRevert(
      env.contracts.election.write('castBallot', [electionId, 0n, proof, pubSignals]),
      'InvalidElectionBinding',
    );
  });

  it('revert: castBallot wrongCandidateBinding', async () => {
    const idHash = identityHash(env.eC1);
    const { proof, pubSignals } = mockBallotProof(idHash, electionId, 1n, 2);
    await expectRevert(
      env.contracts.election.write('castBallot', [electionId, 0n, proof, pubSignals]),
      'InvalidElectionBinding',
    );
  });

  it('revert: castBallot wrongCscaKeyHash', async () => {
    const idHash = identityHash(env.eC1);
    const { proof, pubSignals } = mockBallotProof(idHash, electionId, 0n, 2);
    pubSignals[12] = 0xBEEFn;
    await expectRevert(
      env.contracts.election.write('castBallot', [electionId, 0n, proof, pubSignals]),
      'InvalidProof',
    );
  });

  it('revert: castBallot futureCurrentDate', async () => {
    const idHash = identityHash(env.eC1);
    const { proof, pubSignals } = mockBallotProof(idHash, electionId, 0n, 2);
    pubSignals[13] = 20990101n;
    await expectRevert(
      env.contracts.election.write('castBallot', [electionId, 0n, proof, pubSignals]),
      'InvalidProof',
    );
  });

  it('revert: registerCandidate in Voting phase', async () => {
    await expectRevert(
      writeAs(env.contracts.election, env.publicClient, env.eC4, env.testClient,
        'registerCandidate', [electionId, keccak256(toHex('Party D'))]),
      'NotInPhase',
    );
  });

  it('nullifier: isNullifierUsed before and after', async () => {
    const idHash = identityHash(env.eC1);
    const nullifier = BigInt(keccak256(encodePacked(['bytes32', 'uint256'], [idHash, electionId])));
    expect(await env.contracts.election.read('isNullifierUsed', [electionId, nullifier])).toBe(false);
    await castBallot(env, env.eC1, electionId, 0n, 2);
    expect(await env.contracts.election.read('isNullifierUsed', [electionId, nullifier])).toBe(true);
  });

  it('differentElections: different nullifiers', async () => {
    const idHash = identityHash(env.eC1);
    const nullifier1 = BigInt(keccak256(encodePacked(['bytes32', 'uint256'], [idHash, electionId])));
    await castBallot(env, env.eC1, electionId, 0n, 2);
    expect(await env.contracts.election.read('isNullifierUsed', [electionId, nullifier1])).toBe(true);

    // Start a second election
    const startData = env.contracts.election.encode('startMajlisElection', [2]);
    await executeMajlisAction(env, env.addresses.election, startData);
    const id2 = ((await env.contracts.election.read('electionCount')) as bigint) - 1n;

    await writeAs(env.contracts.election, env.publicClient, env.eC1, env.testClient,
      'registerCandidate', [id2, keccak256(toHex('Party A'))]);
    await writeAs(env.contracts.election, env.publicClient, env.eC2, env.testClient,
      'registerCandidate', [id2, keccak256(toHex('Party B'))]);

    const regPeriod = (await env.contracts.constitution.read('getParameter', [env.PARAM_REG_PERIOD])) as bigint;
    await warpForward(env.testClient, regPeriod);
    await env.contracts.election.write('openVoting', [id2]);

    const nullifier2 = BigInt(keccak256(encodePacked(['bytes32', 'uint256'], [idHash, id2])));
    expect(nullifier1).not.toBe(nullifier2);

    await castBallot(env, env.eC1, id2, 0n, 2);
    expect(await env.contracts.election.read('isNullifierUsed', [id2, nullifier2])).toBe(true);
  });

  it('revert: tallyVotes votingNotEnded', async () => {
    await expectRevert(env.contracts.election.write('tallyVotes', [electionId]), 'VotingNotOpen');
  });

  it('revert: castBallot notInVotingPhase', async () => {
    // Start new election but don't advance to voting
    const newId = await startMajlisElection(env);
    await registerCandidates(env, newId);

    const idHash = identityHash(env.eC1);
    const { proof, pubSignals } = mockBallotProof(idHash, newId, 0n, 2);
    await expectRevert(
      env.contracts.election.write('castBallot', [newId, 0n, proof, pubSignals]),
      'NotInPhase',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. TALLIED PHASE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Election: Tallied', () => {
  let env: ElectionTestEnv;
  let electionId: bigint;
  let snapshot: `0x${string}`;

  beforeAll(async () => {
    env = await setupElectionBase();
    electionId = await runFullElection(env);
    snapshot = await env.testClient.snapshot();
  }, 60_000);

  beforeEach(async () => {
    await env.testClient.revert({ id: snapshot });
    snapshot = await env.testClient.snapshot();
  });

  it('tallyVotes: phase is Tallied', async () => {
    const phase = await env.contracts.election.read('getElectionPhase', [electionId]);
    expect(Number(phase)).toBe(2); // Tallied
  });

  it('tallyVotes: vote counts correct', async () => {
    expect(await env.contracts.election.read('getCandidateVotes', [electionId, 0n])).toBe(3n);
    expect(await env.contracts.election.read('getCandidateVotes', [electionId, 1n])).toBe(1n);
    expect(await env.contracts.election.read('getCandidateVotes', [electionId, 2n])).toBe(1n);
  });

  it('tallyVotes: total votes = 5', async () => {
    const [, totalVotes] = (await env.contracts.election.read('getElectionCounts', [electionId])) as bigint[];
    expect(totalVotes).toBe(5n);
  });

  it('revert: tallyVotes notInVotingPhase (already tallied)', async () => {
    await expectRevert(env.contracts.election.write('tallyVotes', [electionId]), 'NotInPhase');
  });

  it('revert: tallyVotes invalidElection', async () => {
    await expectRevert(env.contracts.election.write('tallyVotes', [999n]), 'InvalidElection');
  });

  // ── Seat Members ───────────────────────────────────────────────────

  it('seatMembers: happy case', async () => {
    await seatMembers(env, electionId);
    const phase = await env.contracts.election.read('getElectionPhase', [electionId]);
    expect(Number(phase)).toBe(3); // Seated
    expect(await env.contracts.parliament.read('isMajlisMember', [env.eC1])).toBe(true);
    expect(await env.contracts.parliament.read('isMajlisMember', [env.eC2])).toBe(true);
    expect(await env.contracts.parliament.read('isMajlisMember', [env.eC3])).toBe(true);
  });

  it('revert: seatMembers notTallied (ExecutionFailed)', async () => {
    const freshId = await startMajlisElection(env);
    await registerCandidates(env, freshId);
    await advanceToVoting(env, freshId);

    const seatData = env.contracts.election.encode('seatMembers', [freshId]);
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'executeMinisterialAct', [env.addresses.election, seatData]),
      'ExecutionFailed',
    );
  });

  it('revert: seatMembers alreadySeated (ExecutionFailed)', async () => {
    await seatMembers(env, electionId);
    const seatData = env.contracts.election.encode('seatMembers', [electionId]);
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'executeMinisterialAct', [env.addresses.election, seatData]),
      'ExecutionFailed',
    );
  });

  it('modifier: seatMembers onlyCrown', async () => {
    await expectRevert(
      writeAs(env.contracts.election, env.publicClient, unauthorized, env.testClient,
        'seatMembers', [electionId]),
      'NotAuthorized',
    );
  });

  it('modifier: seatMembers rejectsParliament', async () => {
    await asAccount(env.testClient, env.addresses.parliament, async () => {
      const c = contractAs(env.contracts.election, env.publicClient, walletForAddress(env.addresses.parliament));
      await expectRevert(c.write('seatMembers', [electionId], env.addresses.parliament), 'NotAuthorized');
    });
  });

  // ── Seat Timeout ───────────────────────────────────────────────────

  it('claimSeatTimeout: happy case', async () => {
    const seatDeadlineKey = await env.contracts.constitution.read('PARAM_CROWN_SEAT_DEADLINE');
    const seatDeadline = (await env.contracts.constitution.read('getParameter', [seatDeadlineKey])) as bigint;
    await warpForward(env.testClient, seatDeadline);

    await writeAs(env.contracts.election, env.publicClient, unauthorized, env.testClient,
      'claimSeatTimeout', [electionId]);
    const phase = await env.contracts.election.read('getElectionPhase', [electionId]);
    expect(Number(phase)).toBe(3); // Seated
    expect(await env.contracts.parliament.read('isMajlisMember', [env.eC1])).toBe(true);
  });

  it('revert: claimSeatTimeout tooEarly', async () => {
    await expectRevert(
      writeAs(env.contracts.election, env.publicClient, unauthorized, env.testClient,
        'claimSeatTimeout', [electionId]),
      'DeadlineNotReached',
    );
  });

  it('revert: claimSeatTimeout alreadySeated', async () => {
    await seatMembers(env, electionId);
    const seatDeadlineKey = await env.contracts.constitution.read('PARAM_CROWN_SEAT_DEADLINE');
    const seatDeadline = (await env.contracts.constitution.read('getParameter', [seatDeadlineKey])) as bigint;
    await warpForward(env.testClient, seatDeadline);
    await expectRevert(
      writeAs(env.contracts.election, env.publicClient, unauthorized, env.testClient,
        'claimSeatTimeout', [electionId]),
      'ElectionNotTallied',
    );
  });

  it('tallyVotes: zero votes succeeds', async () => {
    const freshId = await startMajlisElection(env);
    await registerCandidates(env, freshId);
    await advanceToVoting(env, freshId);
    const votePeriod = (await env.contracts.constitution.read('getParameter', [env.PARAM_VOTE_PERIOD])) as bigint;
    await warpForward(env.testClient, votePeriod);
    await env.contracts.election.write('tallyVotes', [freshId]);
    const phase = await env.contracts.election.read('getElectionPhase', [freshId]);
    expect(Number(phase)).toBe(2); // Tallied
    const [, totalVotes] = (await env.contracts.election.read('getElectionCounts', [freshId])) as bigint[];
    expect(totalVotes).toBe(0n);
  });

  it('seatDeadline: set on tally', async () => {
    const [, , , , seatDeadline] = (await env.contracts.election.read('getElectionTiming', [electionId])) as bigint[];
    expect(Number(seatDeadline)).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. PROVINCIAL ELECTIONS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Election: Provincial', () => {
  let env: ElectionTestEnv;
  let snapshot: `0x${string}`;

  beforeAll(async () => {
    env = await setupElectionBase();
    snapshot = await env.testClient.snapshot();
  }, 60_000);

  beforeEach(async () => {
    await env.testClient.revert({ id: snapshot });
    snapshot = await env.testClient.snapshot();
  });

  it('provincialElection: province enforcement for registration', async () => {
    await reassignProvince(env, env.eC1, 1);
    await reassignProvince(env, env.eC2, 1);
    await reassignProvince(env, env.eC3, 2);

    const id = await startProvincialElection(env, 1);

    // Province 1 citizen can register
    await writeAs(env.contracts.election, env.publicClient, env.eC1, env.testClient,
      'registerCandidate', [id, keccak256(toHex('Party A'))]);

    // Province 2 citizen cannot
    await expectRevert(
      writeAs(env.contracts.election, env.publicClient, env.eC3, env.testClient,
        'registerCandidate', [id, keccak256(toHex('Party B'))]),
      'WrongProvince',
    );
  });

  it('provincialElection: vote enforcement', async () => {
    await reassignProvince(env, env.eC1, 1);
    await reassignProvince(env, env.eC2, 1);
    await reassignProvince(env, env.eC3, 2);

    const id = await startProvincialElection(env, 1);
    await writeAs(env.contracts.election, env.publicClient, env.eC1, env.testClient,
      'registerCandidate', [id, keccak256(toHex('Party A'))]);

    const regPeriod = (await env.contracts.constitution.read('getParameter', [env.PARAM_REG_PERIOD])) as bigint;
    await warpForward(env.testClient, regPeriod);
    await env.contracts.election.write('openVoting', [id]);

    // Province 1 citizen can vote
    await castBallot(env, env.eC2, id, 0n, 1);

    // Province 2 citizen cannot
    const idHash = identityHash(env.eC3);
    const { proof, pubSignals } = mockBallotProof(idHash, id, 0n, 2);
    await expectRevert(
      env.contracts.election.write('castBallot', [id, 0n, proof, pubSignals]),
      'WrongProvince',
    );
  });

  it('provincialElection: seat to ProvincialCouncil, not Parliament', async () => {
    await reassignProvince(env, env.eC1, 1);
    await reassignProvince(env, env.eC2, 1);
    await reassignProvince(env, env.eC4, 1);
    await reassignProvince(env, env.eC5, 1);

    const id = await startProvincialElection(env, 1);
    await writeAs(env.contracts.election, env.publicClient, env.eC1, env.testClient,
      'registerCandidate', [id, keccak256(toHex('Party A'))]);

    const regPeriod = (await env.contracts.constitution.read('getParameter', [env.PARAM_REG_PERIOD])) as bigint;
    await warpForward(env.testClient, regPeriod);
    await env.contracts.election.write('openVoting', [id]);

    await castBallot(env, env.eC2, id, 0n, 1);
    await castBallot(env, env.eC4, id, 0n, 1);

    const votePeriod = (await env.contracts.constitution.read('getParameter', [env.PARAM_VOTE_PERIOD])) as bigint;
    await warpForward(env.testClient, votePeriod);
    await env.contracts.election.write('tallyVotes', [id]);
    await seatMembers(env, id);

    expect(await env.contracts.pc.read('isCouncilMember', [1, env.eC1])).toBe(true);
    expect(await env.contracts.parliament.read('isMajlisMember', [env.eC1])).toBe(false);
  });

  // ── Province-scoped Majlis Elections ────────────────────────────────

  it('majlisElection: province enforcement for registration', async () => {
    await reassignProvince(env, env.eC1, 1);
    await reassignProvince(env, env.eC2, 1);
    await reassignProvince(env, env.eC3, 2);

    const startData = env.contracts.election.encode('startMajlisElection', [1]);
    await executeMajlisAction(env, env.addresses.election, startData);
    const id = ((await env.contracts.election.read('electionCount')) as bigint) - 1n;

    await writeAs(env.contracts.election, env.publicClient, env.eC1, env.testClient,
      'registerCandidate', [id, keccak256(toHex('Party A'))]);

    await expectRevert(
      writeAs(env.contracts.election, env.publicClient, env.eC3, env.testClient,
        'registerCandidate', [id, keccak256(toHex('Party B'))]),
      'WrongProvince',
    );
  });

  it('majlisElection: vote enforcement', async () => {
    await reassignProvince(env, env.eC1, 1);
    await reassignProvince(env, env.eC2, 1);
    await reassignProvince(env, env.eC3, 2);

    const startData = env.contracts.election.encode('startMajlisElection', [1]);
    await executeMajlisAction(env, env.addresses.election, startData);
    const id = ((await env.contracts.election.read('electionCount')) as bigint) - 1n;

    await writeAs(env.contracts.election, env.publicClient, env.eC1, env.testClient,
      'registerCandidate', [id, keccak256(toHex('Party A'))]);

    const regPeriod = (await env.contracts.constitution.read('getParameter', [env.PARAM_REG_PERIOD])) as bigint;
    await warpForward(env.testClient, regPeriod);
    await env.contracts.election.write('openVoting', [id]);

    await castBallot(env, env.eC2, id, 0n, 1);

    const idHash = identityHash(env.eC3);
    const { proof, pubSignals } = mockBallotProof(idHash, id, 0n, 2);
    await expectRevert(
      env.contracts.election.write('castBallot', [id, 0n, proof, pubSignals]),
      'WrongProvince',
    );
  });

  it('majlisElection: seats with province tracking', async () => {
    await reassignProvince(env, env.eC1, 1);
    await reassignProvince(env, env.eC2, 1);
    await reassignProvince(env, env.eC4, 1);
    await reassignProvince(env, env.eC5, 1);

    const startData = env.contracts.election.encode('startMajlisElection', [1]);
    await executeMajlisAction(env, env.addresses.election, startData);
    const id = ((await env.contracts.election.read('electionCount')) as bigint) - 1n;

    await writeAs(env.contracts.election, env.publicClient, env.eC1, env.testClient,
      'registerCandidate', [id, keccak256(toHex('Party A'))]);

    const regPeriod = (await env.contracts.constitution.read('getParameter', [env.PARAM_REG_PERIOD])) as bigint;
    await warpForward(env.testClient, regPeriod);
    await env.contracts.election.write('openVoting', [id]);

    await castBallot(env, env.eC2, id, 0n, 1);
    await castBallot(env, env.eC4, id, 0n, 1);

    const votePeriod = (await env.contracts.constitution.read('getParameter', [env.PARAM_VOTE_PERIOD])) as bigint;
    await warpForward(env.testClient, votePeriod);
    await env.contracts.election.write('tallyVotes', [id]);
    await seatMembers(env, id);

    expect(await env.contracts.parliament.read('isMajlisMember', [env.eC1])).toBe(true);
    expect(Number(await env.contracts.parliament.read('majlisMemberProvince', [env.eC1]))).toBe(1);
  });
});
