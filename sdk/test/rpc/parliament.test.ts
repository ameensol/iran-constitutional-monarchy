/**
 * Parliament.t.sol → TypeScript port
 *
 * Five test suites matching the five Foundry test contracts:
 * 1. ParliamentBaseTest (GovTestBase) — bills, votes, terms, stagger, by-elections, governance actions
 * 2. ParliamentCaretakerTest (MixinCaretaker) — caretaker blocks non-budget bills
 * 3. ParliamentGovernmentTest (MixinGovernment + MixinSenate) — CrownNotSuspended guards
 * 4. ParliamentIncapacityTest (MixinGovernment + MixinJustices) — incapacity certification
 * 5. ParliamentSuspensionTest (MixinGovernment + MixinCrownSuspension) — Crown suspension fallback
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
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
  setupCaretaker,
  setupCrownSuspension,
  executeMajlisAction,
  prepareMajlisAction,
  executeSenateAction,
  certifyFact,
  type SenateEnv,
  type JusticesEnv,
} from '../setup/mixins.js';
import { warpForward, DAYS, asAccount, setBalance } from '../../src/client/AnvilHelpers.js';
import { expectRevert, makeAddr } from '../setup/testUtils.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Shared constants
// ═══════════════════════════════════════════════════════════════════════════════

const BILL_HASH = keccak256(toHex('Tax Reform Act'));
const BUDGET_HASH = keccak256(toHex('Annual Budget 1404'));
const unauthorized = makeAddr('unauthorized');

// Extra senators for stagger testing
const sen3 = makeAddr('sen3');
const sen4 = makeAddr('sen4');
const sen5 = makeAddr('sen5');
const sen6 = makeAddr('sen6');
const sen7 = makeAddr('sen7');
const sen8 = makeAddr('sen8');
const sen9 = makeAddr('sen9');

const allExtraSenators = [sen3, sen4, sen5, sen6, sen7, sen8, sen9];

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/** Register addresses as citizens in province 1 */
async function registerCitizens(env: GovTestEnv, addrs: Address[]): Promise<void> {
  for (let i = 0; i < addrs.length; i++) {
    const identityHash = keccak256(encodePacked(['string', 'uint256'], ['extra', BigInt(i)]));
    await writeAs(env.contracts.registry, env.publicClient, env.actors.authorityKey, env.testClient,
      'registerCitizen', [addrs[i], identityHash, 1]);
  }
}

/** Seat a Majlis member via Election contract impersonation */
async function seatMajlis(env: GovTestEnv, member: Address): Promise<void> {
  await asAccount(env.testClient, env.addresses.election, async () => {
    const elParl = contractAs(env.contracts.parliament, env.publicClient, walletForAddress(env.addresses.election));
    await elParl.write('seatMember', [member, 0], env.addresses.election); // 0 = Majlis
  });
}

/** Seat a Senate member via Election contract impersonation */
async function seatSenate(env: GovTestEnv, member: Address): Promise<void> {
  await asAccount(env.testClient, env.addresses.election, async () => {
    const elParl = contractAs(env.contracts.parliament, env.publicClient, walletForAddress(env.addresses.election));
    await elParl.write('seatMember', [member, 1], env.addresses.election); // 1 = Senate
  });
}

/** Seat a Crown senator via monarch → crown.appointSenators */
async function seatCrownSenator(env: GovTestEnv, senator: Address): Promise<void> {
  await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
    'appointSenators', [[senator]]);
}

/** Seat full parliament: 5 Majlis + 3 Senate */
async function seatFullParliament(env: GovTestEnv): Promise<void> {
  const { citizen1, citizen2, citizen3, citizen4, citizen5, citizen6, citizen7 } = env.actors;
  for (const m of [citizen1, citizen2, citizen3, citizen4, citizen5]) {
    await seatMajlis(env, m);
  }
  for (const s of [citizen6, citizen7, sen3]) {
    await seatSenate(env, s);
  }
}

/** Seat 9 senators for stagger testing */
async function seatNineSenators(env: GovTestEnv): Promise<void> {
  const allSen = [env.actors.citizen6, env.actors.citizen7, sen3, sen4, sen5, sen6, sen7, sen8, sen9];
  for (const s of allSen) {
    await seatSenate(env, s);
  }
}

/** Submit bill and pass through Majlis */
async function submitAndPassMajlis(env: GovTestEnv, hash: `0x${string}`): Promise<bigint> {
  const { citizen1, citizen2, citizen3 } = env.actors;
  const billIdRaw = await writeAs(env.contracts.parliament, env.publicClient, citizen1, env.testClient,
    'submitBill', [hash, 'Test bill']);
  const billCount = (await env.contracts.parliament.read('billCount')) as bigint;
  const billId = billCount - 1n;

  for (const voter of [citizen1, citizen2, citizen3]) {
    await writeAs(env.contracts.parliament, env.publicClient, voter, env.testClient,
      'voteMajlis', [billId, true]);
  }

  await warpForward(env.testClient, DAYS(3));
  env.currentTime += DAYS(3);
  await env.contracts.parliament.write('finalizeMajlisVote', [billId]);
  return billId;
}

/** Pass a bill through Senate */
async function passSenate(env: GovTestEnv, billId: bigint): Promise<void> {
  const { citizen6, citizen7 } = env.actors;
  for (const voter of [citizen6, citizen7]) {
    await writeAs(env.contracts.parliament, env.publicClient, voter, env.testClient,
      'voteSenate', [billId, true]);
  }
  await warpForward(env.testClient, DAYS(3));
  env.currentTime += DAYS(3);
  await env.contracts.parliament.write('finalizeSenateVote', [billId]);
}

/** Remove a member via Supreme Court impersonation */
async function removeMemberViaCourt(env: GovTestEnv, member: Address, chamber: number): Promise<void> {
  await asAccount(env.testClient, env.addresses.court, async () => {
    const courtParl = contractAs(env.contracts.parliament, env.publicClient, walletForAddress(env.addresses.court));
    await courtParl.write('removeMember', [member, chamber], env.addresses.court);
  });
}

/** Seat Majlis member with province tracking via Election impersonation */
async function seatMajlisWithProvince(env: GovTestEnv, member: Address, province: number): Promise<void> {
  await asAccount(env.testClient, env.addresses.election, async () => {
    const elParl = contractAs(env.contracts.parliament, env.publicClient, walletForAddress(env.addresses.election));
    await elParl.write('seatMajlisMemberWithProvince', [member, province], env.addresses.election);
  });
}

/** Seat senator with province tracking via ProvincialCouncil impersonation */
async function seatSenatorWithProvince(env: GovTestEnv, member: Address, province: number): Promise<void> {
  await asAccount(env.testClient, env.addresses.pc, async () => {
    const pcParl = contractAs(env.contracts.parliament, env.publicClient, walletForAddress(env.addresses.pc));
    await pcParl.write('seatSenatorWithProvince', [member, province], env.addresses.pc);
  });
}

/** Mark constitutional via Court impersonation */
async function markConstitutional(env: GovTestEnv, billId: bigint): Promise<void> {
  await asAccount(env.testClient, env.addresses.court, async () => {
    const courtParl = contractAs(env.contracts.parliament, env.publicClient, walletForAddress(env.addresses.court));
    await courtParl.write('markConstitutional', [billId], env.addresses.court);
  });
}

/** Mark vetoed via Court impersonation */
async function markVetoed(env: GovTestEnv, billId: bigint): Promise<void> {
  await asAccount(env.testClient, env.addresses.court, async () => {
    const courtParl = contractAs(env.contracts.parliament, env.publicClient, walletForAddress(env.addresses.court));
    await courtParl.write('markVetoed', [billId], env.addresses.court);
  });
}

/** Restore Majlis via Election impersonation */
async function restoreMajlis(env: GovTestEnv): Promise<void> {
  await asAccount(env.testClient, env.addresses.election, async () => {
    const elParl = contractAs(env.contracts.parliament, env.publicClient, walletForAddress(env.addresses.election));
    await elParl.write('restoreMajlis', [], env.addresses.election);
  });
}

/** Call majlisElectionSeated via Election impersonation */
async function majlisElectionSeated(env: GovTestEnv): Promise<void> {
  await asAccount(env.testClient, env.addresses.election, async () => {
    const elParl = contractAs(env.contracts.parliament, env.publicClient, walletForAddress(env.addresses.election));
    await elParl.write('majlisElectionSeated', [], env.addresses.election);
  });
}

