/**
 * Executive.t.sol → TypeScript port
 *
 * Four test suites matching the four Foundry test contracts:
 * 1. ExecutiveFormationTest (MixinMajlis) — formation cycle, confidence, list, dissolution
 * 2. ExecutiveGovernmentTest (MixinGovernment) — no-confidence, deputy PM, PM actions
 * 3. ExecutiveVacancyTest (MixinGovernment + MixinJustices) — PM vacancy via court cert
 * 4. ExecutiveSuspensionTest (MixinGovernment + MixinCrownSuspension) — Crown suspended
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import {
  type Address,
  keccak256,
  toHex,
  encodePacked,
  encodeFunctionData,
} from 'viem';
import {
  type GovTestEnv,
  setupGovBase,
  writeAs,
  contractAs,
  walletForAddress,
} from '../setup/fixtures.js';
import {
  setupMajlis,
  setupGovernment,
  setupSenate,
  setupJustices,
  setupCrownSuspension,
  executeMajlisAction,
  prepareMajlisAction,
  executeSenateAction,
  certifyFact,
  type SenateEnv,
  type JusticesEnv,
} from '../setup/mixins.js';
import { warpForward, warpTo, DAYS, asAccount } from '../../src/client/AnvilHelpers.js';
import { expectRevert } from '../setup/testUtils.js';
import { makeAddr } from '../setup/testUtils.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Shared helpers
// ═══════════════════════════════════════════════════════════════════════════════

const nominee1 = makeAddr('nominee1');
const nominee2 = makeAddr('nominee2');
const nominee3 = makeAddr('nominee3');
const unauthorized = makeAddr('unauthorized');

/** Register nominees as citizens in province 1 */
async function registerNominees(env: GovTestEnv, ...nominees: Address[]): Promise<void> {
  for (const addr of nominees) {
    const identityHash = keccak256(encodePacked(['string'], [addr]));
    await writeAs(env.contracts.registry, env.publicClient, env.actors.authorityKey, env.testClient,
      'registerCitizen', [addr, identityHash, 1]);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. ExecutiveFormationTest — MixinMajlis
// ═══════════════════════════════════════════════════════════════════════════════

describe('Executive: Formation (MixinMajlis)', () => {
  let env: GovTestEnv;
  let snapshotId: `0x${string}`;

  // Cached keys
  let ROLE_PM_KEY: `0x${string}`;

  // ── Helpers ──────────────────────────────────────────────────────────────

  async function startFormation(): Promise<void> {
    const data = env.contracts.executive.encode('startFormation', []);
    await executeMajlisAction(env, env.addresses.executive, data);
  }

  async function nominatePM(candidate: Address): Promise<void> {
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominatePrimeMinister', [candidate]);
  }

  async function startFormationAndNominate(candidate: Address): Promise<void> {
    await startFormation();
    await nominatePM(candidate);
    await writeAs(env.contracts.executive, env.publicClient, candidate, env.testClient,
      'presentGovernment', [keccak256(toHex('Government Program'))]);
  }

  async function grantConfidence(candidate: Address): Promise<void> {
    await startFormationAndNominate(candidate);
    for (const voter of [env.actors.citizen1, env.actors.citizen2, env.actors.citizen3]) {
      await writeAs(env.contracts.executive, env.publicClient, voter, env.testClient,
        'voteConfidence', [true]);
    }
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.executive.write('finalizeConfidenceVote', []);
  }

  async function failAllConfidence(): Promise<void> {
    const voters = [env.actors.citizen1, env.actors.citizen2, env.actors.citizen3,
      env.actors.citizen4, env.actors.citizen5];
    for (const voter of voters) {
      await writeAs(env.contracts.executive, env.publicClient, voter, env.testClient,
        'voteConfidence', [false]);
    }
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.executive.write('finalizeConfidenceVote', []);
  }

  async function reachMajlisListStage(): Promise<void> {
    await startFormationAndNominate(nominee1);
    await failAllConfidence();
    await nominatePM(nominee2);
    await writeAs(env.contracts.executive, env.publicClient, nominee2, env.testClient,
      'presentGovernment', [keccak256(toHex('Program 2'))]);
    await failAllConfidence();
  }

  async function submitMajlisList(candidates: [Address, Address, Address]): Promise<void> {
    const data = env.contracts.executive.encode('submitMajlisList', [candidates]);
    await executeMajlisAction(env, env.addresses.executive, data);
  }

  // ── Setup ────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    env = await setupGovBase();
    await setupMajlis(env);
    await registerNominees(env, nominee1, nominee2, nominee3);

    ROLE_PM_KEY = (await env.contracts.constitution.read('ROLE_PRIME_MINISTER')) as `0x${string}`;

    snapshotId = await env.testClient.snapshot();
  }, 120_000);

  beforeEach(async () => {
    await env.testClient.revert({ id: snapshotId });
    snapshotId = await env.testClient.snapshot();
  });

  // ── 1. CONSTRUCTION ──────────────────────────────────────────────────────

  it('constructor: correct initial state', async () => {
    const constitutionAddr = (await env.contracts.executive.read('constitution')) as string;
    expect(constitutionAddr.toLowerCase()).toBe(env.addresses.constitution.toLowerCase());
    expect(await env.contracts.executive.read('caretaker')).toBe(false);
    expect(await env.contracts.executive.read('stage')).toBe(0); // Idle
  });

  it('constructor: reverts with zero address', async () => {
    const { deployStandalone } = await import('../setup/testUtils.js');
    const { ExecutiveArtifact } = await import('../../src/abi/index.js');
    const { deployerWallet } = await import('../setup/testUtils.js');
    await expectRevert(
      deployStandalone(env.publicClient, deployerWallet(), ExecutiveArtifact, ['0x0000000000000000000000000000000000000000']),
      'ZeroAddress',
    );
  });

  // ── 2. FORMATION START ───────────────────────────────────────────────────

  it('startFormation: happy case', async () => {
    await startFormation();
    expect(await env.contracts.executive.read('stage')).toBe(1); // CrownNom1
    expect(await env.contracts.executive.read('caretaker')).toBe(true);
  });

  it('startFormation: onlyParliament modifier (unauthorized)', async () => {
    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, unauthorized, env.testClient,
        'startFormation', []),
      'NotAuthorized',
    );
  });

  it('startFormation: Crown cannot call directly', async () => {
    await expectRevert(
      asAccount(env.testClient, env.addresses.crown, async () => {
        const crownExec = contractAs(env.contracts.executive, env.publicClient, walletForAddress(env.addresses.crown));
        return crownExec.write('startFormation', [], env.addresses.crown);
      }),
      'NotAuthorized',
    );
  });

  // ── 3. CROWN NOMINATION + CONFIDENCE VOTE ────────────────────────────────

  it('nominateAndConfidence: PM confirmed, caretaker off', async () => {
    await grantConfidence(nominee1);
    expect(await env.contracts.constitution.read('getRole', [ROLE_PM_KEY])).toBe(nominee1);
    expect(await env.contracts.executive.read('caretaker')).toBe(false);
    expect(await env.contracts.executive.read('stage')).toBe(0); // Idle
  });

  it('voteConfidence: revert if no nominee', async () => {
    await startFormation();
    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, env.actors.citizen1, env.testClient,
        'voteConfidence', [true]),
      'NomineeNotSet',
    );
  });

  it('voteConfidence: revert if already voted', async () => {
    await startFormationAndNominate(nominee1);
    await writeAs(env.contracts.executive, env.publicClient, env.actors.citizen1, env.testClient,
      'voteConfidence', [true]);
    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, env.actors.citizen1, env.testClient,
        'voteConfidence', [true]),
      'AlreadyVoted',
    );
  });

  it('voteConfidence: onlyMajlis modifier', async () => {
    await startFormationAndNominate(nominee1);
    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, unauthorized, env.testClient,
        'voteConfidence', [true]),
      'NotMajlisMember',
    );
  });

  it('voteConfidence: revert if program not presented', async () => {
    await startFormation();
    await nominatePM(nominee1);
    // Try to vote without presenting program
    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, env.actors.citizen1, env.testClient,
        'voteConfidence', [true]),
      'ProgramNotPresented',
    );
  });

  it('presentGovernment: sets program hash', async () => {
    await startFormation();
    await nominatePM(nominee1);
    const hash = keccak256(toHex('My program'));
    await writeAs(env.contracts.executive, env.publicClient, nominee1, env.testClient,
      'presentGovernment', [hash]);
    expect(await env.contracts.executive.read('governmentProgram')).toBe(hash);
  });

  it('finalizeConfidence: revert if min period not elapsed', async () => {
    await startFormationAndNominate(nominee1);
    for (const v of [env.actors.citizen1, env.actors.citizen2, env.actors.citizen3]) {
      await writeAs(env.contracts.executive, env.publicClient, v, env.testClient,
        'voteConfidence', [true]);
    }
    await expectRevert(
      env.contracts.executive.write('finalizeConfidenceVote', []),
      'VotingPeriodNotElapsed',
    );
    // After min period it should succeed
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.executive.write('finalizeConfidenceVote', []);
    expect(await env.contracts.executive.read('stage')).toBe(0); // Idle
  });

  // ── 4. CONFIDENCE FAILURE -> STAGE PROGRESSION ───────────────────────────

  it('confidence failure: nom1 → nom2', async () => {
    await startFormationAndNominate(nominee1);
    await failAllConfidence();
    expect(await env.contracts.executive.read('stage')).toBe(2); // CrownNom2
  });

  it('confidence failure: nom2 → MajlisList', async () => {
    await reachMajlisListStage();
    expect(await env.contracts.executive.read('stage')).toBe(3); // MajlisList
  });

  // ── 5. MAJLIS LIST -> APPOINTMENT ────────────────────────────────────────

  it('appointFromList: Crown picks from list', async () => {
    await reachMajlisListStage();
    await submitMajlisList([nominee1, nominee2, nominee3]);
    // Crown appoints index 1
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'appointPMFromList', [1]);
    expect(await env.contracts.constitution.read('getRole', [ROLE_PM_KEY])).toBe(nominee2);
    expect(await env.contracts.executive.read('caretaker')).toBe(false);
  });

  it('autoAppointFromList: first-ranked auto-appointed', async () => {
    await reachMajlisListStage();
    await submitMajlisList([nominee1, nominee2, nominee3]);
    await warpForward(env.testClient, DAYS(7) + 1n);
    env.currentTime += DAYS(7) + 1n;
    await env.contracts.executive.write('autoAppointFromList', []);
    expect(await env.contracts.constitution.read('getRole', [ROLE_PM_KEY])).toBe(nominee1);
  });

  it('autoAppointFromList: revert if deadline not set', async () => {
    await reachMajlisListStage();
    // No list submitted, majlisListDeadline = 0
    await expectRevert(
      env.contracts.executive.write('autoAppointFromList', []),
      'DeadlineNotSet',
    );
  });

  it('appointFromList: revert with zero candidates', async () => {
    await reachMajlisListStage();
    // Don't submit list, Crown tries to appoint — candidates are all address(0)
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'appointPMFromList', [0]),
      'ZeroAddress',
    );
  });

  it('submitMajlisList: revert with zero address', async () => {
    await reachMajlisListStage();
    const data = env.contracts.executive.encode('submitMajlisList', [[nominee1, '0x0000000000000000000000000000000000000000', nominee3]]);
    const actionId = await prepareMajlisAction(env, env.addresses.executive, data);
    await expectRevert(
      env.contracts.parliament.write('executeGovernanceAction', [actionId]),
      'ExecutionFailed',
    );
  });

  it('submitMajlisList: revert with duplicate candidates', async () => {
    await reachMajlisListStage();
    const data = env.contracts.executive.encode('submitMajlisList', [[nominee1, nominee1, nominee3]]);
    const actionId = await prepareMajlisAction(env, env.addresses.executive, data);
    await expectRevert(
      env.contracts.parliament.write('executeGovernanceAction', [actionId]),
      'ExecutionFailed',
    );
  });

  // ── 6. DISSOLUTION ──────────────────────────────────────────────────────

  it('triggerDissolution: sets dissolved stage', async () => {
    await reachMajlisListStage();
    const data = env.contracts.executive.encode('triggerDissolution', []);
    await executeMajlisAction(env, env.addresses.executive, data);
    expect(await env.contracts.executive.read('stage')).toBe(4); // Dissolved
  });

  it('triggerDissolution: dissolves parliament', async () => {
    await reachMajlisListStage();
    const data = env.contracts.executive.encode('triggerDissolution', []);
    await executeMajlisAction(env, env.addresses.executive, data);
    expect(await env.contracts.parliament.read('dissolved')).toBe(true);
  });

  // ── 7. CARETAKER MODE ───────────────────────────────────────────────────

  it('caretaker: activated during formation', async () => {
    await startFormation();
    expect(await env.contracts.executive.read('isCaretaker')).toBe(true);
  });

  it('caretaker: deactivated after confidence', async () => {
    await grantConfidence(nominee1);
    expect(await env.contracts.executive.read('isCaretaker')).toBe(false);
  });

  // ── 8. NO-CONFIDENCE GUARDS ─────────────────────────────────────────────

  it('fileNoConfidence: revert if no PM', async () => {
    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, env.actors.citizen1, env.testClient,
        'fileNoConfidence', []),
      'PMNotActive',
    );
  });

  it('fileNoConfidence: revert during formation', async () => {
    await startFormation();
    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, env.actors.citizen1, env.testClient,
        'fileNoConfidence', []),
      'FormationInProgress',
    );
  });

  // ── 9. SELF-ENFORCING TERMS ─────────────────────────────────────────────

  it('expired Majlis member: cannot voteConfidence', async () => {
    await startFormationAndNominate(nominee1);
    const majlisTermKey = await env.contracts.constitution.read('PARAM_MAJLIS_TERM');
    const majlisTerm = (await env.contracts.constitution.read('getParameter', [majlisTermKey])) as bigint;
    await warpForward(env.testClient, majlisTerm + 1n);
    env.currentTime += majlisTerm + 1n;
    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, env.actors.citizen1, env.testClient,
        'voteConfidence', [true]),
      'NotMajlisMember',
    );
  });

  it('expired Majlis member: cannot fileNoConfidence', async () => {
    await grantConfidence(nominee1);
    const majlisTermKey = await env.contracts.constitution.read('PARAM_MAJLIS_TERM');
    const majlisTerm = (await env.contracts.constitution.read('getParameter', [majlisTermKey])) as bigint;
    await warpForward(env.testClient, majlisTerm + 1n);
    env.currentTime += majlisTerm + 1n;
    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, env.actors.citizen1, env.testClient,
        'fileNoConfidence', []),
      'NotMajlisMember',
    );
  });

  // ── 10. FORMATION RESET + ACTING PM ─────────────────────────────────────

  it('startFormation: resets deadlines', async () => {
    await reachMajlisListStage();
    await submitMajlisList([nominee1, nominee2, nominee3]);
    const deadline = await env.contracts.executive.read('majlisListDeadline');
    expect(deadline).not.toBe(0n);

    // Appoint from list to return to Idle
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'appointPMFromList', [0]);

    // Start new formation
    const data = env.contracts.executive.encode('startFormation', []);
    await executeMajlisAction(env, env.addresses.executive, data);
    expect(await env.contracts.executive.read('majlisListDeadline')).toBe(0n);
    expect(await env.contracts.executive.read('majlisSubmissionDeadline')).toBe(0n);
    expect(await env.contracts.executive.read('confidenceVoteDeadline')).toBe(0n);
    expect(await env.contracts.executive.read('noConfidenceDeadline')).toBe(0n);
  });

  it('designateActingPM: Crown designates during formation', async () => {
    await startFormation();
    const acting = makeAddr('actingPM');
    await registerNominees(env, acting);
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'designateActingPM', [acting]);
    expect(await env.contracts.constitution.read('getRole', [ROLE_PM_KEY])).toBe(acting);
    expect(await env.contracts.executive.read('caretaker')).toBe(true);
  });

  it('designateActingPM: revert when no formation', async () => {
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'designateActingPM', [makeAddr('acting')]),
      'revert',
    );
  });

  // ── 11. CROWN NOMINATION DEADLINES ──────────────────────────────────────

  it('startFormation: sets Crown nomination deadline', async () => {
    await startFormation();
    expect(await env.contracts.executive.read('stage')).toBe(1); // CrownNom1
    const deadline = (await env.contracts.executive.read('crownNominationDeadline')) as bigint;
    expect(deadline).toBeGreaterThan(0n);
  });

  it('claimCrownNominationTimeout: CrownNom1 → MajlisList', async () => {
    await startFormation();
    expect(await env.contracts.executive.read('stage')).toBe(1);
    await warpForward(env.testClient, DAYS(14) + 1n);
    env.currentTime += DAYS(14) + 1n;
    await env.contracts.executive.write('claimCrownNominationTimeout', []);
    expect(await env.contracts.executive.read('stage')).toBe(3); // MajlisList
    expect((await env.contracts.executive.read('majlisSubmissionDeadline')) as bigint).toBeGreaterThan(0n);
    expect(await env.contracts.executive.read('crownNominationDeadline')).toBe(0n);
  });

  it('claimCrownNominationTimeout: CrownNom2 → MajlisList', async () => {
    await startFormationAndNominate(nominee1);
    await failAllConfidence();
    expect(await env.contracts.executive.read('stage')).toBe(2); // CrownNom2
    await warpForward(env.testClient, DAYS(14) + 1n);
    env.currentTime += DAYS(14) + 1n;
    await env.contracts.executive.write('claimCrownNominationTimeout', []);
    expect(await env.contracts.executive.read('stage')).toBe(3); // MajlisList
  });

  it('claimCrownNominationTimeout: revert before deadline', async () => {
    await startFormation();
    await expectRevert(
      env.contracts.executive.write('claimCrownNominationTimeout', []),
      'DeadlineNotReached',
    );
  });

  it('claimCrownNominationTimeout: revert in wrong stage (Idle)', async () => {
    await expectRevert(
      env.contracts.executive.write('claimCrownNominationTimeout', []),
      'NotInStage',
    );
  });

  it('nominatePM: clears Crown deadline', async () => {
    await startFormation();
    expect((await env.contracts.executive.read('crownNominationDeadline')) as bigint).toBeGreaterThan(0n);
    await nominatePM(nominee1);
    expect(await env.contracts.executive.read('crownNominationDeadline')).toBe(0n);
  });

  // ── 12. DEPUTY DESIGNATION DEADLINES ────────────────────────────────────

  it('appointFromList: sets deputy deadline', async () => {
    await reachMajlisListStage();
    await submitMajlisList([nominee1, nominee2, nominee3]);
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'appointPMFromList', [1]);
    expect((await env.contracts.executive.read('deputyDesignationDeadline')) as bigint).toBeGreaterThan(0n);
  });

  it('autoAppointFromList: sets deputy deadline', async () => {
    await reachMajlisListStage();
    await submitMajlisList([nominee1, nominee2, nominee3]);
    await warpForward(env.testClient, DAYS(7) + 1n);
    env.currentTime += DAYS(7) + 1n;
    await env.contracts.executive.write('autoAppointFromList', []);
    expect((await env.contracts.executive.read('deputyDesignationDeadline')) as bigint).toBeGreaterThan(0n);
  });

  it('confidenceGranted: sets deputy deadline', async () => {
    await grantConfidence(nominee1);
    expect((await env.contracts.executive.read('deputyDesignationDeadline')) as bigint).toBeGreaterThan(0n);
  });

  // ── 14. PRESENT GOVERNMENT GUARDS ──────────────────────────────────────

  it('presentGovernment: revert if no nominee', async () => {
    await startFormation();
    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, nominee1, env.testClient,
        'presentGovernment', [keccak256(toHex('program'))]),
      'NomineeNotSet',
    );
  });

  it('presentGovernment: revert if not the nominee', async () => {
    await startFormation();
    await nominatePM(nominee1);
    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, nominee2, env.testClient,
        'presentGovernment', [keccak256(toHex('program'))]),
      'NotAuthorized',
    );
  });

  // ── 15. MAJLIS LIST SUBMISSION TIMEOUT ─────────────────────────────────

  it('claimMajlisListTimeout: dissolves parliament', async () => {
    await reachMajlisListStage();
    const deadline = (await env.contracts.executive.read('majlisSubmissionDeadline')) as bigint;
    expect(deadline).toBeGreaterThan(0n);
    await warpTo(env.testClient, deadline + 1n);
    env.currentTime = deadline + 1n;
    await env.contracts.executive.write('claimMajlisListTimeout', []);
    expect(await env.contracts.executive.read('stage')).toBe(4); // Dissolved
    expect(await env.contracts.parliament.read('dissolved')).toBe(true);
  });

  it('claimMajlisListTimeout: revert in wrong stage', async () => {
    await expectRevert(
      env.contracts.executive.write('claimMajlisListTimeout', []),
      'NotInStage',
    );
  });

  it('claimMajlisListTimeout: revert before deadline', async () => {
    await reachMajlisListStage();
    await expectRevert(
      env.contracts.executive.write('claimMajlisListTimeout', []),
      'DeadlineNotReached',
    );
  });

  // ── 16. APPOINT FROM LIST GUARDS ──────────────────────────────────────

  it('appointFromList: revert in wrong stage', async () => {
    await startFormation(); // CrownNom1, not MajlisList
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'appointPMFromList', [0]),
      'NotInStage',
    );
  });

  it('appointFromList: revert index out of bounds', async () => {
    await reachMajlisListStage();
    await submitMajlisList([nominee1, nominee2, nominee3]);
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'appointPMFromList', [3]),
      'IndexOutOfBounds',
    );
  });

  // ── 17. DESIGNATE ACTING PM GUARDS ─────────────────────────────────────

  it('designateActingPM: revert with zero address', async () => {
    await startFormation();
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'designateActingPM', ['0x0000000000000000000000000000000000000000']),
      'ZeroAddress',
    );
  });

  // ── 18. NOMINATION DURING WRONG STAGE ─────────────────────────────────

  it('nominatePM: revert in Idle stage', async () => {
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'nominatePrimeMinister', [nominee1]),
      'revert',
    );
  });

  it('nominatePM: revert in MajlisList stage', async () => {
    await reachMajlisListStage();
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'nominatePrimeMinister', [nominee1]),
      'revert',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. ExecutiveGovernmentTest — MixinGovernment
// ═══════════════════════════════════════════════════════════════════════════════

describe('Executive: Government (MixinGovernment)', () => {
  let env: GovTestEnv;
  let snapshotId: `0x${string}`;
  let ROLE_PM_KEY: `0x${string}`;

  beforeAll(async () => {
    env = await setupGovBase();
    await setupMajlis(env);
    await setupGovernment(env);

    ROLE_PM_KEY = (await env.contracts.constitution.read('ROLE_PRIME_MINISTER')) as `0x${string}`;

    snapshotId = await env.testClient.snapshot();
  }, 120_000);

  beforeEach(async () => {
    await env.testClient.revert({ id: snapshotId });
    snapshotId = await env.testClient.snapshot();
  });

  // ── 1. NO-CONFIDENCE ────────────────────────────────────────────────────

  it('noConfidence: after honeymoon, simple majority passes', async () => {
    const honeymoonKey = await env.contracts.constitution.read('PARAM_CONFIDENCE_HONEYMOON');
    const honeymoon = (await env.contracts.constitution.read('getParameter', [honeymoonKey])) as bigint;
    await warpForward(env.testClient, honeymoon + 1n);
    env.currentTime += honeymoon + 1n;

    await writeAs(env.contracts.executive, env.publicClient, env.actors.citizen1, env.testClient,
      'fileNoConfidence', []);

    for (const voter of [env.actors.citizen1, env.actors.citizen2, env.actors.citizen3]) {
      await writeAs(env.contracts.executive, env.publicClient, voter, env.testClient,
        'voteNoConfidence', [true]);
    }
    await env.contracts.executive.write('finalizeNoConfidence', []);

    expect(await env.contracts.constitution.read('getRole', [ROLE_PM_KEY])).toBe('0x0000000000000000000000000000000000000000');
    expect(await env.contracts.executive.read('caretaker')).toBe(true);
  });

  it('noConfidence: during honeymoon, needs 2/3 (4 of 5)', async () => {
    await warpForward(env.testClient, DAYS(30));
    env.currentTime += DAYS(30);

    await writeAs(env.contracts.executive, env.publicClient, env.actors.citizen1, env.testClient,
      'fileNoConfidence', []);

    // 3 yes, 2 no → not 2/3
    await writeAs(env.contracts.executive, env.publicClient, env.actors.citizen1, env.testClient,
      'voteNoConfidence', [true]);
    await writeAs(env.contracts.executive, env.publicClient, env.actors.citizen2, env.testClient,
      'voteNoConfidence', [true]);
    await writeAs(env.contracts.executive, env.publicClient, env.actors.citizen3, env.testClient,
      'voteNoConfidence', [true]);
    await writeAs(env.contracts.executive, env.publicClient, env.actors.citizen4, env.testClient,
      'voteNoConfidence', [false]);
    await writeAs(env.contracts.executive, env.publicClient, env.actors.citizen5, env.testClient,
      'voteNoConfidence', [false]);

    await env.contracts.executive.write('finalizeNoConfidence', []);

    // Motion failed — PM still in place
    expect(await env.contracts.constitution.read('getRole', [ROLE_PM_KEY])).toBe(env.actors.pmCandidate);
  });

  // ── 2. DEPUTY PM ────────────────────────────────────────────────────────

  it('designateDeputyPM: happy case', async () => {
    const deputy = makeAddr('deputy');
    await writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
      'designateDeputyPM', [deputy]);
    expect(await env.contracts.executive.read('deputyPM')).toBe(deputy);
  });

  it('designateDeputyPM: revert if not PM', async () => {
    const deputy = makeAddr('deputy');
    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, env.actors.citizen1, env.testClient,
        'designateDeputyPM', [deputy]),
      'NotPrimeMinister',
    );
  });

  it('designateDeputyPM: revert zero address', async () => {
    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
        'designateDeputyPM', ['0x0000000000000000000000000000000000000000']),
      'ZeroAddress',
    );
  });

  it('designateDeputyPM: clears deadline', async () => {
    expect((await env.contracts.executive.read('deputyDesignationDeadline')) as bigint).toBeGreaterThan(0n);
    const deputy = makeAddr('deputy');
    await writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
      'designateDeputyPM', [deputy]);
    expect(await env.contracts.executive.read('deputyDesignationDeadline')).toBe(0n);
    expect(await env.contracts.executive.read('deputyPM')).toBe(deputy);
  });

  it('isDeputyOverdue: false before deadline', async () => {
    expect(await env.contracts.executive.read('isDeputyOverdue')).toBe(false);
  });

  it('isDeputyOverdue: true after deadline', async () => {
    await warpForward(env.testClient, DAYS(14) + 1n);
    env.currentTime += DAYS(14) + 1n;
    expect(await env.contracts.executive.read('isDeputyOverdue')).toBe(true);
  });

  it('isDeputyOverdue: false after designation', async () => {
    await warpForward(env.testClient, DAYS(14) + 1n);
    env.currentTime += DAYS(14) + 1n;
    expect(await env.contracts.executive.read('isDeputyOverdue')).toBe(true);

    const deputy = makeAddr('deputy');
    await writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
      'designateDeputyPM', [deputy]);
    expect(await env.contracts.executive.read('isDeputyOverdue')).toBe(false);
  });

  it('startFormation: clears deputy deadline', async () => {
    expect((await env.contracts.executive.read('deputyDesignationDeadline')) as bigint).toBeGreaterThan(0n);
    const data = env.contracts.executive.encode('startFormation', []);
    await executeMajlisAction(env, env.addresses.executive, data);
    expect(await env.contracts.executive.read('deputyDesignationDeadline')).toBe(0n);
  });

  it('replaceDeputy: PM can replace deputy', async () => {
    const deputyA = makeAddr('deputyA');
    await writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
      'designateDeputyPM', [deputyA]);
    expect(await env.contracts.executive.read('deputyPM')).toBe(deputyA);

    const deputyB = makeAddr('deputyB');
    await writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
      'designateDeputyPM', [deputyB]);
    expect(await env.contracts.executive.read('deputyPM')).toBe(deputyB);
  });

  // ── 3. PM VACANCY GUARDS ───────────────────────────────────────────────

  it('claimPMVacancy: revert if not certified', async () => {
    await expectRevert(
      env.contracts.executive.write('claimPMVacancy', []),
      'PMVacancyNotCertified',
    );
  });

  it('nominateJusticeDuringSuspension: revert if Crown not suspended', async () => {
    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
        'nominateJusticeDuringSuspension', [makeAddr('candidate'), 0]),
      'CrownNotSuspended',
    );
  });

  // ── 4. EXECUTE PM ACTION ───────────────────────────────────────────────

  it('executePMAction: happy case', async () => {
    const paramKey = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;
    const data = encodeFunctionData({
      abi: env.contracts.constitution.artifact.abi as any,
      functionName: 'getParameter',
      args: [paramKey],
    });
    await writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
      'executePMAction', [env.addresses.constitution, data]);
  });

  it('executePMAction: revert if not PM', async () => {
    const paramKey = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;
    const data = encodeFunctionData({
      abi: env.contracts.constitution.artifact.abi as any,
      functionName: 'getParameter',
      args: [paramKey],
    });
    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, env.actors.citizen1, env.testClient,
        'executePMAction', [env.addresses.constitution, data]),
      'NotPrimeMinister',
    );
  });

  it('executePMAction: revert for invalid target', async () => {
    const unregistered = makeAddr('unregistered');
    const paramKey = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;
    const data = encodeFunctionData({
      abi: env.contracts.constitution.artifact.abi as any,
      functionName: 'getParameter',
      args: [paramKey],
    });
    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
        'executePMAction', [unregistered, data]),
      'InvalidTarget',
    );
  });

  it('executePMAction: revert if execution fails', async () => {
    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
        'executePMAction', [env.addresses.constitution, '0xdeadbeef']),
      'ExecutionFailed',
    );
  });

  // ── 5. NO-CONFIDENCE GUARDS ────────────────────────────────────────────

  it('voteNoConfidence: revert if no motion active', async () => {
    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, env.actors.citizen1, env.testClient,
        'voteNoConfidence', [true]),
      'NoFormationInProgress',
    );
  });

  it('finalizeNoConfidence: revert if no motion active', async () => {
    await expectRevert(
      env.contracts.executive.write('finalizeNoConfidence', []),
      'NoFormationInProgress',
    );
  });

  it('noConfidence: revert if already voted', async () => {
    const honeymoonKey = await env.contracts.constitution.read('PARAM_CONFIDENCE_HONEYMOON');
    const honeymoon = (await env.contracts.constitution.read('getParameter', [honeymoonKey])) as bigint;
    await warpForward(env.testClient, honeymoon + 1n);
    env.currentTime += honeymoon + 1n;

    await writeAs(env.contracts.executive, env.publicClient, env.actors.citizen1, env.testClient,
      'fileNoConfidence', []);
    await writeAs(env.contracts.executive, env.publicClient, env.actors.citizen1, env.testClient,
      'voteNoConfidence', [true]);

    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, env.actors.citizen1, env.testClient,
        'voteNoConfidence', [true]),
      'AlreadyVoted',
    );
  });

  it('voteNoConfidence: onlyMajlis modifier', async () => {
    const honeymoonKey = await env.contracts.constitution.read('PARAM_CONFIDENCE_HONEYMOON');
    const honeymoon = (await env.contracts.constitution.read('getParameter', [honeymoonKey])) as bigint;
    await warpForward(env.testClient, honeymoon + 1n);
    env.currentTime += honeymoon + 1n;

    await writeAs(env.contracts.executive, env.publicClient, env.actors.citizen1, env.testClient,
      'fileNoConfidence', []);

    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, unauthorized, env.testClient,
        'voteNoConfidence', [true]),
      'NotMajlisMember',
    );
  });

  it('fileNoConfidence: revert if already active', async () => {
    const honeymoonKey = await env.contracts.constitution.read('PARAM_CONFIDENCE_HONEYMOON');
    const honeymoon = (await env.contracts.constitution.read('getParameter', [honeymoonKey])) as bigint;
    await warpForward(env.testClient, honeymoon + 1n);
    env.currentTime += honeymoon + 1n;

    await writeAs(env.contracts.executive, env.publicClient, env.actors.citizen1, env.testClient,
      'fileNoConfidence', []);

    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, env.actors.citizen2, env.testClient,
        'fileNoConfidence', []),
      'FormationInProgress',
    );
  });

  // ── 6. CROWN NOT SUSPENDED GUARDS ──────────────────────────────────────

  it('nominateJusticeSecondDuringSuspension: revert if Crown not suspended', async () => {
    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
        'nominateJusticeSecondDuringSuspension', [makeAddr('candidate'), 0]),
      'CrownNotSuspended',
    );
  });

  it('appointJusticeFromListDuringSuspension: revert if Crown not suspended', async () => {
    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
        'appointJusticeFromListDuringSuspension', [0, 0]),
      'CrownNotSuspended',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. ExecutiveVacancyTest — MixinGovernment + MixinJustices
// ═══════════════════════════════════════════════════════════════════════════════

describe('Executive: Vacancy (MixinGovernment + MixinJustices)', () => {
  let env: JusticesEnv;
  let snapshotId: `0x${string}`;
  let ROLE_PM_KEY: `0x${string}`;

  const vacNominee1 = makeAddr('vacNominee1');

  async function certifyPMVacancy(): Promise<void> {
    const hash = keccak256(encodePacked(['string', 'address'], ['PM_VACANCY', env.actors.pmCandidate]));
    await certifyFact(env, hash);
  }

  async function suspendCrown(): Promise<void> {
    const hash = keccak256(encodePacked(['string', 'address'], ['MONARCH_VACANCY', env.actors.monarchAddr]));
    await certifyFact(env, hash);
    await env.contracts.crown.write('claimSuccessionExhausted', []);
  }

  beforeAll(async () => {
    env = await setupGovBase() as any;
    await setupMajlis(env);
    await setupGovernment(env);
    const senateEnv = await setupSenate(env);
    const justicesEnv = await setupJustices(senateEnv);
    // Merge everything into env
    Object.assign(env, senateEnv, justicesEnv);

    ROLE_PM_KEY = (await env.contracts.constitution.read('ROLE_PRIME_MINISTER')) as `0x${string}`;

    await registerNominees(env, vacNominee1);

    snapshotId = await env.testClient.snapshot();
  }, 180_000);

  beforeEach(async () => {
    await env.testClient.revert({ id: snapshotId });
    snapshotId = await env.testClient.snapshot();
  });

  // ── 1. PM VACANCY — DEPUTY BECOMES ACTING ─────────────────────────────

  it('claimPMVacancy: deputy becomes acting PM', async () => {
    const deputy = makeAddr('deputy');
    await writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
      'designateDeputyPM', [deputy]);
    await certifyPMVacancy();
    await env.contracts.executive.write('claimPMVacancy', []);

    expect(await env.contracts.constitution.read('getRole', [ROLE_PM_KEY])).toBe(deputy);
    expect(await env.contracts.executive.read('caretaker')).toBe(true);
    expect(await env.contracts.executive.read('stage')).toBe(1); // CrownNom1
    expect(await env.contracts.executive.read('deputyPM')).toBe('0x0000000000000000000000000000000000000000');
  });

  it('claimPMVacancy: no deputy → PM role vacated', async () => {
    await certifyPMVacancy();
    await env.contracts.executive.write('claimPMVacancy', []);

    expect(await env.contracts.constitution.read('getRole', [ROLE_PM_KEY])).toBe('0x0000000000000000000000000000000000000000');
    expect(await env.contracts.executive.read('caretaker')).toBe(true);
    expect(await env.contracts.executive.read('stage')).toBe(1); // CrownNom1
  });

  it('claimPMVacancy: clears deputy deadline', async () => {
    const deputy = makeAddr('deputy');
    await writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
      'designateDeputyPM', [deputy]);
    await certifyPMVacancy();
    await env.contracts.executive.write('claimPMVacancy', []);
    expect(await env.contracts.executive.read('deputyDesignationDeadline')).toBe(0n);
  });

  // ── 2. FULL LIFECYCLE ─────────────────────────────────────────────────

  it('full lifecycle: PM dies → deputy acting → new PM confirmed', async () => {
    const deputy = makeAddr('deputy');
    await writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
      'designateDeputyPM', [deputy]);

    await certifyPMVacancy();
    await env.contracts.executive.write('claimPMVacancy', []);

    expect(await env.contracts.constitution.read('getRole', [ROLE_PM_KEY])).toBe(deputy);
    expect(await env.contracts.executive.read('caretaker')).toBe(true);
    expect(await env.contracts.executive.read('stage')).toBe(1);

    // Crown nominates vacNominee1
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominatePrimeMinister', [vacNominee1]);
    await writeAs(env.contracts.executive, env.publicClient, vacNominee1, env.testClient,
      'presentGovernment', [keccak256(toHex('program2'))]);

    // Majlis grants confidence
    for (const voter of [env.actors.citizen1, env.actors.citizen2, env.actors.citizen3]) {
      await writeAs(env.contracts.executive, env.publicClient, voter, env.testClient,
        'voteConfidence', [true]);
    }
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.executive.write('finalizeConfidenceVote', []);

    expect(await env.contracts.constitution.read('getRole', [ROLE_PM_KEY])).toBe(vacNominee1);
    expect(await env.contracts.executive.read('caretaker')).toBe(false);
    expect(await env.contracts.executive.read('stage')).toBe(0); // Idle
  });

  it('full lifecycle: PM dies → deputy reconfirmed as permanent PM', async () => {
    const deputy = makeAddr('deputy');
    // Register deputy as citizen so they can be nominated
    await registerNominees(env, deputy);

    await writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
      'designateDeputyPM', [deputy]);

    await certifyPMVacancy();
    await env.contracts.executive.write('claimPMVacancy', []);
    expect(await env.contracts.constitution.read('getRole', [ROLE_PM_KEY])).toBe(deputy);
    expect(await env.contracts.executive.read('caretaker')).toBe(true);

    // Crown re-nominates the deputy as permanent PM
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominatePrimeMinister', [deputy]);
    await writeAs(env.contracts.executive, env.publicClient, deputy, env.testClient,
      'presentGovernment', [keccak256(toHex('deputy program'))]);

    for (const voter of [env.actors.citizen1, env.actors.citizen2, env.actors.citizen3]) {
      await writeAs(env.contracts.executive, env.publicClient, voter, env.testClient,
        'voteConfidence', [true]);
    }
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.executive.write('finalizeConfidenceVote', []);

    expect(await env.contracts.constitution.read('getRole', [ROLE_PM_KEY])).toBe(deputy);
    expect(await env.contracts.executive.read('caretaker')).toBe(false);
    expect((await env.contracts.executive.read('deputyDesignationDeadline')) as bigint).toBeGreaterThan(0n);
  });

  it('acting PM: blocked from non-caretaker actions (isCaretaker flag)', async () => {
    const deputy = makeAddr('deputy');
    await writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
      'designateDeputyPM', [deputy]);
    await certifyPMVacancy();
    await env.contracts.executive.write('claimPMVacancy', []);
    expect(await env.contracts.executive.read('isCaretaker')).toBe(true);
  });

  // ── 3. CROWN SUSPENDED MID-FORMATION ──────────────────────────────────

  it('confidence failure + Crown suspended → CrownNom2', async () => {
    // Start new formation
    const data = env.contracts.executive.encode('startFormation', []);
    await executeMajlisAction(env, env.addresses.executive, data);

    // Crown nominates
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominatePrimeMinister', [vacNominee1]);
    await writeAs(env.contracts.executive, env.publicClient, vacNominee1, env.testClient,
      'presentGovernment', [keccak256(toHex('program'))]);

    // Suspend Crown mid-formation
    await suspendCrown();

    // All vote no
    for (const voter of [env.actors.citizen1, env.actors.citizen2, env.actors.citizen3,
      env.actors.citizen4, env.actors.citizen5]) {
      await writeAs(env.contracts.executive, env.publicClient, voter, env.testClient,
        'voteConfidence', [false]);
    }
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.executive.write('finalizeConfidenceVote', []);

    expect(await env.contracts.executive.read('stage')).toBe(2); // CrownNom2
    expect((await env.contracts.executive.read('crownNominationDeadline')) as bigint).toBeGreaterThan(0n);
  });

  it('noConfidence + Crown suspended → CrownNom1', async () => {
    const honeymoonKey = await env.contracts.constitution.read('PARAM_CONFIDENCE_HONEYMOON');
    const honeymoon = (await env.contracts.constitution.read('getParameter', [honeymoonKey])) as bigint;
    await warpForward(env.testClient, honeymoon + 1n);
    env.currentTime += honeymoon + 1n;

    // Suspend Crown
    await suspendCrown();

    await writeAs(env.contracts.executive, env.publicClient, env.actors.citizen1, env.testClient,
      'fileNoConfidence', []);

    for (const voter of [env.actors.citizen1, env.actors.citizen2, env.actors.citizen3]) {
      await writeAs(env.contracts.executive, env.publicClient, voter, env.testClient,
        'voteNoConfidence', [true]);
    }
    await env.contracts.executive.write('finalizeNoConfidence', []);

    expect(await env.contracts.executive.read('stage')).toBe(1); // CrownNom1
    expect((await env.contracts.executive.read('crownNominationDeadline')) as bigint).toBeGreaterThan(0n);
  });

  it('claimPMVacancy + Crown suspended → CrownNom1', async () => {
    const deputy = makeAddr('deputy');
    await writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
      'designateDeputyPM', [deputy]);

    await suspendCrown();

    const hash = keccak256(encodePacked(['string', 'address'], ['PM_VACANCY', env.actors.pmCandidate]));
    await certifyFact(env, hash);
    await env.contracts.executive.write('claimPMVacancy', []);

    expect(await env.contracts.executive.read('stage')).toBe(1); // CrownNom1
    expect((await env.contracts.executive.read('crownNominationDeadline')) as bigint).toBeGreaterThan(0n);
  });

  // ── 4. INSTANCE-SPECIFIC FACT HASH PREVENTS REUSE ────────────────────

  it('claimPMVacancy: cannot reuse old certification after new PM', async () => {
    // Certify and claim vacancy for pmCandidate
    await certifyPMVacancy();
    await env.contracts.executive.write('claimPMVacancy', []);

    // Nominate and confirm vacNominee1 as new PM
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominatePrimeMinister', [vacNominee1]);
    await writeAs(env.contracts.executive, env.publicClient, vacNominee1, env.testClient,
      'presentGovernment', [keccak256(toHex('program2'))]);
    for (const voter of [env.actors.citizen1, env.actors.citizen2, env.actors.citizen3]) {
      await writeAs(env.contracts.executive, env.publicClient, voter, env.testClient,
        'voteConfidence', [true]);
    }
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.executive.write('finalizeConfidenceVote', []);

    // Old cert for pmCandidate can't be reused — new PM is vacNominee1
    await expectRevert(
      env.contracts.executive.write('claimPMVacancy', []),
      'PMVacancyNotCertified',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. ExecutiveSuspensionTest — MixinGovernment + MixinCrownSuspension
// ═══════════════════════════════════════════════════════════════════════════════

describe('Executive: Suspension (MixinGovernment + MixinCrownSuspension)', () => {
  let env: JusticesEnv;
  let snapshotId: `0x${string}`;
  let ROLE_PM_KEY: `0x${string}`;

  const suspNominee1 = makeAddr('suspNominee1');
  const suspNominee2 = makeAddr('suspNominee2');
  const suspNominee3 = makeAddr('suspNominee3');

  // ── Helpers ──────────────────────────────────────────────────────────────

  async function startFormationDuringSuspension(): Promise<void> {
    await writeAs(env.contracts.parliament, env.publicClient, (env as any).senators[0], env.testClient,
      'initiateFormationDuringSuspension', []);
  }

  async function senateNominatePM(candidate: Address): Promise<void> {
    const data = env.contracts.executive.encode('nominatePM', [candidate]);
    await executeSenateAction(env as any, env.addresses.executive, data);
  }

  async function failAllConfidence(): Promise<void> {
    const voters = [env.actors.citizen1, env.actors.citizen2, env.actors.citizen3,
      env.actors.citizen4, env.actors.citizen5];
    for (const voter of voters) {
      await writeAs(env.contracts.executive, env.publicClient, voter, env.testClient,
        'voteConfidence', [false]);
    }
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.executive.write('finalizeConfidenceVote', []);
  }

  async function submitMajlisList(candidates: [Address, Address, Address]): Promise<void> {
    const data = env.contracts.executive.encode('submitMajlisList', [candidates]);
    await executeMajlisAction(env, env.addresses.executive, data);
  }

  // ── Setup ────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    env = await setupGovBase() as any;
    await setupMajlis(env);
    await setupGovernment(env);
    const senateEnv = await setupSenate(env);
    const justicesEnv = await setupJustices(senateEnv);
    Object.assign(env, senateEnv, justicesEnv);

    await setupCrownSuspension(env);

    ROLE_PM_KEY = (await env.contracts.constitution.read('ROLE_PRIME_MINISTER')) as `0x${string}`;

    await registerNominees(env, suspNominee1, suspNominee2, suspNominee3);

    snapshotId = await env.testClient.snapshot();
  }, 180_000);

  beforeEach(async () => {
    await env.testClient.revert({ id: snapshotId });
    snapshotId = await env.testClient.snapshot();
  });

  // ── 1. FORMATION INITIATION ────────────────────────────────────────────

  it('startFormation: Crown suspended → CrownNom1 (Senate nominates)', async () => {
    await startFormationDuringSuspension();
    expect(await env.contracts.executive.read('stage')).toBe(1); // CrownNom1
    expect(await env.contracts.executive.read('caretaker')).toBe(true);
    expect((await env.contracts.executive.read('crownNominationDeadline')) as bigint).toBeGreaterThan(0n);
  });

  // ── 2. SENATE NOMINATES PM ────────────────────────────────────────────

  it('Senate nominates PM: confidence granted', async () => {
    await startFormationDuringSuspension();
    await senateNominatePM(suspNominee1);
    expect(await env.contracts.executive.read('nominee')).toBe(suspNominee1);

    await writeAs(env.contracts.executive, env.publicClient, suspNominee1, env.testClient,
      'presentGovernment', [keccak256(toHex('Senate nominee program'))]);

    for (const voter of [env.actors.citizen1, env.actors.citizen2, env.actors.citizen3]) {
      await writeAs(env.contracts.executive, env.publicClient, voter, env.testClient,
        'voteConfidence', [true]);
    }
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.executive.write('finalizeConfidenceVote', []);

    expect(await env.contracts.constitution.read('getRole', [ROLE_PM_KEY])).toBe(suspNominee1);
    expect(await env.contracts.executive.read('caretaker')).toBe(false);
  });

  it('Senate first nomination rejected → CrownNom2', async () => {
    await startFormationDuringSuspension();
    await senateNominatePM(suspNominee1);
    await writeAs(env.contracts.executive, env.publicClient, suspNominee1, env.testClient,
      'presentGovernment', [keccak256(toHex('program'))]);
    await failAllConfidence();
    expect(await env.contracts.executive.read('stage')).toBe(2); // CrownNom2
  });

  it('Senate both nominations rejected → MajlisList', async () => {
    await startFormationDuringSuspension();

    // First rejection
    await senateNominatePM(suspNominee1);
    await writeAs(env.contracts.executive, env.publicClient, suspNominee1, env.testClient,
      'presentGovernment', [keccak256(toHex('program1'))]);
    await failAllConfidence();

    // Second rejection
    await senateNominatePM(suspNominee2);
    await writeAs(env.contracts.executive, env.publicClient, suspNominee2, env.testClient,
      'presentGovernment', [keccak256(toHex('program2'))]);
    await failAllConfidence();

    expect(await env.contracts.executive.read('stage')).toBe(3); // MajlisList
  });

  it('Senate nomination timeout → MajlisList', async () => {
    await startFormationDuringSuspension();
    expect(await env.contracts.executive.read('stage')).toBe(1); // CrownNom1

    await warpForward(env.testClient, DAYS(14) + 1n);
    env.currentTime += DAYS(14) + 1n;
    await env.contracts.executive.write('claimCrownNominationTimeout', []);
    expect(await env.contracts.executive.read('stage')).toBe(3); // MajlisList
  });

  // ── 3. SENATE APPOINTS FROM LIST ──────────────────────────────────────

  it('Senate appoints from Majlis list', async () => {
    await startFormationDuringSuspension();

    // Both nominations fail
    await senateNominatePM(suspNominee1);
    await writeAs(env.contracts.executive, env.publicClient, suspNominee1, env.testClient,
      'presentGovernment', [keccak256(toHex('p1'))]);
    await failAllConfidence();

    await senateNominatePM(suspNominee2);
    await writeAs(env.contracts.executive, env.publicClient, suspNominee2, env.testClient,
      'presentGovernment', [keccak256(toHex('p2'))]);
    await failAllConfidence();

    // Majlis submits list
    await submitMajlisList([suspNominee1, suspNominee2, suspNominee3]);

    // Senate appoints from list via governance action
    const data = env.contracts.executive.encode('appointFromList', [1]);
    await executeSenateAction(env as any, env.addresses.executive, data);

    expect(await env.contracts.constitution.read('getRole', [ROLE_PM_KEY])).toBe(suspNominee2);
    expect(await env.contracts.executive.read('caretaker')).toBe(false);
  });

  // ── 4. MAJLIS CANNOT NOMINATE PM DURING SUSPENSION ───────────────────

  it('Majlis cannot nominate PM during Crown suspension', async () => {
    await startFormationDuringSuspension();

    const data = env.contracts.executive.encode('nominatePM', [suspNominee1]);
    const actionId = await prepareMajlisAction(env, env.addresses.executive, data);

    await expectRevert(
      env.contracts.parliament.write('executeGovernanceAction', [actionId]),
      'ExecutionFailed',
    );
  });

  // ── 5. FULL LIFECYCLE ────────────────────────────────────────────────

  it('full lifecycle: Crown suspended → Senate nominates → Majlis confirms', async () => {
    await startFormationDuringSuspension();
    expect(await env.contracts.executive.read('stage')).toBe(1);
    expect(await env.contracts.executive.read('caretaker')).toBe(true);

    await senateNominatePM(suspNominee1);
    await writeAs(env.contracts.executive, env.publicClient, suspNominee1, env.testClient,
      'presentGovernment', [keccak256(toHex('full lifecycle program'))]);

    for (const voter of [env.actors.citizen1, env.actors.citizen2, env.actors.citizen3]) {
      await writeAs(env.contracts.executive, env.publicClient, voter, env.testClient,
        'voteConfidence', [true]);
    }
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.executive.write('finalizeConfidenceVote', []);

    expect(await env.contracts.constitution.read('getRole', [ROLE_PM_KEY])).toBe(suspNominee1);
    expect(await env.contracts.executive.read('caretaker')).toBe(false);
    expect(await env.contracts.executive.read('stage')).toBe(0); // Idle
    expect((await env.contracts.executive.read('deputyDesignationDeadline')) as bigint).toBeGreaterThan(0n);
  });

  // ── 6. JUSTICE NOMINATION DURING SUSPENSION ──────────────────────────

  it('nominateJusticeDuringSuspension: revert if not PM', async () => {
    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, unauthorized, env.testClient,
        'nominateJusticeDuringSuspension', [makeAddr('candidate'), 0]),
      'NotPrimeMinister',
    );
  });

  it('nominateJusticeDuringSuspension: revert if deputy overdue', async () => {
    await warpForward(env.testClient, DAYS(14) + 1n);
    env.currentTime += DAYS(14) + 1n;
    expect(await env.contracts.executive.read('isDeputyOverdue')).toBe(true);

    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
        'nominateJusticeDuringSuspension', [makeAddr('candidate'), 0]),
      'DeputyDesignationOverdue',
    );
  });

  it('nominateJusticeSecondDuringSuspension: revert if deputy overdue', async () => {
    await warpForward(env.testClient, DAYS(14) + 1n);
    env.currentTime += DAYS(14) + 1n;

    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
        'nominateJusticeSecondDuringSuspension', [makeAddr('candidate'), 0]),
      'DeputyDesignationOverdue',
    );
  });

  it('appointJusticeFromListDuringSuspension: revert if deputy overdue', async () => {
    await warpForward(env.testClient, DAYS(14) + 1n);
    env.currentTime += DAYS(14) + 1n;

    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
        'appointJusticeFromListDuringSuspension', [0, 0]),
      'DeputyDesignationOverdue',
    );
  });
});