// Bill status enum values
const BillStatus = {
  MajlisVoting: 1,
  SenateReview: 2,
  SenateObjected: 3,
  MajlisOverride: 4,
  CrownAction: 5,
  Enacted: 6,
  Returned: 7,
  Referred: 8,
  Vetoed: 9,
  Rejected: 10,
  Dissolved: 11,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// 1. ParliamentBaseTest
// ═══════════════════════════════════════════════════════════════════════════════

describe('Parliament: Base (GovTestBase)', () => {
  let env: GovTestEnv;
  let snapshotId: `0x${string}`;

  beforeAll(async () => {
    env = await setupGovBase();
    // Register extra senators as citizens
    await registerCitizens(env, allExtraSenators);
    // Give extra senators ETH for gas
    for (const addr of allExtraSenators) {
      await setBalance(env.testClient, addr, 10000000000000000000n);
    }
    snapshotId = await env.testClient.snapshot();
  }, 120_000);

  beforeEach(async () => {
    await env.testClient.revert({ id: snapshotId });
    snapshotId = await env.testClient.snapshot();
  });

  // ── 1. CONSTRUCTION ──────────────────────────────────────────────────────

  it('constructor: correct initial state', async () => {
    expect(await env.contracts.parliament.read('majlisMemberCount')).toBe(0n);
    expect(await env.contracts.parliament.read('senateMemberCount')).toBe(0n);
    expect(await env.contracts.parliament.read('dissolved')).toBe(false);
  });

  it('constructor: reverts with zero address', async () => {
    const { deployStandalone, deployerWallet } = await import('../setup/testUtils.js');
    const { ParliamentArtifact } = await import('../../src/abi/index.js');
    await expectRevert(
      deployStandalone(env.publicClient, deployerWallet(), ParliamentArtifact, ['0x0000000000000000000000000000000000000000']),
      'ZeroAddress',
    );
  });

  // ── 2. MEMBER SEATING ───────────────────────────────────────────────────

  it('seatMajlisMember: happy case', async () => {
    await seatMajlis(env, env.actors.citizen1);
    expect(await env.contracts.parliament.read('isMajlisMember', [env.actors.citizen1])).toBe(true);
    expect(await env.contracts.parliament.read('majlisMemberCount')).toBe(1n);
  });

  it('seatSenateMember: happy case', async () => {
    await seatSenate(env, env.actors.citizen6);
    expect(await env.contracts.parliament.read('isSenateMember', [env.actors.citizen6])).toBe(true);
    expect(await env.contracts.parliament.read('senateMemberCount')).toBe(1n);
  });

  it('seatCrownSenator: 9 regular + 1 Crown', async () => {
    await seatNineSenators(env);
    const crownSenator = makeAddr('crownSenator');
    await registerCitizens(env, [crownSenator]);
    await setBalance(env.testClient, crownSenator, 10000000000000000000n);
    await seatCrownSenator(env, crownSenator);
    expect(await env.contracts.parliament.read('isSenateMember', [crownSenator])).toBe(true);
    expect(await env.contracts.parliament.read('crownSenatorCount')).toBe(1n);
  });

  it('seatCrownSenator: cap exceeded with 1 regular senator', async () => {
    await seatSenate(env, env.actors.citizen6);
    const crownSenator = makeAddr('crownSenator');
    await registerCitizens(env, [crownSenator]);
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'appointSenators', [[crownSenator]]),
      'CrownSenatorCapExceeded',
    );
  });

  it('seatMember: revert if already member', async () => {
    await seatMajlis(env, env.actors.citizen1);
    await expect(seatMajlis(env, env.actors.citizen1)).rejects.toThrow();
  });

  it('seatMember: onlyElection modifier', async () => {
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, unauthorized, env.testClient,
        'seatMember', [env.actors.citizen1, 0]),
      'NotAuthorized',
    );
  });

  it('removeMember: happy case', async () => {
    await seatMajlis(env, env.actors.citizen1);
    await removeMemberViaCourt(env, env.actors.citizen1, 0);
    expect(await env.contracts.parliament.read('isMajlisMember', [env.actors.citizen1])).toBe(false);
    expect(await env.contracts.parliament.read('majlisMemberCount')).toBe(0n);
  });

  it('removeMember: revert if not active', async () => {
    await expect(removeMemberViaCourt(env, env.actors.citizen1, 0)).rejects.toThrow();
  });

  it('removeMember: onlySupremeCourt modifier', async () => {
    await seatMajlis(env, env.actors.citizen1);
    await expectRevert(
      asAccount(env.testClient, env.addresses.election, async () => {
        const elParl = contractAs(env.contracts.parliament, env.publicClient, walletForAddress(env.addresses.election));
        return elParl.write('removeMember', [env.actors.citizen1, 0], env.addresses.election);
      }),
      'NotAuthorized',
    );
  });

  // ── 3. BILL SUBMISSION ──────────────────────────────────────────────────

  it('submitBill: happy case', async () => {
    await seatFullParliament(env);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'submitBill', [BILL_HASH, 'Tax Reform']);
    expect(await env.contracts.parliament.read('billCount')).toBe(1n);
    expect(await env.contracts.parliament.read('getBillStatus', [0n])).toBe(BillStatus.MajlisVoting);
  });

  it('submitBill: revert empty content', async () => {
    await seatFullParliament(env);
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
        'submitBill', ['0x0000000000000000000000000000000000000000000000000000000000000000', 'Empty']),
      'EmptyContent',
    );
  });

  it('submitBill: onlyMajlis modifier', async () => {
    await seatFullParliament(env);
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen6, env.testClient,
        'submitBill', [BILL_HASH, 'Tax Reform']),
      'NotMajlisMember',
    );
  });

  it('submitBill: revert if dissolved', async () => {
    await seatFullParliament(env);
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'declareDissolution', []);
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
        'submitBill', [BILL_HASH, 'Tax Reform']),
      'MajlisDissolved',
    );
  });

  // ── 4. MAJLIS VOTING ────────────────────────────────────────────────────

  it('voteMajlis: happy case', async () => {
    await seatFullParliament(env);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'submitBill', [BILL_HASH, 'Tax Reform']);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'voteMajlis', [0n, true]);
    const votes = (await env.contracts.parliament.read('getBillVotes', [0n])) as [bigint, bigint, bigint, bigint];
    expect(votes[0]).toBe(1n); // majYes
    expect(votes[1]).toBe(0n); // majNo
  });

  it('voteMajlis: revert if already voted', async () => {
    await seatFullParliament(env);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'submitBill', [BILL_HASH, 'Tax Reform']);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'voteMajlis', [0n, true]);
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
        'voteMajlis', [0n, true]),
      'AlreadyVoted',
    );
  });

  it('finalizeMajlisVote: passes', async () => {
    await seatFullParliament(env);
    const billId = await submitAndPassMajlis(env, BILL_HASH);
    expect(await env.contracts.parliament.read('getBillStatus', [billId])).toBe(BillStatus.SenateReview);
  });

  it('finalizeMajlisVote: fails', async () => {
    await seatFullParliament(env);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'submitBill', [BILL_HASH, 'Tax Reform']);
    const billId = 0n;
    // 2 no, 1 yes
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'voteMajlis', [billId, false]);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen2, env.testClient,
      'voteMajlis', [billId, false]);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen3, env.testClient,
      'voteMajlis', [billId, true]);
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.parliament.write('finalizeMajlisVote', [billId]);
    expect(await env.contracts.parliament.read('getBillStatus', [billId])).toBe(BillStatus.Rejected);
  });

  // ── 5. SENATE REVIEW ────────────────────────────────────────────────────

  it('senateApproves: bill goes to CrownAction', async () => {
    await seatFullParliament(env);
    const billId = await submitAndPassMajlis(env, BILL_HASH);
    await passSenate(env, billId);
    expect(await env.contracts.parliament.read('getBillStatus', [billId])).toBe(BillStatus.CrownAction);
  });

  it('senateObjects: bill goes to SenateObjected', async () => {
    await seatFullParliament(env);
    const billId = await submitAndPassMajlis(env, BILL_HASH);
    // 2 no, 1 yes
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen6, env.testClient,
      'voteSenate', [billId, false]);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen7, env.testClient,
      'voteSenate', [billId, false]);
    await writeAs(env.contracts.parliament, env.publicClient, sen3, env.testClient,
      'voteSenate', [billId, true]);
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.parliament.write('finalizeSenateVote', [billId]);
    expect(await env.contracts.parliament.read('getBillStatus', [billId])).toBe(BillStatus.SenateObjected);
  });

  it('voteSenate: onlySenateMember modifier', async () => {
    await seatFullParliament(env);
    const billId = await submitAndPassMajlis(env, BILL_HASH);
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
        'voteSenate', [billId, true]),
      'NotSenateMember',
    );
  });

  // ── 6. SENATE TIMEOUT ──────────────────────────────────────────────────

  it('senateTimeout: bill goes to CrownAction', async () => {
    await seatFullParliament(env);
    const billId = await submitAndPassMajlis(env, BILL_HASH);
    await warpForward(env.testClient, DAYS(30) + 1n);
    env.currentTime += DAYS(30) + 1n;
    await env.contracts.parliament.write('claimSenateTimeout', [billId]);
    expect(await env.contracts.parliament.read('getBillStatus', [billId])).toBe(BillStatus.CrownAction);
  });

  it('senateTimeout: revert too early', async () => {
    await seatFullParliament(env);
    const billId = await submitAndPassMajlis(env, BILL_HASH);
    await expectRevert(
      env.contracts.parliament.write('claimSenateTimeout', [billId]),
      'SenateReviewNotExpired',
    );
  });

  // ── 6b. CROWN TIMEOUT ─────────────────────────────────────────────────

  it('crownTimeout: bill enacted', async () => {
    await seatFullParliament(env);
    const billId = await submitAndPassMajlis(env, BILL_HASH);
    await passSenate(env, billId);
    expect(await env.contracts.parliament.read('getBillStatus', [billId])).toBe(BillStatus.CrownAction);
    await warpForward(env.testClient, DAYS(14) + 1n);
    env.currentTime += DAYS(14) + 1n;
    await env.contracts.parliament.write('claimCrownTimeout', [billId]);
    expect(await env.contracts.parliament.read('getBillStatus', [billId])).toBe(BillStatus.Enacted);
  });

  it('crownTimeout: revert too early', async () => {
    await seatFullParliament(env);
    const billId = await submitAndPassMajlis(env, BILL_HASH);
    await passSenate(env, billId);
    await expectRevert(
      env.contracts.parliament.write('claimCrownTimeout', [billId]),
      'DeadlineNotExpired',
    );
  });

  it('crownTimeout: revert wrong status', async () => {
    await seatFullParliament(env);
    const billId = await submitAndPassMajlis(env, BILL_HASH);
    // Bill is SenateReview, not CrownAction
    await expectRevert(
      env.contracts.parliament.write('claimCrownTimeout', [billId]),
      'BillNotInStatus',
    );
  });

  // ── 7. SENATE OBJECTION → MAJLIS OVERRIDE ────────────────────────────

  it('majlisOverride: succeeds with absolute majority', async () => {
    await seatFullParliament(env);
    const billId = await submitAndPassMajlis(env, BILL_HASH);
    // Senate objects
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen6, env.testClient,
      'voteSenate', [billId, false]);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen7, env.testClient,
      'voteSenate', [billId, false]);
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.parliament.write('finalizeSenateVote', [billId]);

    // Start override
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'startMajlisOverride', [billId]);
    expect(await env.contracts.parliament.read('getBillStatus', [billId])).toBe(BillStatus.MajlisOverride);

    // Re-vote with 3/5 = absolute majority
    for (const v of [env.actors.citizen1, env.actors.citizen2, env.actors.citizen3]) {
      await writeAs(env.contracts.parliament, env.publicClient, v, env.testClient,
        'voteMajlis', [billId, true]);
    }
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.parliament.write('finalizeMajlisVote', [billId]);
    expect(await env.contracts.parliament.read('getBillStatus', [billId])).toBe(BillStatus.CrownAction);
  });

  it('majlisOverride: fails without absolute majority', async () => {
    await seatFullParliament(env);
    const billId = await submitAndPassMajlis(env, BILL_HASH);
    // Senate objects
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen6, env.testClient,
      'voteSenate', [billId, false]);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen7, env.testClient,
      'voteSenate', [billId, false]);
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.parliament.write('finalizeSenateVote', [billId]);

    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'startMajlisOverride', [billId]);

    // Only 2/5 yes → not absolute majority
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'voteMajlis', [billId, true]);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen2, env.testClient,
      'voteMajlis', [billId, true]);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen3, env.testClient,
      'voteMajlis', [billId, false]);
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.parliament.write('finalizeMajlisVote', [billId]);
    expect(await env.contracts.parliament.read('getBillStatus', [billId])).toBe(BillStatus.Rejected);
  });

  // ── 8. CROWN ACTION ────────────────────────────────────────────────────

  it('markEnacted: Crown signs bill', async () => {
    await seatFullParliament(env);
    const billId = await submitAndPassMajlis(env, BILL_HASH);
    await passSenate(env, billId);
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'enactLaw', [billId]);
    expect(await env.contracts.parliament.read('getBillStatus', [billId])).toBe(BillStatus.Enacted);
  });

  it('markReturned: Crown returns bill', async () => {
    await seatFullParliament(env);
    const billId = await submitAndPassMajlis(env, BILL_HASH);
    await passSenate(env, billId);
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'returnLaw', [billId]);
    expect(await env.contracts.parliament.read('getBillStatus', [billId])).toBe(BillStatus.Returned);
  });

  it('markReferred: Crown refers after return + re-adoption', async () => {
    await seatFullParliament(env);
    const billId = await submitAndPassMajlis(env, BILL_HASH);
    await passSenate(env, billId);
    // Return
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'returnLaw', [billId]);
    // Majlis re-adopts
    for (const v of [env.actors.citizen1, env.actors.citizen2, env.actors.citizen3]) {
      await writeAs(env.contracts.parliament, env.publicClient, v, env.testClient,
        'voteMajlis', [billId, true]);
    }
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.parliament.write('finalizeMajlisVote', [billId]);
    // Refer
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'referToSupremeCourt', [billId]);
    expect(await env.contracts.parliament.read('getBillStatus', [billId])).toBe(BillStatus.Referred);
  });

  it('markReferred: revert if not returned first', async () => {
    await seatFullParliament(env);
    const billId = await submitAndPassMajlis(env, BILL_HASH);
    await passSenate(env, billId);
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'referToSupremeCourt', [billId]),
      'BillNotInStatus',
    );
  });

  it('markConstitutional: court finds constitutional → enacted', async () => {
    await seatFullParliament(env);
    const billId = await submitAndPassMajlis(env, BILL_HASH);
    await passSenate(env, billId);
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'returnLaw', [billId]);
    for (const v of [env.actors.citizen1, env.actors.citizen2, env.actors.citizen3]) {
      await writeAs(env.contracts.parliament, env.publicClient, v, env.testClient,
        'voteMajlis', [billId, true]);
    }
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.parliament.write('finalizeMajlisVote', [billId]);
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'referToSupremeCourt', [billId]);
    await markConstitutional(env, billId);
    expect(await env.contracts.parliament.read('getBillStatus', [billId])).toBe(BillStatus.Enacted);
  });

  it('markVetoed: court finds unconstitutional → vetoed', async () => {
    await seatFullParliament(env);
    const billId = await submitAndPassMajlis(env, BILL_HASH);
    await passSenate(env, billId);
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'returnLaw', [billId]);
    for (const v of [env.actors.citizen1, env.actors.citizen2, env.actors.citizen3]) {
      await writeAs(env.contracts.parliament, env.publicClient, v, env.testClient,
        'voteMajlis', [billId, true]);
    }
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.parliament.write('finalizeMajlisVote', [billId]);
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'referToSupremeCourt', [billId]);
    await markVetoed(env, billId);
    expect(await env.contracts.parliament.read('getBillStatus', [billId])).toBe(BillStatus.Vetoed);
  });

  it('markConstitutional: revert wrong status', async () => {
    await seatFullParliament(env);
    const billId = await submitAndPassMajlis(env, BILL_HASH);
    await passSenate(env, billId);
    // Bill is CrownAction, not Referred
    await expect(markConstitutional(env, billId)).rejects.toThrow();
  });

  it('markConstitutional: onlySupremeCourt modifier', async () => {
    await seatFullParliament(env);
    const billId = await submitAndPassMajlis(env, BILL_HASH);
    await passSenate(env, billId);
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'returnLaw', [billId]);
    for (const v of [env.actors.citizen1, env.actors.citizen2, env.actors.citizen3]) {
      await writeAs(env.contracts.parliament, env.publicClient, v, env.testClient,
        'voteMajlis', [billId, true]);
    }
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.parliament.write('finalizeMajlisVote', [billId]);
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'referToSupremeCourt', [billId]);
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, unauthorized, env.testClient,
        'markConstitutional', [billId]),
      'NotAuthorized',
    );
  });

  it('markEnacted: onlyCrown modifier', async () => {
    await seatFullParliament(env);
    const billId = await submitAndPassMajlis(env, BILL_HASH);
    await passSenate(env, billId);
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, unauthorized, env.testClient,
        'markEnacted', [billId]),
      'NotAuthorized',
    );
  });

  // ── 9. CROWN RETURN → RE-ADOPTION ────────────────────────────────────

  it('returnAndReAdopt: bill goes back to CrownAction', async () => {
    await seatFullParliament(env);
    const billId = await submitAndPassMajlis(env, BILL_HASH);
    await passSenate(env, billId);
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'returnLaw', [billId]);
    // Majlis re-votes
    for (const v of [env.actors.citizen1, env.actors.citizen2, env.actors.citizen3]) {
      await writeAs(env.contracts.parliament, env.publicClient, v, env.testClient,
        'voteMajlis', [billId, true]);
    }
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.parliament.write('finalizeMajlisVote', [billId]);
    expect(await env.contracts.parliament.read('getBillStatus', [billId])).toBe(BillStatus.CrownAction);
  });

  it('returnTwice: revert on second return', async () => {
    await seatFullParliament(env);
    const billId = await submitAndPassMajlis(env, BILL_HASH);
    await passSenate(env, billId);
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'returnLaw', [billId]);
    for (const v of [env.actors.citizen1, env.actors.citizen2, env.actors.citizen3]) {
      await writeAs(env.contracts.parliament, env.publicClient, v, env.testClient,
        'voteMajlis', [billId, true]);
    }
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.parliament.write('finalizeMajlisVote', [billId]);
    // Second return should fail
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'returnLaw', [billId]),
      'BillNotInStatus',
    );
  });

  // ── 10. DISSOLUTION ────────────────────────────────────────────────────

  it('dissolveMajlis: happy case', async () => {
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'declareDissolution', []);
    expect(await env.contracts.parliament.read('dissolved')).toBe(true);
  });

  it('restoreMajlis: happy case', async () => {
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'declareDissolution', []);
    await restoreMajlis(env);
    expect(await env.contracts.parliament.read('dissolved')).toBe(false);
  });

  it('dissolveMajlis: onlyCrownOrExecutive modifier', async () => {
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, unauthorized, env.testClient,
        'dissolveMajlis', []),
      'NotAuthorized',
    );
  });

  // ── BOUNDARY TESTS ────────────────────────────────────────────────────

  it('invalidBillId: revert', async () => {
    await expectRevert(
      env.contracts.parliament.read('getBillStatus', [0n]),
      'InvalidBillId',
    );
  });

  it('multipleBills: two bills', async () => {
    await seatFullParliament(env);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'submitBill', [BILL_HASH, 'Bill 1']);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen2, env.testClient,
      'submitBill', [keccak256(toHex('Bill 2')), 'Bill 2']);
    expect(await env.contracts.parliament.read('billCount')).toBe(2n);
  });

  // ── 13. TERM MANAGEMENT ───────────────────────────────────────────────

  it('expireMajlisMember: happy case', async () => {
    await seatFullParliament(env);
    const majlisTermKey = await env.contracts.constitution.read('PARAM_MAJLIS_TERM');
    const majlisTerm = (await env.contracts.constitution.read('getParameter', [majlisTermKey])) as bigint;
    await warpForward(env.testClient, majlisTerm + 1n);
    env.currentTime += majlisTerm + 1n;
    expect(await env.contracts.parliament.read('isTermExpired', [env.actors.citizen1, 0])).toBe(true);
    await env.contracts.parliament.write('expireMember', [env.actors.citizen1, 0]);
    expect(await env.contracts.parliament.read('isMajlisMember', [env.actors.citizen1])).toBe(false);
    expect(await env.contracts.parliament.read('majlisMemberCount')).toBe(4n);
  });

  it('expireSenateMember: happy case', async () => {
    await seatFullParliament(env);
    const senateTermKey = await env.contracts.constitution.read('PARAM_SENATE_TERM');
    const senateTerm = (await env.contracts.constitution.read('getParameter', [senateTermKey])) as bigint;
    await warpForward(env.testClient, senateTerm + 1n);
    env.currentTime += senateTerm + 1n;
    expect(await env.contracts.parliament.read('isTermExpired', [env.actors.citizen6, 1])).toBe(true);
    await env.contracts.parliament.write('expireMember', [env.actors.citizen6, 1]);
    expect(await env.contracts.parliament.read('isSenateMember', [env.actors.citizen6])).toBe(false);
    expect(await env.contracts.parliament.read('senateMemberCount')).toBe(2n);
    expect(await env.contracts.parliament.read('senateVacancyCount')).toBe(0n);
  });

  it('expireMember: revert if term not expired', async () => {
    await seatFullParliament(env);
    await expectRevert(
      env.contracts.parliament.write('expireMember', [env.actors.citizen1, 0]),
      'TermNotExpired',
    );
  });

  it('expireMember: revert if not active', async () => {
    await expectRevert(
      env.contracts.parliament.write('expireMember', [unauthorized, 0]),
      'NotActiveMember',
    );
  });

  it('senateNonRenewability: cannot re-seat expired senator', async () => {
    await seatFullParliament(env);
    const senateTermKey = await env.contracts.constitution.read('PARAM_SENATE_TERM');
    const senateTerm = (await env.contracts.constitution.read('getParameter', [senateTermKey])) as bigint;
    await warpForward(env.testClient, senateTerm + 1n);
    env.currentTime += senateTerm + 1n;
    await env.contracts.parliament.write('expireMember', [env.actors.citizen6, 1]);
    await expect(seatSenate(env, env.actors.citizen6)).rejects.toThrow();
  });

  it('senateNonRenewability: Crown senator removed cannot be re-appointed', async () => {
    await seatNineSenators(env);
    const crownSenator = makeAddr('crownSenator');
    await registerCitizens(env, [crownSenator]);
    await setBalance(env.testClient, crownSenator, 10000000000000000000n);
    await seatCrownSenator(env, crownSenator);
    expect(await env.contracts.parliament.read('crownSenatorCount')).toBe(1n);
    await removeMemberViaCourt(env, crownSenator, 1);
    expect(await env.contracts.parliament.read('crownSenatorCount')).toBe(0n);
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'appointSenators', [[crownSenator]]),
      'SenateNonRenewable',
    );
  });

  it('majlisCanBeReseated: no non-renewability for Majlis', async () => {
    await seatFullParliament(env);
    const majlisTermKey = await env.contracts.constitution.read('PARAM_MAJLIS_TERM');
    const majlisTerm = (await env.contracts.constitution.read('getParameter', [majlisTermKey])) as bigint;
    await warpForward(env.testClient, majlisTerm + 1n);
    env.currentTime += majlisTerm + 1n;
    await env.contracts.parliament.write('expireMember', [env.actors.citizen1, 0]);
    await seatMajlis(env, env.actors.citizen1);
    expect(await env.contracts.parliament.read('isMajlisMember', [env.actors.citizen1])).toBe(true);
  });

  it('isTermExpired: non-member returns false', async () => {
    expect(await env.contracts.parliament.read('isTermExpired', [unauthorized, 0])).toBe(false);
    expect(await env.contracts.parliament.read('isTermExpired', [unauthorized, 1])).toBe(false);
  });

  // ── 16. DISSOLUTION ELECTION DEADLINE ─────────────────────────────────

  it('claimDissolutionElectionTimeout: triggers elections', async () => {
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'declareDissolution', []);
    const deadlineKey = await env.contracts.constitution.read('PARAM_DISSOLUTION_ELECTION_DEADLINE');
    const deadline = (await env.contracts.constitution.read('getParameter', [deadlineKey])) as bigint;
    await warpForward(env.testClient, deadline);
    env.currentTime += deadline;
    await env.contracts.parliament.write('claimDissolutionElectionTimeout', []);
    expect(await env.contracts.parliament.read('pendingMajlisElections')).toBe(3n);
  });

  it('claimDissolutionElectionTimeout: revert not dissolved', async () => {
    await expectRevert(
      env.contracts.parliament.write('claimDissolutionElectionTimeout', []),
      'NotDissolved',
    );
  });

  it('claimDissolutionElectionTimeout: revert too early', async () => {
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'declareDissolution', []);
    await expectRevert(
      env.contracts.parliament.write('claimDissolutionElectionTimeout', []),
      'DissolutionElectionDeadlineNotReached',
    );
  });

  it('claimDissolutionElectionTimeout: revert already triggered', async () => {
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'declareDissolution', []);
    const deadlineKey = await env.contracts.constitution.read('PARAM_DISSOLUTION_ELECTION_DEADLINE');
    const deadline = (await env.contracts.constitution.read('getParameter', [deadlineKey])) as bigint;
    await warpForward(env.testClient, deadline);
    env.currentTime += deadline;
    await env.contracts.parliament.write('claimDissolutionElectionTimeout', []);
    await expectRevert(
      env.contracts.parliament.write('claimDissolutionElectionTimeout', []),
      'DissolutionElectionAlreadyTriggered',
    );
  });

  it('dissolveMajlis: records timestamp', async () => {
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'declareDissolution', []);
    expect((await env.contracts.parliament.read('dissolvedAt')) as bigint).toBeGreaterThan(0n);
  });

  it('restoreMajlis: clears timestamp', async () => {
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'declareDissolution', []);
    await restoreMajlis(env);
    expect(await env.contracts.parliament.read('dissolvedAt')).toBe(0n);
  });

  // ── 17. SELF-ENFORCING TERMS ──────────────────────────────────────────

  it('isActiveMajlisMember: true then false after expiry', async () => {
    await seatMajlis(env, env.actors.citizen1);
    expect(await env.contracts.parliament.read('isActiveMajlisMember', [env.actors.citizen1])).toBe(true);
    const majlisTermKey = await env.contracts.constitution.read('PARAM_MAJLIS_TERM');
    const majlisTerm = (await env.contracts.constitution.read('getParameter', [majlisTermKey])) as bigint;
    await warpForward(env.testClient, majlisTerm + 1n);
    env.currentTime += majlisTerm + 1n;
    expect(await env.contracts.parliament.read('isActiveMajlisMember', [env.actors.citizen1])).toBe(false);
    // Still in storage
    expect(await env.contracts.parliament.read('isMajlisMember', [env.actors.citizen1])).toBe(true);
  });

  it('isActiveSenateMember: true then false after expiry', async () => {
    await seatSenate(env, env.actors.citizen6);
    expect(await env.contracts.parliament.read('isActiveSenateMember', [env.actors.citizen6])).toBe(true);
    const senateTermKey = await env.contracts.constitution.read('PARAM_SENATE_TERM');
    const senateTerm = (await env.contracts.constitution.read('getParameter', [senateTermKey])) as bigint;
    await warpForward(env.testClient, senateTerm + 1n);
    env.currentTime += senateTerm + 1n;
    expect(await env.contracts.parliament.read('isActiveSenateMember', [env.actors.citizen6])).toBe(false);
    expect(await env.contracts.parliament.read('isSenateMember', [env.actors.citizen6])).toBe(true);
  });

  it('expired Majlis member: cannot vote', async () => {
    await seatFullParliament(env);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'submitBill', [BILL_HASH, 'Tax Reform']);
    const majlisTermKey = await env.contracts.constitution.read('PARAM_MAJLIS_TERM');
    const majlisTerm = (await env.contracts.constitution.read('getParameter', [majlisTermKey])) as bigint;
    await warpForward(env.testClient, majlisTerm + 1n);
    env.currentTime += majlisTerm + 1n;
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
        'voteMajlis', [0n, true]),
      'NotMajlisMember',
    );
  });

  it('expired Majlis member: cannot submit bill', async () => {
    await seatFullParliament(env);
    const majlisTermKey = await env.contracts.constitution.read('PARAM_MAJLIS_TERM');
    const majlisTerm = (await env.contracts.constitution.read('getParameter', [majlisTermKey])) as bigint;
    await warpForward(env.testClient, majlisTerm + 1n);
    env.currentTime += majlisTerm + 1n;
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
        'submitBill', [BILL_HASH, 'Tax Reform']),
      'NotMajlisMember',
    );
  });

  it('expired Senate member: cannot vote', async () => {
    await seatFullParliament(env);
    const billId = await submitAndPassMajlis(env, BILL_HASH);
    const senateTermKey = await env.contracts.constitution.read('PARAM_SENATE_TERM');
    const senateTerm = (await env.contracts.constitution.read('getParameter', [senateTermKey])) as bigint;
    await warpForward(env.testClient, senateTerm + 1n);
    env.currentTime += senateTerm + 1n;
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen6, env.testClient,
        'voteSenate', [billId, true]),
      'NotSenateMember',
    );
  });

  it('isActiveMember: non-member returns false', async () => {
    expect(await env.contracts.parliament.read('isActiveMajlisMember', [unauthorized])).toBe(false);
    expect(await env.contracts.parliament.read('isActiveSenateMember', [unauthorized])).toBe(false);
  });

  // ── 18. BY-ELECTIONS ──────────────────────────────────────────────────

  it('removeMember: tracks vacancy', async () => {
    await seatFullParliament(env);
    expect(await env.contracts.parliament.read('majlisVacancyCount')).toBe(0n);
    await removeMemberViaCourt(env, env.actors.citizen1, 0);
    expect(await env.contracts.parliament.read('majlisVacancyCount')).toBe(1n);
  });

  it('claimByElectionTimeout: revert no vacancies', async () => {
    await seatFullParliament(env);
    await expectRevert(
      env.contracts.parliament.write('claimByElectionTimeout', [0]),
      'NoVacancies',
    );
  });

  it('claimByElectionTimeout: revert too early', async () => {
    await seatFullParliament(env);
    await removeMemberViaCourt(env, env.actors.citizen1, 0);
    await expectRevert(
      env.contracts.parliament.write('claimByElectionTimeout', [0]),
      'ByElectionDeadlineNotReached',
    );
  });

  it('seatMember: decrements vacancy', async () => {
    await seatFullParliament(env);
    await removeMemberViaCourt(env, env.actors.citizen1, 0);
    expect(await env.contracts.parliament.read('majlisVacancyCount')).toBe(1n);
    const newMember = makeAddr('newMajlis');
    await registerCitizens(env, [newMember]);
    await setBalance(env.testClient, newMember, 10000000000000000000n);
    await seatMajlis(env, newMember);
    expect(await env.contracts.parliament.read('majlisVacancyCount')).toBe(0n);
  });

  it('restoreMajlis: resets vacancies', async () => {
    await seatFullParliament(env);
    await removeMemberViaCourt(env, env.actors.citizen1, 0);
    expect(await env.contracts.parliament.read('majlisVacancyCount')).toBe(1n);
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'declareDissolution', []);
    await restoreMajlis(env);
    expect(await env.contracts.parliament.read('majlisVacancyCount')).toBe(0n);
  });

  // ── 18b. SIX-MONTH BY-ELECTION SKIP ──────────────────────────────────

  it('removeMember: near term end skips vacancy', async () => {
    await seatMajlis(env, env.actors.citizen1);
    const majlisTermKey = await env.contracts.constitution.read('PARAM_MAJLIS_TERM');
    const termLength = (await env.contracts.constitution.read('getParameter', [majlisTermKey])) as bigint;
    await warpForward(env.testClient, termLength - DAYS(90));
    env.currentTime += termLength - DAYS(90);
    await removeMemberViaCourt(env, env.actors.citizen1, 0);
    expect(await env.contracts.parliament.read('majlisVacancyCount')).toBe(0n);
  });

  it('removeMember: early in term creates vacancy', async () => {
    await seatMajlis(env, env.actors.citizen1);
    await warpForward(env.testClient, DAYS(30));
    env.currentTime += DAYS(30);
    await removeMemberViaCourt(env, env.actors.citizen1, 0);
    expect(await env.contracts.parliament.read('majlisVacancyCount')).toBe(1n);
  });

  it('removeSenator: near term end skips vacancy', async () => {
    await seatSenate(env, env.actors.citizen6);
    const senateTermKey = await env.contracts.constitution.read('PARAM_SENATE_TERM');
    const termLength = (await env.contracts.constitution.read('getParameter', [senateTermKey])) as bigint;
    await warpForward(env.testClient, termLength - DAYS(90));
    env.currentTime += termLength - DAYS(90);
    await removeMemberViaCourt(env, env.actors.citizen6, 1);
    expect(await env.contracts.parliament.read('senateVacancyCount')).toBe(0n);
  });

  // ── 19. SENATE STAGGER ────────────────────────────────────────────────

  it('initializeSenateStagger: happy case', async () => {
    await seatNineSenators(env);
    const senators = [env.actors.citizen6, env.actors.citizen7, sen3, sen4, sen5, sen6, sen7, sen8, sen9];
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'initializeSenateStagger', [senators]);
    expect(await env.contracts.parliament.read('senateStaggerInitialized')).toBe(true);
  });

  it('initializeSenateStagger: revert already initialized', async () => {
    await seatNineSenators(env);
    const senators = [env.actors.citizen6, env.actors.citizen7, sen3, sen4, sen5, sen6, sen7, sen8, sen9];
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'initializeSenateStagger', [senators]);
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'initializeSenateStagger', [senators]),
      'StaggerAlreadyInitialized',
    );
  });

  it('initializeSenateStagger: revert non-senator', async () => {
    await seatNineSenators(env);
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'initializeSenateStagger', [[unauthorized]]),
      'NotActiveMember',
    );
  });

  it('initializeSenateStagger: onlyCrown modifier', async () => {
    await seatNineSenators(env);
    const senators = [env.actors.citizen6, env.actors.citizen7, sen3, sen4, sen5, sen6, sen7, sen8, sen9];
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, unauthorized, env.testClient,
        'initializeSenateStagger', [senators]),
      'NotAuthorized',
    );
  });

  it('stagger: sixYear all expire', async () => {
    await seatNineSenators(env);
    const senators = [env.actors.citizen6, env.actors.citizen7, sen3, sen4, sen5, sen6, sen7, sen8, sen9];
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'initializeSenateStagger', [senators]);
    await warpForward(env.testClient, BigInt(6 * 365 * 86400) + 1n);
    env.currentTime += BigInt(6 * 365 * 86400) + 1n;
    for (const s of senators) {
      expect(await env.contracts.parliament.read('isActiveSenateMember', [s])).toBe(false);
    }
  });

  // ── 20. SEAT WITH PROVINCE TRACKING ──────────────────────────────────

  it('seatSenatorWithProvince: happy case', async () => {
    await seatSenatorWithProvince(env, env.actors.citizen6, 2);
    expect(await env.contracts.parliament.read('isSenateMember', [env.actors.citizen6])).toBe(true);
    expect(Number(await env.contracts.parliament.read('senatorProvince', [env.actors.citizen6]))).toBe(2);
  });

  it('seatSenatorWithProvince: onlyProvincialCouncil modifier', async () => {
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, unauthorized, env.testClient,
        'seatSenatorWithProvince', [env.actors.citizen6, 2]),
      'NotAuthorized',
    );
  });

  it('seatMajlisMemberWithProvince: happy case', async () => {
    await seatMajlisWithProvince(env, env.actors.citizen1, 1);
    expect(await env.contracts.parliament.read('isMajlisMember', [env.actors.citizen1])).toBe(true);
    expect(Number(await env.contracts.parliament.read('majlisMemberProvince', [env.actors.citizen1]))).toBe(1);
  });

  it('majlisElectionSeated: restores dissolution', async () => {
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'declareDissolution', []);
    expect(await env.contracts.parliament.read('dissolved')).toBe(true);
    await majlisElectionSeated(env);
    expect(await env.contracts.parliament.read('dissolved')).toBe(false);
  });

  it('majlisElectionSeated: onlyElection modifier', async () => {
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, unauthorized, env.testClient,
        'majlisElectionSeated', []),
      'NotAuthorized',
    );
  });

  it('submitBudgetBill: happy case', async () => {
    await seatFullParliament(env);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'submitBudgetBill', [BUDGET_HASH, 'Annual Budget']);
    expect(await env.contracts.parliament.read('billCount')).toBe(1n);
  });

  // ── 21. GOVERNANCE ACTIONS ────────────────────────────────────────────

  it('proposeGovernanceAction: Majlis', async () => {
    await seatFullParliament(env);
    const majlisTermKey = keccak256(toHex('MAJLIS_TERM'));
    const data = encodeFunctionData({
      abi: env.contracts.constitution.artifact.abi as any,
      functionName: 'getParameter',
      args: [majlisTermKey],
    });
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'proposeGovernanceAction', [env.addresses.constitution, data, 0, 50, keccak256(toHex('test action'))]);
    expect(await env.contracts.parliament.read('governanceActionCount')).toBe(1n);
  });

  it('governanceAction: full cycle Majlis', async () => {
    await seatFullParliament(env);
    const majlisTermKey = keccak256(toHex('MAJLIS_TERM'));
    const data = encodeFunctionData({
      abi: env.contracts.constitution.artifact.abi as any,
      functionName: 'getParameter',
      args: [majlisTermKey],
    });
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'proposeGovernanceAction', [env.addresses.constitution, data, 0, 50, keccak256(toHex('test action'))]);
    const actionId = 0n;
    for (const v of [env.actors.citizen1, env.actors.citizen2, env.actors.citizen3]) {
      await writeAs(env.contracts.parliament, env.publicClient, v, env.testClient,
        'voteOnGovernanceAction', [actionId, true]);
    }
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.parliament.write('finalizeGovernanceAction', [actionId]);
    await env.contracts.parliament.write('executeGovernanceAction', [actionId]);
  });

  it('governanceAction: full cycle Senate', async () => {
    await seatFullParliament(env);
    const majlisTermKey = keccak256(toHex('MAJLIS_TERM'));
    const data = encodeFunctionData({
      abi: env.contracts.constitution.artifact.abi as any,
      functionName: 'getParameter',
      args: [majlisTermKey],
    });
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen6, env.testClient,
      'proposeGovernanceAction', [env.addresses.constitution, data, 1, 50, keccak256(toHex('senate action'))]);
    const actionId = 0n;
    for (const v of [env.actors.citizen6, env.actors.citizen7]) {
      await writeAs(env.contracts.parliament, env.publicClient, v, env.testClient,
        'voteOnGovernanceAction', [actionId, true]);
    }
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.parliament.write('finalizeGovernanceAction', [actionId]);
    await env.contracts.parliament.write('executeGovernanceAction', [actionId]);
  });

  it('governanceAction: fails, cannot execute', async () => {
    await seatFullParliament(env);
    const majlisTermKey = keccak256(toHex('MAJLIS_TERM'));
    const data = encodeFunctionData({
      abi: env.contracts.constitution.artifact.abi as any,
      functionName: 'getParameter',
      args: [majlisTermKey],
    });
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'proposeGovernanceAction', [env.addresses.constitution, data, 0, 50, keccak256(toHex('test action'))]);
    const actionId = 0n;
    for (const v of [env.actors.citizen1, env.actors.citizen2, env.actors.citizen3]) {
      await writeAs(env.contracts.parliament, env.publicClient, v, env.testClient,
        'voteOnGovernanceAction', [actionId, false]);
    }
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.parliament.write('finalizeGovernanceAction', [actionId]);
    await expectRevert(
      env.contracts.parliament.write('executeGovernanceAction', [actionId]),
      'ActionNotPassed',
    );
  });

  it('proposeGovernanceAction: revert invalid target', async () => {
    await seatFullParliament(env);
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
        'proposeGovernanceAction', [makeAddr('unregistered'), '0x', 0, 50, keccak256(toHex('bad target'))]),
      'InvalidTarget',
    );
  });

  it('proposeGovernanceAction: revert invalid threshold', async () => {
    await seatFullParliament(env);
    const majlisTermKey = keccak256(toHex('MAJLIS_TERM'));
    const data = encodeFunctionData({
      abi: env.contracts.constitution.artifact.abi as any,
      functionName: 'getParameter',
      args: [majlisTermKey],
    });
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
        'proposeGovernanceAction', [env.addresses.constitution, data, 0, 40, keccak256(toHex('bad threshold'))]),
      'InvalidThreshold',
    );
  });

  it('voteOnGovernanceAction: revert already voted', async () => {
    await seatFullParliament(env);
    const majlisTermKey = keccak256(toHex('MAJLIS_TERM'));
    const data = encodeFunctionData({
      abi: env.contracts.constitution.artifact.abi as any,
      functionName: 'getParameter',
      args: [majlisTermKey],
    });
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'proposeGovernanceAction', [env.addresses.constitution, data, 0, 50, keccak256(toHex('test'))]);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'voteOnGovernanceAction', [0n, true]);
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
        'voteOnGovernanceAction', [0n, true]),
      'AlreadyVoted',
    );
  });

  it('finalizeGovernanceAction: revert too early', async () => {
    await seatFullParliament(env);
    const majlisTermKey = keccak256(toHex('MAJLIS_TERM'));
    const data = encodeFunctionData({
      abi: env.contracts.constitution.artifact.abi as any,
      functionName: 'getParameter',
      args: [majlisTermKey],
    });
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'proposeGovernanceAction', [env.addresses.constitution, data, 0, 50, keccak256(toHex('test'))]);
    for (const v of [env.actors.citizen1, env.actors.citizen2, env.actors.citizen3]) {
      await writeAs(env.contracts.parliament, env.publicClient, v, env.testClient,
        'voteOnGovernanceAction', [0n, true]);
    }
    await expectRevert(
      env.contracts.parliament.write('finalizeGovernanceAction', [0n]),
      'VotingPeriodNotElapsed',
    );
  });

  it('proposeGovernanceAction: onlyMember modifier', async () => {
    await seatFullParliament(env);
    const majlisTermKey = keccak256(toHex('MAJLIS_TERM'));
    const data = encodeFunctionData({
      abi: env.contracts.constitution.artifact.abi as any,
      functionName: 'getParameter',
      args: [majlisTermKey],
    });
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, unauthorized, env.testClient,
        'proposeGovernanceAction', [env.addresses.constitution, data, 0, 50, keccak256(toHex('unauth'))]),
      'NotMajlisMember',
    );
  });

  it('proposeGovernanceAction: revert dissolved', async () => {
    await seatFullParliament(env);
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'declareDissolution', []);
    const majlisTermKey = keccak256(toHex('MAJLIS_TERM'));
    const data = encodeFunctionData({
      abi: env.contracts.constitution.artifact.abi as any,
      functionName: 'getParameter',
      args: [majlisTermKey],
    });
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
        'proposeGovernanceAction', [env.addresses.constitution, data, 0, 50, keccak256(toHex('dissolved'))]),
      'MajlisDissolved',
    );
  });

  it('executeGovernanceAction: revert already executed', async () => {
    await seatFullParliament(env);
    const majlisTermKey = keccak256(toHex('MAJLIS_TERM'));
    const data = encodeFunctionData({
      abi: env.contracts.constitution.artifact.abi as any,
      functionName: 'getParameter',
      args: [majlisTermKey],
    });
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'proposeGovernanceAction', [env.addresses.constitution, data, 0, 50, keccak256(toHex('test'))]);
    for (const v of [env.actors.citizen1, env.actors.citizen2, env.actors.citizen3]) {
      await writeAs(env.contracts.parliament, env.publicClient, v, env.testClient,
        'voteOnGovernanceAction', [0n, true]);
    }
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.parliament.write('finalizeGovernanceAction', [0n]);
    await env.contracts.parliament.write('executeGovernanceAction', [0n]);
    await expectRevert(
      env.contracts.parliament.write('executeGovernanceAction', [0n]),
      'ActionNotPassed',
    );
  });

  it('finalizeGovernanceAction: revert quorum not met', async () => {
    await seatFullParliament(env);
    const majlisTermKey = keccak256(toHex('MAJLIS_TERM'));
    const data = encodeFunctionData({
      abi: env.contracts.constitution.artifact.abi as any,
      functionName: 'getParameter',
      args: [majlisTermKey],
    });
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'proposeGovernanceAction', [env.addresses.constitution, data, 0, 50, keccak256(toHex('test'))]);
    // Only 1 vote out of 5 (quorum 50% = need 3)
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'voteOnGovernanceAction', [0n, true]);
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await expectRevert(
      env.contracts.parliament.write('finalizeGovernanceAction', [0n]),
      'QuorumNotMet',
    );
  });

  // ── VACANCY DECLARATION ───────────────────────────────────────────────

  it('proposeVacancy: happy case', async () => {
    await seatFullParliament(env);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'proposeVacancy', [env.actors.citizen3, 0]);
    expect(await env.contracts.parliament.read('vacancyProposalCount')).toBe(1n);
  });

  it('vacancyDeclaration: full flow approved', async () => {
    await seatFullParliament(env);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'proposeVacancy', [env.actors.citizen3, 0]);
    const vacId = 0n;
    for (const v of [env.actors.citizen1, env.actors.citizen2, env.actors.citizen4]) {
      await writeAs(env.contracts.parliament, env.publicClient, v, env.testClient,
        'voteOnVacancy', [vacId, true]);
    }
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen5, env.testClient,
      'voteOnVacancy', [vacId, false]);
    const votePeriodKey = await env.contracts.constitution.read('PARAM_VACANCY_VOTE_PERIOD');
    const votePeriod = (await env.contracts.constitution.read('getParameter', [votePeriodKey])) as bigint;
    await warpForward(env.testClient, votePeriod);
    env.currentTime += votePeriod;
    await env.contracts.parliament.write('finalizeVacancy', [vacId]);
    expect(await env.contracts.parliament.read('isMajlisMember', [env.actors.citizen3])).toBe(false);
    expect(await env.contracts.parliament.read('majlisMemberCount')).toBe(4n);
  });

  it('vacancyDeclaration: rejected', async () => {
    await seatFullParliament(env);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'proposeVacancy', [env.actors.citizen3, 0]);
    const vacId = 0n;
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'voteOnVacancy', [vacId, true]);
    for (const v of [env.actors.citizen2, env.actors.citizen4, env.actors.citizen5]) {
      await writeAs(env.contracts.parliament, env.publicClient, v, env.testClient,
        'voteOnVacancy', [vacId, false]);
    }
    const votePeriodKey = await env.contracts.constitution.read('PARAM_VACANCY_VOTE_PERIOD');
    const votePeriod = (await env.contracts.constitution.read('getParameter', [votePeriodKey])) as bigint;
    await warpForward(env.testClient, votePeriod);
    env.currentTime += votePeriod;
    await env.contracts.parliament.write('finalizeVacancy', [vacId]);
    expect(await env.contracts.parliament.read('isMajlisMember', [env.actors.citizen3])).toBe(true);
    expect(await env.contracts.parliament.read('majlisMemberCount')).toBe(5n);
  });

  it('voteOnVacancy: target cannot vote', async () => {
    await seatFullParliament(env);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'proposeVacancy', [env.actors.citizen3, 0]);
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen3, env.testClient,
        'voteOnVacancy', [0n, true]),
      'NotAuthorized',
    );
  });

  it('finalizeVacancy: revert too early', async () => {
    await seatFullParliament(env);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'proposeVacancy', [env.actors.citizen3, 0]);
    await expectRevert(
      env.contracts.parliament.write('finalizeVacancy', [0n]),
      'VacancyVotingNotElapsed',
    );
  });

  it('proposeVacancy: revert duplicate', async () => {
    await seatFullParliament(env);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'proposeVacancy', [env.actors.citizen3, 0]);
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen2, env.testClient,
        'proposeVacancy', [env.actors.citizen3, 0]),
      'VacancyAlreadyProposed',
    );
  });

  it('vacancyDeclaration: senate', async () => {
    await seatFullParliament(env);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen6, env.testClient,
      'proposeVacancy', [env.actors.citizen7, 1]);
    const vacId = 0n;
    for (const v of [env.actors.citizen6, sen3]) {
      await writeAs(env.contracts.parliament, env.publicClient, v, env.testClient,
        'voteOnVacancy', [vacId, true]);
    }
    const votePeriodKey = await env.contracts.constitution.read('PARAM_VACANCY_VOTE_PERIOD');
    const votePeriod = (await env.contracts.constitution.read('getParameter', [votePeriodKey])) as bigint;
    await warpForward(env.testClient, votePeriod);
    env.currentTime += votePeriod;
    await env.contracts.parliament.write('finalizeVacancy', [vacId]);
    expect(await env.contracts.parliament.read('isSenateMember', [env.actors.citizen7])).toBe(false);
    expect(await env.contracts.parliament.read('senateMemberCount')).toBe(2n);
  });

  it('voteOnVacancy: revert invalid id', async () => {
    await seatFullParliament(env);
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
        'voteOnVacancy', [999n, true]),
      'InvalidVacancyId',
    );
  });

  it('finalizeVacancy: revert invalid id', async () => {
    await seatFullParliament(env);
    await expectRevert(
      env.contracts.parliament.write('finalizeVacancy', [999n]),
      'InvalidVacancyId',
    );
  });

  it('effectiveCounts: without incapacity', async () => {
    await seatFullParliament(env);
    expect(await env.contracts.parliament.read('effectiveMajlisMemberCount')).toBe(5n);
    expect(await env.contracts.parliament.read('effectiveSenateMemberCount')).toBe(3n);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. ParliamentCaretakerTest
// ═══════════════════════════════════════════════════════════════════════════════

describe('Parliament: Caretaker (MixinCaretaker)', () => {
  let env: GovTestEnv;
  let snapshotId: `0x${string}`;

  beforeAll(async () => {
    env = await setupGovBase();
    await setupMajlis(env);
    await setupCaretaker(env);
    snapshotId = await env.testClient.snapshot();
  }, 120_000);

  beforeEach(async () => {
    await env.testClient.revert({ id: snapshotId });
    snapshotId = await env.testClient.snapshot();
  });

  it('submitBill: revert during caretaker mode', async () => {
    expect(await env.contracts.executive.read('isCaretaker')).toBe(true);
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
        'submitBill', [BILL_HASH, 'Caretaker bill']),
      'CaretakerModeActive',
    );
  });

  it('submitBudgetBill: allowed during caretaker', async () => {
    expect(await env.contracts.executive.read('isCaretaker')).toBe(true);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'submitBudgetBill', [BUDGET_HASH, 'Emergency supply']);
    expect(await env.contracts.parliament.read('billCount')).toBe(1n);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. ParliamentGovernmentTest — CrownNotSuspended guards
// ═══════════════════════════════════════════════════════════════════════════════

describe('Parliament: Government (CrownNotSuspended guards)', () => {
  let env: SenateEnv;
  let snapshotId: `0x${string}`;

  beforeAll(async () => {
    env = await setupGovBase() as any;
    await setupMajlis(env);
    await setupGovernment(env);
    const senateEnv = await setupSenate(env);
    Object.assign(env, senateEnv);
    snapshotId = await env.testClient.snapshot();
  }, 120_000);

  beforeEach(async () => {
    await env.testClient.revert({ id: snapshotId });
    snapshotId = await env.testClient.snapshot();
  });

  it('returnLawDuringSuspension: revert Crown not suspended', async () => {
    const billId = await submitAndPassMajlis(env, keccak256(toHex('Government Bill')));
    await passSenate(env, billId);
    expect(await env.contracts.crown.read('suspended')).toBe(false);
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, env.actors.pmCandidate, env.testClient,
        'returnLawDuringSuspension', [billId]),
      'CrownNotSuspended',
    );
  });

  it('referToCourtDuringSuspension: revert Crown not suspended', async () => {
    const billId = await submitAndPassMajlis(env, keccak256(toHex('Government Bill')));
    await passSenate(env, billId);
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, env.actors.pmCandidate, env.testClient,
        'referToCourtDuringSuspension', [billId]),
      'CrownNotSuspended',
    );
  });

  it('initiateFormationDuringSuspension: revert Crown not suspended', async () => {
    expect(await env.contracts.crown.read('suspended')).toBe(false);
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, env.senators[0], env.testClient,
        'initiateFormationDuringSuspension', []),
      'CrownNotSuspended',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. ParliamentIncapacityTest — MixinGovernment + MixinJustices
// ═══════════════════════════════════════════════════════════════════════════════

describe('Parliament: Incapacity (MixinGovernment + MixinJustices)', () => {
  let env: JusticesEnv;
  let snapshotId: `0x${string}`;

  async function certifyIncapacity(member: Address): Promise<void> {
    const factHash = keccak256(encodePacked(['string', 'address'], ['MEMBER_INCAPACITATED', member]));
    await certifyFact(env, factHash);
  }

  beforeAll(async () => {
    env = await setupGovBase() as any;
    await setupMajlis(env);
    await setupGovernment(env);
    const senateEnv = await setupSenate(env);
    const justicesEnv = await setupJustices(senateEnv);
    Object.assign(env, senateEnv, justicesEnv);
    snapshotId = await env.testClient.snapshot();
  }, 180_000);

  beforeEach(async () => {
    await env.testClient.revert({ id: snapshotId });
    snapshotId = await env.testClient.snapshot();
  });

  it('acknowledgeIncapacity: Majlis member', async () => {
    await certifyIncapacity(env.actors.citizen3);
    await env.contracts.parliament.write('acknowledgeIncapacity', [env.actors.citizen3, 0]);
    expect(await env.contracts.parliament.read('isIncapacitated', [env.actors.citizen3])).toBe(true);
    expect(await env.contracts.parliament.read('incapacitatedMajlisCount')).toBe(1n);
    expect(await env.contracts.parliament.read('isActiveMajlisMember', [env.actors.citizen3])).toBe(false);
    expect(await env.contracts.parliament.read('isMajlisMember', [env.actors.citizen3])).toBe(true);
    expect(await env.contracts.parliament.read('effectiveMajlisMemberCount')).toBe(4n);
  });

  it('acknowledgeIncapacity: revert no certification', async () => {
    await expectRevert(
      env.contracts.parliament.write('acknowledgeIncapacity', [env.actors.citizen3, 0]),
      'IncapacityNotCertified',
    );
  });

  it('acknowledgeIncapacity: revert already incapacitated', async () => {
    await certifyIncapacity(env.actors.citizen3);
    await env.contracts.parliament.write('acknowledgeIncapacity', [env.actors.citizen3, 0]);
    await expectRevert(
      env.contracts.parliament.write('acknowledgeIncapacity', [env.actors.citizen3, 0]),
      'AlreadyIncapacitated',
    );
  });

  it('finalizeMajlisVote: uses effective count', async () => {
    await certifyIncapacity(env.actors.citizen5);
    await env.contracts.parliament.write('acknowledgeIncapacity', [env.actors.citizen5, 0]);
    // 5 total, 1 incapacitated, 4 effective. 50% quorum = 2 votes needed.
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'submitBill', [BILL_HASH, 'Test bill']);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
      'voteMajlis', [0n, true]);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen2, env.testClient,
      'voteMajlis', [0n, true]);
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.parliament.write('finalizeMajlisVote', [0n]);
    expect(await env.contracts.parliament.read('getBillStatus', [0n])).toBe(BillStatus.SenateReview);
  });

  it('removeMember: clears incapacity', async () => {
    await certifyIncapacity(env.actors.citizen5);
    await env.contracts.parliament.write('acknowledgeIncapacity', [env.actors.citizen5, 0]);
    expect(await env.contracts.parliament.read('incapacitatedMajlisCount')).toBe(1n);
    await removeMemberViaCourt(env, env.actors.citizen5, 0);
    expect(await env.contracts.parliament.read('incapacitatedMajlisCount')).toBe(0n);
    expect(await env.contracts.parliament.read('effectiveMajlisMemberCount')).toBe(4n);
  });

  it('expireMember: clears incapacity', async () => {
    await certifyIncapacity(env.actors.citizen5);
    await env.contracts.parliament.write('acknowledgeIncapacity', [env.actors.citizen5, 0]);
    expect(await env.contracts.parliament.read('incapacitatedMajlisCount')).toBe(1n);
    const termKey = await env.contracts.constitution.read('PARAM_MAJLIS_TERM');
    const termLength = (await env.contracts.constitution.read('getParameter', [termKey])) as bigint;
    await warpForward(env.testClient, termLength + 1n);
    env.currentTime += termLength + 1n;
    await env.contracts.parliament.write('expireMember', [env.actors.citizen5, 0]);
    expect(await env.contracts.parliament.read('incapacitatedMajlisCount')).toBe(0n);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. ParliamentSuspensionTest — MixinGovernment + MixinCrownSuspension
// ═══════════════════════════════════════════════════════════════════════════════

describe('Parliament: Suspension (MixinCrownSuspension)', () => {
  let env: JusticesEnv;
  let snapshotId: `0x${string}`;

  beforeAll(async () => {
    env = await setupGovBase() as any;
    await setupMajlis(env);
    await setupGovernment(env);
    const senateEnv = await setupSenate(env);
    const justicesEnv = await setupJustices(senateEnv);
    Object.assign(env, senateEnv, justicesEnv);
    await setupCrownSuspension(env);
    snapshotId = await env.testClient.snapshot();
  }, 180_000);

  beforeEach(async () => {
    await env.testClient.revert({ id: snapshotId });
    snapshotId = await env.testClient.snapshot();
  });

  it('precondition: Crown is suspended', async () => {
    expect(await env.contracts.crown.read('suspended')).toBe(true);
  });

  it('returnLawDuringSuspension: PM returns bill', async () => {
    const billId = await submitAndPassMajlis(env, keccak256(toHex('Suspension Bill')));
    await passSenate(env, billId);
    expect(await env.contracts.parliament.read('getBillStatus', [billId])).toBe(BillStatus.CrownAction);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.pmCandidate, env.testClient,
      'returnLawDuringSuspension', [billId]);
    expect(await env.contracts.parliament.read('getBillStatus', [billId])).toBe(BillStatus.Returned);
  });

  it('returnLawDuringSuspension: revert not PM', async () => {
    const billId = await submitAndPassMajlis(env, keccak256(toHex('Suspension Bill')));
    await passSenate(env, billId);
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, unauthorized, env.testClient,
        'returnLawDuringSuspension', [billId]),
      'NotPrimeMinister',
    );
  });

  it('initiateFormationDuringSuspension: senator initiates', async () => {
    expect(await env.contracts.crown.read('suspended')).toBe(true);
    await writeAs(env.contracts.parliament, env.publicClient, (env as any).senators[0], env.testClient,
      'initiateFormationDuringSuspension', []);
  });

  it('initiateFormationDuringSuspension: revert not senator', async () => {
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, unauthorized, env.testClient,
        'initiateFormationDuringSuspension', []),
      'NotSenateMember',
    );
  });

  it('referToCourtDuringSuspension: PM refers after return + re-adoption', async () => {
    const billId = await submitAndPassMajlis(env, keccak256(toHex('Suspension Bill')));
    await passSenate(env, billId);
    // PM returns
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.pmCandidate, env.testClient,
      'returnLawDuringSuspension', [billId]);
    // Majlis re-adopts
    for (const v of [env.actors.citizen1, env.actors.citizen2, env.actors.citizen3]) {
      await writeAs(env.contracts.parliament, env.publicClient, v, env.testClient,
        'voteMajlis', [billId, true]);
    }
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.parliament.write('finalizeMajlisVote', [billId]);
    // PM refers to Court
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.pmCandidate, env.testClient,
      'referToCourtDuringSuspension', [billId]);
    expect(await env.contracts.parliament.read('getBillStatus', [billId])).toBe(BillStatus.Referred);
  });

  it('referToCourtDuringSuspension: revert not PM', async () => {
    const billId = await submitAndPassMajlis(env, keccak256(toHex('Suspension Bill')));
    await passSenate(env, billId);
    await writeAs(env.contracts.parliament, env.publicClient, env.actors.pmCandidate, env.testClient,
      'returnLawDuringSuspension', [billId]);
    for (const v of [env.actors.citizen1, env.actors.citizen2, env.actors.citizen3]) {
      await writeAs(env.contracts.parliament, env.publicClient, v, env.testClient,
        'voteMajlis', [billId, true]);
    }
    await warpForward(env.testClient, DAYS(3));
    env.currentTime += DAYS(3);
    await env.contracts.parliament.write('finalizeMajlisVote', [billId]);
    await expectRevert(
      writeAs(env.contracts.parliament, env.publicClient, env.actors.citizen1, env.testClient,
        'referToCourtDuringSuspension', [billId]),
      'NotPrimeMinister',
    );
  });
});
