/**
 * SupremeCourt RPC tests — TypeScript port of SupremeCourt.t.sol
 *
 * Five test contracts:
 * 1. Appointment — MixinGovernment + MixinSenate: justice nomination pipeline
 * 2. Judicial — MixinGovernment + MixinJustices: reviews, disputes, facts, liveness
 * 3. Petition — MixinMajlis + MixinSenate: collective petitions
 * 4. Caretaker — MixinCaretaker: nomination blocked
 * 5. Suspension — MixinGovernment + MixinCrownSuspension: PM nomination during suspension
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { type Address, keccak256, toHex, encodePacked } from 'viem';
import { setupGovBase, writeAs, contractAs, walletForAddress, type GovTestEnv } from '../setup/fixtures.js';
import {
  setupMajlis, setupGovernment, setupSenate, setupJustices, setupCaretaker,
  setupCrownSuspension, executeMajlisAction, executeSenateAction, prepareSenateAction,
  certifyFact, type SenateEnv, type JusticesEnv,
} from '../setup/mixins.js';
import { makeAddr, expectRevert } from '../setup/testUtils.js';
import { asAccount, warpForward, DAYS } from '../../src/client/AnvilHelpers.js';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. APPOINTMENT — Crown nominations + Senate confirmations
// ═══════════════════════════════════════════════════════════════════════════════

describe('SupremeCourt: Appointment (MixinGovernment + MixinSenate)', () => {
  let env: SenateEnv;
  let snapshot: `0x${string}`;
  const justiceAddrs: Address[] = [];
  const unauthorized = makeAddr('unauthorized');

  for (let i = 0; i < 12; i++) {
    justiceAddrs.push(`0x${(3000 + i).toString(16).padStart(40, '0')}` as Address);
  }

  // Helpers
  async function appointJustice(seat: number): Promise<void> {
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominateJustice', [justiceAddrs[seat], seat]);
    const confirmData = env.contracts.court.encode('confirmNominee', [seat]);
    await executeSenateAction(env, env.addresses.court, confirmData);
  }

  async function rejectNominee(seat: number): Promise<void> {
    const rejectData = env.contracts.court.encode('rejectNominee', [seat]);
    await executeSenateAction(env, env.addresses.court, rejectData);
  }

  async function proposeSenateList(seat: number, candidates: [Address, Address, Address]): Promise<void> {
    const data = env.contracts.court.encode('proposeSenateList', [seat, candidates]);
    await executeSenateAction(env, env.addresses.court, data);
  }

  beforeAll(async () => {
    const base = await setupGovBase();
    await setupMajlis(base);
    await setupGovernment(base);
    const senateEnv = await setupSenate(base);
    env = senateEnv;
    snapshot = await env.testClient.snapshot();
  }, 60_000);

  beforeEach(async () => {
    await env.testClient.revert({ id: snapshot });
    snapshot = await env.testClient.snapshot();
  });

  // ── Happy Paths ──────────────────────────────────────────────────────

  it('appointJustice: happy case', async () => {
    await appointJustice(0);
    expect(await env.contracts.court.read('isActiveJustice', [justiceAddrs[0]])).toBe(true);
    expect(await env.contracts.court.read('activeJusticeCount')).toBe(1n);
  });

  it('appointJustice: emits event (state verified)', async () => {
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominateJustice', [justiceAddrs[0], 0]);
    const confirmData = env.contracts.court.encode('confirmNominee', [0]);
    await executeSenateAction(env, env.addresses.court, confirmData);
    expect(await env.contracts.court.read('isActiveJustice', [justiceAddrs[0]])).toBe(true);
  });

  it('appointAll12: all 12 seats', async () => {
    for (let i = 0; i < 12; i++) {
      await appointJustice(i);
    }
    expect(await env.contracts.court.read('activeJusticeCount')).toBe(12n);
  });

  it('executiveCanNominate: PM can nominate via executePMAction', async () => {
    const nomData = env.contracts.court.encode('nominateJustice', [justiceAddrs[0], 0]);
    await writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
      'executePMAction', [env.addresses.court, nomData]);
    const stage = await env.contracts.court.read('getAppointmentStage', [0]);
    expect(Number(stage)).toBe(1); // CrownNom1
  });

  it('removeExpiredJustice: after term expires', async () => {
    await appointJustice(0);
    const termKey = await env.contracts.constitution.read('PARAM_JUSTICE_TERM');
    const termLength = (await env.contracts.constitution.read('getParameter', [termKey])) as bigint;
    await warpForward(env.testClient, termLength + 1n);
    await env.contracts.court.write('removeExpiredJustice', [0]);
    expect(await env.contracts.court.read('isActiveJustice', [justiceAddrs[0]])).toBe(false);
    expect(await env.contracts.court.read('activeJusticeCount')).toBe(0n);
  });

  it('replaceJustice: remove expired + timeout path appoints replacement', async () => {
    await appointJustice(0);
    const termKey = await env.contracts.constitution.read('PARAM_JUSTICE_TERM');
    const termLength = (await env.contracts.constitution.read('getParameter', [termKey])) as bigint;
    await warpForward(env.testClient, termLength + 1n);
    await env.contracts.court.write('removeExpiredJustice', [0]);

    const newJustice = makeAddr('newJustice');
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominateJustice', [newJustice, 0]);

    const senateReviewKey = await env.contracts.constitution.read('PARAM_SENATE_REVIEW_PERIOD');
    const senatePeriod = (await env.contracts.constitution.read('getParameter', [senateReviewKey])) as bigint;
    await warpForward(env.testClient, senatePeriod);
    await env.contracts.court.write('claimAppointmentTimeout', [0]);

    expect(await env.contracts.court.read('isActiveJustice', [newJustice])).toBe(true);
    expect(await env.contracts.court.read('activeJusticeCount')).toBe(1n);
  });

  // ── Full Rejection Cascade ───────────────────────────────────────────

  it('fullRejectionCascade: nom1 → reject → nom2 → reject → list → crown picks', async () => {
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominateJustice', [justiceAddrs[0], 0]);
    await rejectNominee(0);

    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominateJusticeSecond', [justiceAddrs[1], 0]);
    await rejectNominee(0);

    const candidates: [Address, Address, Address] = [justiceAddrs[2], justiceAddrs[3], justiceAddrs[4]];
    await proposeSenateList(0, candidates);

    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'appointJusticeFromList', [0, 1]);

    expect(await env.contracts.court.read('isActiveJustice', [justiceAddrs[3]])).toBe(true);
    expect(await env.contracts.court.read('activeJusticeCount')).toBe(1n);
  });

  // ── Timeouts ──────────────────────────────────────────────────────────

  it('senateTimeout: deemed confirmed', async () => {
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominateJustice', [justiceAddrs[0], 0]);
    const senateReviewKey = await env.contracts.constitution.read('PARAM_SENATE_REVIEW_PERIOD');
    const senatePeriod = (await env.contracts.constitution.read('getParameter', [senateReviewKey])) as bigint;
    await warpForward(env.testClient, senatePeriod);
    await env.contracts.court.write('claimAppointmentTimeout', [0]);
    expect(await env.contracts.court.read('isActiveJustice', [justiceAddrs[0]])).toBe(true);
  });

  it('crownNom2Timeout: advances to SenateList', async () => {
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominateJustice', [justiceAddrs[0], 0]);
    await rejectNominee(0);

    const nomDeadlineKey = await env.contracts.constitution.read('PARAM_NOMINATION_DEADLINE');
    const nomDeadline = (await env.contracts.constitution.read('getParameter', [nomDeadlineKey])) as bigint;
    await warpForward(env.testClient, nomDeadline);
    await env.contracts.court.write('claimAppointmentTimeout', [0]);

    const stage = await env.contracts.court.read('getAppointmentStage', [0]);
    expect(Number(stage)).toBe(3); // SenateList
  });

  it('crownListTimeout: first-ranked auto-appointed', async () => {
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominateJustice', [justiceAddrs[0], 0]);
    await rejectNominee(0);
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominateJusticeSecond', [justiceAddrs[1], 0]);
    await rejectNominee(0);

    const candidates: [Address, Address, Address] = [justiceAddrs[2], justiceAddrs[3], justiceAddrs[4]];
    await proposeSenateList(0, candidates);

    const crownDeadlineKey = await env.contracts.constitution.read('PARAM_CROWN_LAW_DEADLINE');
    const crownDeadline = (await env.contracts.constitution.read('getParameter', [crownDeadlineKey])) as bigint;
    await warpForward(env.testClient, crownDeadline);
    await env.contracts.court.write('claimAppointmentTimeout', [0]);

    expect(await env.contracts.court.read('isActiveJustice', [justiceAddrs[2]])).toBe(true);
  });

  it('senateListTimeout: Crown appoints previous nominee', async () => {
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominateJustice', [justiceAddrs[0], 0]);
    await rejectNominee(0);
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominateJusticeSecond', [justiceAddrs[1], 0]);
    await rejectNominee(0);

    const senateReviewKey = await env.contracts.constitution.read('PARAM_SENATE_REVIEW_PERIOD');
    const senatePeriod = (await env.contracts.constitution.read('getParameter', [senateReviewKey])) as bigint;
    await warpForward(env.testClient, senatePeriod);
    await env.contracts.court.write('claimAppointmentTimeout', [0]);

    expect(await env.contracts.court.read('isActiveJustice', [justiceAddrs[0]])).toBe(true);
  });

  // ── Reverts ───────────────────────────────────────────────────────────

  it('revert: nominateJustice alreadyJustice', async () => {
    await appointJustice(0);
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'nominateJustice', [justiceAddrs[0], 1]),
      'AlreadyJustice',
    );
  });

  it('boundary: nominateJustice seatOutOfRange', async () => {
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'nominateJustice', [justiceAddrs[0], 12]),
      'CourtFull',
    );
  });

  it('revert: nominateJustice seatOccupied', async () => {
    await appointJustice(0);
    const newJustice = makeAddr('newJustice');
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'nominateJustice', [newJustice, 0]),
      'SeatOccupied',
    );
  });

  it('revert: removeExpiredJustice termNotExpired', async () => {
    await appointJustice(0);
    await expectRevert(
      env.contracts.court.write('removeExpiredJustice', [0]),
      'TermNotExpired',
    );
  });

  it('revert: nonRenewable — same person cannot serve again', async () => {
    await appointJustice(0);
    const termKey = await env.contracts.constitution.read('PARAM_JUSTICE_TERM');
    const termLength = (await env.contracts.constitution.read('getParameter', [termKey])) as bigint;
    await warpForward(env.testClient, termLength + 1n);
    await env.contracts.court.write('removeExpiredJustice', [0]);

    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'nominateJustice', [justiceAddrs[0], 0]),
      'PreviouslyServed',
    );
  });

  it('revert: claimTimeout tooEarly', async () => {
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominateJustice', [justiceAddrs[0], 0]);
    await expectRevert(
      env.contracts.court.write('claimAppointmentTimeout', [0]),
      'DeadlineNotExpired',
    );
  });

  it('revert: proposeSenateList duplicateCandidates (ExecutionFailed)', async () => {
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominateJustice', [justiceAddrs[0], 0]);
    await rejectNominee(0);
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominateJusticeSecond', [justiceAddrs[1], 0]);
    await rejectNominee(0);

    const candidates: [Address, Address, Address] = [justiceAddrs[2], justiceAddrs[2], justiceAddrs[4]];
    const data = env.contracts.court.encode('proposeSenateList', [0, candidates]);
    const actionId = await prepareSenateAction(env, env.addresses.court, data);
    await expectRevert(
      env.contracts.parliament.write('executeGovernanceAction', [actionId]),
      'ExecutionFailed',
    );
  });

  it('revert: proposeSenateList activeJustice (ExecutionFailed)', async () => {
    await appointJustice(0);

    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominateJustice', [justiceAddrs[1], 1]);
    await rejectNominee(1);
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominateJusticeSecond', [justiceAddrs[2], 1]);
    await rejectNominee(1);

    const candidates: [Address, Address, Address] = [justiceAddrs[0], justiceAddrs[3], justiceAddrs[4]];
    const data = env.contracts.court.encode('proposeSenateList', [1, candidates]);
    const actionId = await prepareSenateAction(env, env.addresses.court, data);
    await expectRevert(
      env.contracts.parliament.write('executeGovernanceAction', [actionId]),
      'ExecutionFailed',
    );
  });

  // ── Modifier Tests ────────────────────────────────────────────────────

  it('modifier: nominateJustice onlyCrownOrExecutive', async () => {
    await expectRevert(
      writeAs(env.contracts.court, env.publicClient, unauthorized, env.testClient,
        'nominateJustice', [justiceAddrs[0], 0]),
      'NotAuthorized',
    );
  });

  it('revert: nominateJustice parliamentCannotCall', async () => {
    await asAccount(env.testClient, env.addresses.parliament, async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.addresses.parliament));
      await expectRevert(
        c.write('nominateJustice', [justiceAddrs[0], 0], env.addresses.parliament),
        'NotAuthorized',
      );
    });
  });

  it('revert: confirmNominee onlyParliament', async () => {
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominateJustice', [justiceAddrs[0], 0]);
    await asAccount(env.testClient, env.addresses.crown, async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.addresses.crown));
      await expectRevert(
        c.write('confirmNominee', [0], env.addresses.crown),
        'NotAuthorized',
      );
    });
  });

  it('revert: rejectNominee onlyParliament', async () => {
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominateJustice', [justiceAddrs[0], 0]);
    await asAccount(env.testClient, env.addresses.crown, async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.addresses.crown));
      await expectRevert(
        c.write('rejectNominee', [0], env.addresses.crown),
        'NotAuthorized',
      );
    });
  });

  it('revert: nominateJusticeSecond onlyCrownOrExecutive', async () => {
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominateJustice', [justiceAddrs[0], 0]);
    await rejectNominee(0);

    await asAccount(env.testClient, env.addresses.parliament, async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.addresses.parliament));
      await expectRevert(
        c.write('nominateJusticeSecond', [justiceAddrs[1], 0], env.addresses.parliament),
        'NotAuthorized',
      );
    });
  });

  it('revert: proposeSenateList onlyParliament', async () => {
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominateJustice', [justiceAddrs[0], 0]);
    await rejectNominee(0);
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominateJusticeSecond', [justiceAddrs[1], 0]);
    await rejectNominee(0);

    const candidates: [Address, Address, Address] = [justiceAddrs[2], justiceAddrs[3], justiceAddrs[4]];
    await asAccount(env.testClient, env.addresses.crown, async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.addresses.crown));
      await expectRevert(
        c.write('proposeSenateList', [0, candidates], env.addresses.crown),
        'NotAuthorized',
      );
    });
  });

  it('revert: nominateJustice zeroAddress', async () => {
    const zeroAddr = '0x0000000000000000000000000000000000000000' as Address;
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'nominateJustice', [zeroAddr, 0]),
      'ZeroAddress',
    );
  });

  it('revert: nominateJusticeSecond notDistinct', async () => {
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominateJustice', [justiceAddrs[0], 0]);
    await rejectNominee(0);
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'nominateJusticeSecond', [justiceAddrs[0], 0]),
      'NomineeNotDistinct',
    );
  });

  it('revert: appointFromList indexOutOfBounds', async () => {
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominateJustice', [justiceAddrs[0], 0]);
    await rejectNominee(0);
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominateJusticeSecond', [justiceAddrs[1], 0]);
    await rejectNominee(0);
    const candidates: [Address, Address, Address] = [justiceAddrs[2], justiceAddrs[3], justiceAddrs[4]];
    await proposeSenateList(0, candidates);

    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'appointJusticeFromList', [0, 3]),
      'IndexOutOfBounds',
    );
  });

  it('revert: claimAppointmentTimeout noActiveAppointment', async () => {
    await appointJustice(0);
    const senateReviewKey = await env.contracts.constitution.read('PARAM_SENATE_REVIEW_PERIOD');
    const senatePeriod = (await env.contracts.constitution.read('getParameter', [senateReviewKey])) as bigint;
    await warpForward(env.testClient, senatePeriod);
    await expectRevert(
      env.contracts.court.write('claimAppointmentTimeout', [0]),
      'NoActiveAppointment',
    );
  });

  it('revert: confirmNominee wrongStage (ExecutionFailed)', async () => {
    const data = env.contracts.court.encode('confirmNominee', [0]);
    const actionId = await prepareSenateAction(env, env.addresses.court, data);
    await expectRevert(
      env.contracts.parliament.write('executeGovernanceAction', [actionId]),
      'ExecutionFailed',
    );
  });

  it('revert: appointFromList onlyCrownOrExecutive', async () => {
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominateJustice', [justiceAddrs[0], 0]);
    await rejectNominee(0);
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominateJusticeSecond', [justiceAddrs[1], 0]);
    await rejectNominee(0);
    const candidates: [Address, Address, Address] = [justiceAddrs[2], justiceAddrs[3], justiceAddrs[4]];
    await proposeSenateList(0, candidates);

    await asAccount(env.testClient, env.addresses.parliament, async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.addresses.parliament));
      await expectRevert(
        c.write('appointFromList', [0, 1], env.addresses.parliament),
        'NotAuthorized',
      );
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. JUDICIAL — reviews, disputes, facts, liveness, check-in, judicial orders
// ═══════════════════════════════════════════════════════════════════════════════

describe('SupremeCourt: Judicial (MixinGovernment + MixinJustices)', () => {
  let env: JusticesEnv;
  let snapshot: `0x${string}`;
  const unauthorized = makeAddr('unauthorized');

  beforeAll(async () => {
    const base = await setupGovBase();
    await setupMajlis(base);
    await setupGovernment(base);
    const senateEnv = await setupSenate(base);
    env = await setupJustices(senateEnv);
    snapshot = await env.testClient.snapshot();
  }, 120_000);

  beforeEach(async () => {
    await env.testClient.revert({ id: snapshot });
    snapshot = await env.testClient.snapshot();
  });

  // ── Constitutional Review ────────────────────────────────────────────

  it('fileReview: happy case', async () => {
    const petitionHash = keccak256(toHex('petition'));
    const reviewId = await writeAs(env.contracts.court, env.publicClient, env.actors.pmCandidate, env.testClient,
      'fileConstitutionalReview', [1, petitionHash]);
    expect(await env.contracts.court.read('reviewCount')).toBe(1n);
    const status = await env.contracts.court.read('getReviewStatus', [0n]);
    expect(Number(status)).toBe(0); // Voting
  });

  it('reviewConstitutional: 5 yes, 2 no → Constitutional', async () => {
    const petitionHash = keccak256(toHex('petition'));
    await writeAs(env.contracts.court, env.publicClient, env.actors.pmCandidate, env.testClient,
      'fileConstitutionalReview', [1, petitionHash]);

    for (let i = 0; i < 5; i++) {
      await asAccount(env.testClient, env.justices[i], async () => {
        const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[i]));
        await c.write('voteOnReview', [0n, true], env.justices[i]);
      });
    }
    for (let i = 5; i < 7; i++) {
      await asAccount(env.testClient, env.justices[i], async () => {
        const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[i]));
        await c.write('voteOnReview', [0n, false], env.justices[i]);
      });
    }

    await env.contracts.court.write('finalizeReview', [0n]);
    const status = await env.contracts.court.read('getReviewStatus', [0n]);
    expect(Number(status)).toBe(1); // Constitutional
  });

  it('reviewUnconstitutional: 3 yes, 4 no → Unconstitutional', async () => {
    const petitionHash = keccak256(toHex('petition'));
    await writeAs(env.contracts.court, env.publicClient, env.actors.monarchAddr, env.testClient,
      'fileConstitutionalReview', [1, petitionHash]);

    for (let i = 0; i < 3; i++) {
      await asAccount(env.testClient, env.justices[i], async () => {
        const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[i]));
        await c.write('voteOnReview', [0n, true], env.justices[i]);
      });
    }
    for (let i = 3; i < 7; i++) {
      await asAccount(env.testClient, env.justices[i], async () => {
        const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[i]));
        await c.write('voteOnReview', [0n, false], env.justices[i]);
      });
    }

    await env.contracts.court.write('finalizeReview', [0n]);
    const status = await env.contracts.court.read('getReviewStatus', [0n]);
    expect(Number(status)).toBe(2); // Unconstitutional
  });

  it('revert: finalizeReview quorumNotMet', async () => {
    const petitionHash = keccak256(toHex('petition'));
    await writeAs(env.contracts.court, env.publicClient, env.actors.pmCandidate, env.testClient,
      'fileConstitutionalReview', [1, petitionHash]);

    for (let i = 0; i < 6; i++) {
      await asAccount(env.testClient, env.justices[i], async () => {
        const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[i]));
        await c.write('voteOnReview', [0n, true], env.justices[i]);
      });
    }

    await expectRevert(env.contracts.court.write('finalizeReview', [0n]), 'QuorumNotMet');
  });

  it('revert: finalizeReview noActiveJustices', async () => {
    const petitionHash = keccak256(toHex('petition'));
    await writeAs(env.contracts.court, env.publicClient, env.actors.pmCandidate, env.testClient,
      'fileConstitutionalReview', [1, petitionHash]);

    const termKey = await env.contracts.constitution.read('PARAM_JUSTICE_TERM');
    const termLength = (await env.contracts.constitution.read('getParameter', [termKey])) as bigint;
    await warpForward(env.testClient, termLength + 1n);
    for (let i = 0; i < 7; i++) {
      await env.contracts.court.write('removeExpiredJustice', [i]);
    }

    await expectRevert(env.contracts.court.write('finalizeReview', [0n]), 'NoActiveJustices');
  });

  it('revert: voteOnReview notJustice', async () => {
    const petitionHash = keccak256(toHex('petition'));
    await writeAs(env.contracts.court, env.publicClient, env.actors.pmCandidate, env.testClient,
      'fileConstitutionalReview', [1, petitionHash]);

    await expectRevert(
      writeAs(env.contracts.court, env.publicClient, unauthorized, env.testClient,
        'voteOnReview', [0n, true]),
      'NotJustice',
    );
  });

  it('revert: voteOnReview alreadyVoted', async () => {
    const petitionHash = keccak256(toHex('petition'));
    await writeAs(env.contracts.court, env.publicClient, env.actors.pmCandidate, env.testClient,
      'fileConstitutionalReview', [1, petitionHash]);

    await asAccount(env.testClient, env.justices[0], async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[0]));
      await c.write('voteOnReview', [0n, true], env.justices[0]);
    });

    await asAccount(env.testClient, env.justices[0], async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[0]));
      await expectRevert(c.write('voteOnReview', [0n, true], env.justices[0]), 'AlreadyVoted');
    });
  });

  it('revert: voteOnReview invalidReview', async () => {
    await asAccount(env.testClient, env.justices[0], async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[0]));
      await expectRevert(c.write('voteOnReview', [999n, true], env.justices[0]), 'InvalidReview');
    });
  });

  it('revert: voteOnReview notInStatus (after finalized)', async () => {
    const petitionHash = keccak256(toHex('petition'));
    await writeAs(env.contracts.court, env.publicClient, env.actors.pmCandidate, env.testClient,
      'fileConstitutionalReview', [1, petitionHash]);

    for (let i = 0; i < 7; i++) {
      await asAccount(env.testClient, env.justices[i], async () => {
        const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[i]));
        await c.write('voteOnReview', [0n, true], env.justices[i]);
      });
    }
    await env.contracts.court.write('finalizeReview', [0n]);

    await asAccount(env.testClient, env.justices[0], async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[0]));
      await expectRevert(c.write('voteOnReview', [0n, true], env.justices[0]), 'NotInStatus');
    });
  });

  it('revert: finalizeReview invalidReview', async () => {
    await expectRevert(env.contracts.court.write('finalizeReview', [999n]), 'InvalidReview');
  });

  it('revert: executeReviewOutcome notInStatus', async () => {
    const petitionHash = keccak256(toHex('petition'));
    await writeAs(env.contracts.court, env.publicClient, env.actors.pmCandidate, env.testClient,
      'fileConstitutionalReview', [1, petitionHash]);

    await expectRevert(env.contracts.court.write('executeReviewOutcome', [0n]), 'NotInStatus');
  });

  it('revert: getReviewStatus invalidReview', async () => {
    await expectRevert(env.contracts.court.read('getReviewStatus', [999n]), 'InvalidReview');
  });

  it('revert: fileReview noStanding', async () => {
    await expectRevert(
      writeAs(env.contracts.court, env.publicClient, unauthorized, env.testClient,
        'fileConstitutionalReview', [1, keccak256(toHex('petition'))]),
      'NotAuthorized',
    );
  });

  it('fileReview: by Crown contract', async () => {
    await asAccount(env.testClient, env.addresses.crown, async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.addresses.crown));
      await c.write('fileConstitutionalReview', [1, keccak256(toHex('petition'))], env.addresses.crown);
    });
    expect(await env.contracts.court.read('reviewCount')).toBe(1n);
  });

  it('fileReview: by Executive contract', async () => {
    await asAccount(env.testClient, env.addresses.executive, async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.addresses.executive));
      await c.write('fileConstitutionalReview', [1, keccak256(toHex('petition'))], env.addresses.executive);
    });
    expect(await env.contracts.court.read('reviewCount')).toBe(1n);
  });

  it('fileReview: by Parliament contract', async () => {
    await asAccount(env.testClient, env.addresses.parliament, async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.addresses.parliament));
      await c.write('fileConstitutionalReview', [1, keccak256(toHex('petition'))], env.addresses.parliament);
    });
    expect(await env.contracts.court.read('reviewCount')).toBe(1n);
  });

  // ── Dispute Resolution ───────────────────────────────────────────────

  it('fileAndResolveDispute: full cycle', async () => {
    await writeAs(env.contracts.court, env.publicClient, env.actors.pmCandidate, env.testClient,
      'fileDispute', [keccak256(toHex('Crown vs Parliament'))]);

    for (let i = 0; i < 7; i++) {
      await asAccount(env.testClient, env.justices[i], async () => {
        const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[i]));
        await c.write('voteOnDispute', [0n, true], env.justices[i]);
      });
    }

    const rulingHash = keccak256(toHex('ruling: Parliament prevails'));
    await asAccount(env.testClient, env.justices[0], async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[0]));
      await c.write('finalizeDispute', [0n, rulingHash], env.justices[0]);
    });

    const status = await env.contracts.court.read('getDisputeStatus', [0n]);
    expect(Number(status)).toBe(1); // Resolved
  });

  it('fileDispute: by Crown contract', async () => {
    await asAccount(env.testClient, env.addresses.crown, async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.addresses.crown));
      await c.write('fileDispute', [keccak256(toHex('Crown vs Exec'))], env.addresses.crown);
    });
    expect(await env.contracts.court.read('disputeCount')).toBe(1n);
  });

  it('fileDispute: by Executive contract', async () => {
    await asAccount(env.testClient, env.addresses.executive, async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.addresses.executive));
      await c.write('fileDispute', [keccak256(toHex('Exec vs Parl'))], env.addresses.executive);
    });
    expect(await env.contracts.court.read('disputeCount')).toBe(1n);
  });

  it('fileDispute: by Parliament contract', async () => {
    await asAccount(env.testClient, env.addresses.parliament, async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.addresses.parliament));
      await c.write('fileDispute', [keccak256(toHex('Parl vs Crown'))], env.addresses.parliament);
    });
    expect(await env.contracts.court.read('disputeCount')).toBe(1n);
  });

  it('revert: voteOnDispute invalidDispute', async () => {
    await asAccount(env.testClient, env.justices[0], async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[0]));
      await expectRevert(c.write('voteOnDispute', [999n, true], env.justices[0]), 'InvalidDispute');
    });
  });

  it('revert: voteOnDispute alreadyVoted', async () => {
    await writeAs(env.contracts.court, env.publicClient, env.actors.pmCandidate, env.testClient,
      'fileDispute', [keccak256(toHex('dispute'))]);

    await asAccount(env.testClient, env.justices[0], async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[0]));
      await c.write('voteOnDispute', [0n, true], env.justices[0]);
    });

    await asAccount(env.testClient, env.justices[0], async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[0]));
      await expectRevert(c.write('voteOnDispute', [0n, true], env.justices[0]), 'AlreadyVoted');
    });
  });

  it('revert: getDisputeStatus invalidDispute', async () => {
    await expectRevert(env.contracts.court.read('getDisputeStatus', [999n]), 'InvalidDispute');
  });

  it('revert: fileDispute noStanding', async () => {
    await expectRevert(
      writeAs(env.contracts.court, env.publicClient, unauthorized, env.testClient,
        'fileDispute', [keccak256(toHex('unauthorized'))]),
      'NotAuthorized',
    );
  });

  it('revert: finalizeDispute notJustice', async () => {
    await writeAs(env.contracts.court, env.publicClient, env.actors.pmCandidate, env.testClient,
      'fileDispute', [keccak256(toHex('dispute'))]);
    for (let i = 0; i < 7; i++) {
      await asAccount(env.testClient, env.justices[i], async () => {
        const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[i]));
        await c.write('voteOnDispute', [0n, true], env.justices[i]);
      });
    }
    await expectRevert(
      writeAs(env.contracts.court, env.publicClient, unauthorized, env.testClient,
        'finalizeDispute', [0n, keccak256(toHex('ruling'))]),
      'NotJustice',
    );
  });

  // ── Fact Certification ───────────────────────────────────────────────

  it('certifyFact: happy case', async () => {
    const factHash = keccak256(toHex('PM incapacitated'));
    await certifyFact(env, factHash);
    expect(await env.contracts.court.read('isFactCertified', [factHash])).toBe(true);
  });

  it('certifyFact: not certified before deadline', async () => {
    const factHash = keccak256(toHex('PM incapacitated'));

    for (let i = 0; i < 4; i++) {
      await asAccount(env.testClient, env.justices[i], async () => {
        const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[i]));
        await c.write('voteOnFact', [factHash, true], env.justices[i]);
      });
    }

    expect(await env.contracts.court.read('isFactCertified', [factHash])).toBe(false);
    await expectRevert(env.contracts.court.write('finalizeFactCertification', [factHash]), 'FactCertPeriodNotElapsed');

    const factCertKey = await env.contracts.constitution.read('PARAM_FACT_CERT_PERIOD');
    const factCertPeriod = (await env.contracts.constitution.read('getParameter', [factCertKey])) as bigint;
    await warpForward(env.testClient, factCertPeriod);
    await env.contracts.court.write('finalizeFactCertification', [factHash]);
    expect(await env.contracts.court.read('isFactCertified', [factHash])).toBe(true);
  });

  it('certifyFact: not certified if no majority', async () => {
    const factHash = keccak256(toHex('PM incapacitated'));
    // 2 yes, 3 no
    for (let i = 0; i < 2; i++) {
      await asAccount(env.testClient, env.justices[i], async () => {
        const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[i]));
        await c.write('voteOnFact', [factHash, true], env.justices[i]);
      });
    }
    for (let i = 2; i < 5; i++) {
      await asAccount(env.testClient, env.justices[i], async () => {
        const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[i]));
        await c.write('voteOnFact', [factHash, false], env.justices[i]);
      });
    }

    const factCertKey = await env.contracts.constitution.read('PARAM_FACT_CERT_PERIOD');
    const factCertPeriod = (await env.contracts.constitution.read('getParameter', [factCertKey])) as bigint;
    await warpForward(env.testClient, factCertPeriod);
    await env.contracts.court.write('finalizeFactCertification', [factHash]);
    expect(await env.contracts.court.read('isFactCertified', [factHash])).toBe(false);
  });

  it('revert: voteOnFact alreadyVoted', async () => {
    const factHash = keccak256(toHex('PM incapacitated'));
    await asAccount(env.testClient, env.justices[0], async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[0]));
      await c.write('voteOnFact', [factHash, true], env.justices[0]);
    });
    await asAccount(env.testClient, env.justices[0], async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[0]));
      await expectRevert(c.write('voteOnFact', [factHash, true], env.justices[0]), 'AlreadyVoted');
    });
  });

  it('revert: voteOnFact alreadyCertified', async () => {
    const factHash = keccak256(toHex('PM incapacitated'));
    await certifyFact(env, factHash);
    await asAccount(env.testClient, env.justices[5], async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[5]));
      await expectRevert(c.write('voteOnFact', [factHash, true], env.justices[5]), 'FactAlreadyCertified');
    });
  });

  it('modifier: voteOnFact onlyJustice', async () => {
    await expectRevert(
      writeAs(env.contracts.court, env.publicClient, unauthorized, env.testClient,
        'voteOnFact', [keccak256(toHex('fact')), true]),
      'NotJustice',
    );
  });

  it('uncertifiedFact: returns false for nonexistent', async () => {
    expect(await env.contracts.court.read('isFactCertified', [keccak256(toHex('nonexistent'))])).toBe(false);
  });

  // ── Fact Certification Retry ─────────────────────────────────────────

  it('factCert: retry after failure', async () => {
    const factHash = keccak256(toHex('disputed fact'));

    // Round 0: 1 yes, 3 no → rejected
    await asAccount(env.testClient, env.justices[0], async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[0]));
      await c.write('voteOnFact', [factHash, false], env.justices[0]);
    });
    await asAccount(env.testClient, env.justices[1], async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[1]));
      await c.write('voteOnFact', [factHash, false], env.justices[1]);
    });
    await asAccount(env.testClient, env.justices[2], async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[2]));
      await c.write('voteOnFact', [factHash, false], env.justices[2]);
    });
    await asAccount(env.testClient, env.justices[3], async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[3]));
      await c.write('voteOnFact', [factHash, true], env.justices[3]);
    });

    const factCertKey = await env.contracts.constitution.read('PARAM_FACT_CERT_PERIOD');
    const factCertPeriod = (await env.contracts.constitution.read('getParameter', [factCertKey])) as bigint;
    await warpForward(env.testClient, factCertPeriod);
    await env.contracts.court.write('finalizeFactCertification', [factHash]);
    expect(await env.contracts.court.read('isFactCertified', [factHash])).toBe(false);
    expect(await env.contracts.court.read('factCertRound', [factHash])).toBe(1n);

    // Round 1: 4 yes → certified
    for (let i = 0; i < 4; i++) {
      await asAccount(env.testClient, env.justices[i], async () => {
        const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[i]));
        await c.write('voteOnFact', [factHash, true], env.justices[i]);
      });
    }

    await warpForward(env.testClient, factCertPeriod);
    await env.contracts.court.write('finalizeFactCertification', [factHash]);
    expect(await env.contracts.court.read('isFactCertified', [factHash])).toBe(true);
  });

  it('factCert: old votes preserved across rounds', async () => {
    const factHash = keccak256(toHex('evidence fact'));

    // Round 0: 2 yes, 3 no
    for (let i = 0; i < 2; i++) {
      await asAccount(env.testClient, env.justices[i], async () => {
        const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[i]));
        await c.write('voteOnFact', [factHash, true], env.justices[i]);
      });
    }
    for (let i = 2; i < 5; i++) {
      await asAccount(env.testClient, env.justices[i], async () => {
        const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[i]));
        await c.write('voteOnFact', [factHash, false], env.justices[i]);
      });
    }

    const factCertKey = await env.contracts.constitution.read('PARAM_FACT_CERT_PERIOD');
    const factCertPeriod = (await env.contracts.constitution.read('getParameter', [factCertKey])) as bigint;
    await warpForward(env.testClient, factCertPeriod);
    await env.contracts.court.write('finalizeFactCertification', [factHash]);

    expect(await env.contracts.court.read('factYesVotesInRound', [factHash, 0n])).toBe(2n);
    expect(await env.contracts.court.read('factNoVotesInRound', [factHash, 0n])).toBe(3n);
    expect(await env.contracts.court.read('factVotedInRound', [factHash, 0n, env.justices[0]])).toBe(true);
    expect(await env.contracts.court.read('factVotedInRound', [factHash, 0n, env.justices[2]])).toBe(true);

    // Round 1 starts fresh
    expect(await env.contracts.court.read('factYesVotesInRound', [factHash, 1n])).toBe(0n);
    expect(await env.contracts.court.read('factNoVotesInRound', [factHash, 1n])).toBe(0n);
    expect(await env.contracts.court.read('factVotedInRound', [factHash, 1n, env.justices[0]])).toBe(false);
  });

  it('revert: factCert cannotDoubleVoteInRound', async () => {
    const factHash = keccak256(toHex('double vote fact'));
    await asAccount(env.testClient, env.justices[0], async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[0]));
      await c.write('voteOnFact', [factHash, true], env.justices[0]);
    });
    await asAccount(env.testClient, env.justices[0], async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[0]));
      await expectRevert(c.write('voteOnFact', [factHash, false], env.justices[0]), 'AlreadyVoted');
    });
  });

  // ── Justice Vacancy Via Fact Certification ───────────────────────────

  it('vacateJusticeSeat: happy case', async () => {
    const factHash = keccak256(encodePacked(['string', 'uint256'], ['JUSTICE_VACANCY', 0n]));
    for (let i = 1; i < 5; i++) {
      await asAccount(env.testClient, env.justices[i], async () => {
        const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[i]));
        await c.write('voteOnFact', [factHash, true], env.justices[i]);
      });
    }
    const factCertKey = await env.contracts.constitution.read('PARAM_FACT_CERT_PERIOD');
    const factCertPeriod = (await env.contracts.constitution.read('getParameter', [factCertKey])) as bigint;
    await warpForward(env.testClient, factCertPeriod);
    await env.contracts.court.write('finalizeFactCertification', [factHash]);

    await env.contracts.court.write('vacateJusticeSeat', [0]);
    expect(await env.contracts.court.read('isActiveJustice', [env.justices[0]])).toBe(false);
    expect(await env.contracts.court.read('activeJusticeCount')).toBe(6n);
  });

  it('revert: vacateJusticeSeat notCertified', async () => {
    await expectRevert(env.contracts.court.write('vacateJusticeSeat', [0]), 'VacancyNotCertified');
  });

  // ── Court Liveness ───────────────────────────────────────────────────

  it('challengeCourtLiveness: by monarch', async () => {
    await writeAs(env.contracts.court, env.publicClient, env.actors.monarchAddr, env.testClient,
      'challengeCourtLiveness', []);
    const deadline = await env.contracts.court.read('livenessDeadline');
    expect(Number(deadline)).toBeGreaterThan(0);
  });

  it('challengeCourtLiveness: by PM', async () => {
    await writeAs(env.contracts.court, env.publicClient, env.actors.pmCandidate, env.testClient,
      'challengeCourtLiveness', []);
    const deadline = await env.contracts.court.read('livenessDeadline');
    expect(Number(deadline)).toBeGreaterThan(0);
  });

  it('challengeCourtLiveness: by Crown contract', async () => {
    await asAccount(env.testClient, env.addresses.crown, async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.addresses.crown));
      await c.write('challengeCourtLiveness', [], env.addresses.crown);
    });
    const deadline = await env.contracts.court.read('livenessDeadline');
    expect(Number(deadline)).toBeGreaterThan(0);
  });

  it('emergencyVacateSeat: after challenge deadline', async () => {
    await writeAs(env.contracts.court, env.publicClient, env.actors.monarchAddr, env.testClient,
      'challengeCourtLiveness', []);
    const liveKey = await env.contracts.constitution.read('PARAM_COURT_LIVENESS_PERIOD');
    const period = (await env.contracts.constitution.read('getParameter', [liveKey])) as bigint;
    await warpForward(env.testClient, period);

    await env.contracts.court.write('emergencyVacateSeat', [0]);
    expect(await env.contracts.court.read('isActiveJustice', [env.justices[0]])).toBe(false);
    expect(await env.contracts.court.read('activeJusticeCount')).toBe(6n);
  });

  it('emergencyVacateSeat: after inactivity period', async () => {
    const inactKey = await env.contracts.constitution.read('PARAM_COURT_INACTIVITY_PERIOD');
    const inactPeriod = (await env.contracts.constitution.read('getParameter', [inactKey])) as bigint;
    await warpForward(env.testClient, inactPeriod);

    await env.contracts.court.write('emergencyVacateSeat', [0]);
    expect(await env.contracts.court.read('isActiveJustice', [env.justices[0]])).toBe(false);
  });

  it('justiceAction resetsChallenge: vote on fact clears liveness', async () => {
    await writeAs(env.contracts.court, env.publicClient, env.actors.monarchAddr, env.testClient,
      'challengeCourtLiveness', []);
    const factHash = keccak256(toHex('some fact'));
    await asAccount(env.testClient, env.justices[0], async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[0]));
      await c.write('voteOnFact', [factHash, true], env.justices[0]);
    });
    expect(await env.contracts.court.read('livenessDeadline')).toBe(0n);
  });

  it('petitionCourtLiveness: threshold met triggers challenge', async () => {
    await writeAs(env.contracts.court, env.publicClient, env.actors.citizen1, env.testClient,
      'petitionCourtLiveness', []);
    const deadline = await env.contracts.court.read('livenessDeadline');
    expect(Number(deadline)).toBeGreaterThan(0);
  });

  it('revert: challengeCourtLiveness alreadyActive', async () => {
    await writeAs(env.contracts.court, env.publicClient, env.actors.monarchAddr, env.testClient,
      'challengeCourtLiveness', []);
    await expectRevert(
      writeAs(env.contracts.court, env.publicClient, env.actors.monarchAddr, env.testClient,
        'challengeCourtLiveness', []),
      'LivenessChallengeActive',
    );
  });

  it('revert: petitionCourtLiveness alreadyPetitioned', async () => {
    // Seat 6 extra Majlis members so threshold > 1
    for (let i = 0; i < 6; i++) {
      const extra = `0x${(5000 + i).toString(16).padStart(40, '0')}` as Address;
      await asAccount(env.testClient, env.addresses.election, async () => {
        const c = contractAs(env.contracts.parliament, env.publicClient, walletForAddress(env.addresses.election));
        await c.write('seatMember', [extra, 0], env.addresses.election); // 0 = Majlis
      });
    }
    await writeAs(env.contracts.court, env.publicClient, env.actors.citizen1, env.testClient,
      'petitionCourtLiveness', []);
    await expectRevert(
      writeAs(env.contracts.court, env.publicClient, env.actors.citizen1, env.testClient,
        'petitionCourtLiveness', []),
      'AlreadyPetitioned',
    );
  });

  it('revert: petitionCourtLiveness notParliamentMember', async () => {
    await expectRevert(
      writeAs(env.contracts.court, env.publicClient, unauthorized, env.testClient,
        'petitionCourtLiveness', []),
      'NotParliamentMember',
    );
  });

  it('revert: emergencyVacateSeat notActiveJustice', async () => {
    await writeAs(env.contracts.court, env.publicClient, env.actors.monarchAddr, env.testClient,
      'challengeCourtLiveness', []);
    const liveKey = await env.contracts.constitution.read('PARAM_COURT_LIVENESS_PERIOD');
    const period = (await env.contracts.constitution.read('getParameter', [liveKey])) as bigint;
    await warpForward(env.testClient, period);

    await expectRevert(env.contracts.court.write('emergencyVacateSeat', [7]), 'NotActiveJustice');
  });

  it('revert: challengeCourtLiveness unauthorized', async () => {
    await expectRevert(
      writeAs(env.contracts.court, env.publicClient, unauthorized, env.testClient,
        'challengeCourtLiveness', []),
      'NotAuthorized',
    );
  });

  it('revert: challengeCourtLiveness executiveCannotCall', async () => {
    await asAccount(env.testClient, env.addresses.executive, async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.addresses.executive));
      await expectRevert(c.write('challengeCourtLiveness', [], env.addresses.executive), 'NotAuthorized');
    });
  });

  it('revert: challengeCourtLiveness parliamentCannotCall', async () => {
    await asAccount(env.testClient, env.addresses.parliament, async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.addresses.parliament));
      await expectRevert(c.write('challengeCourtLiveness', [], env.addresses.parliament), 'NotAuthorized');
    });
  });

  it('revert: emergencyVacateSeat neitherCondition', async () => {
    // Reset inactivity timer
    await asAccount(env.testClient, env.justices[0], async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[0]));
      await c.write('checkIn', [], env.justices[0]);
    });
    await expectRevert(env.contracts.court.write('emergencyVacateSeat', [0]), 'NeitherLivenessConditionMet');
  });

  it('emergencyVacate: after recovery seating, no more emergency', async () => {
    await writeAs(env.contracts.court, env.publicClient, env.actors.monarchAddr, env.testClient,
      'challengeCourtLiveness', []);
    const liveKey = await env.contracts.constitution.read('PARAM_COURT_LIVENESS_PERIOD');
    const period = (await env.contracts.constitution.read('getParameter', [liveKey])) as bigint;
    await warpForward(env.testClient, period);

    for (let i = 0; i < 7; i++) {
      await env.contracts.court.write('emergencyVacateSeat', [i]);
    }
    expect(await env.contracts.court.read('activeJusticeCount')).toBe(0n);

    // Seat a fresh justice
    const freshJustice = makeAddr('freshJustice');
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominateJustice', [freshJustice, 0]);
    const confirmData = env.contracts.court.encode('confirmNominee', [0]);
    await executeSenateAction(env, env.addresses.court, confirmData);

    expect(await env.contracts.court.read('livenessDeadline')).toBe(0n);
    expect(await env.contracts.court.read('activeJusticeCount')).toBe(1n);

    await expectRevert(env.contracts.court.write('emergencyVacateSeat', [0]), 'NeitherLivenessConditionMet');
  });

  // ── Justice Check-In ─────────────────────────────────────────────────

  it('checkIn: resets inactivity timer', async () => {
    const inactKey = await env.contracts.constitution.read('PARAM_COURT_INACTIVITY_PERIOD');
    const inactPeriod = (await env.contracts.constitution.read('getParameter', [inactKey])) as bigint;
    await warpForward(env.testClient, inactPeriod - 1n);

    await asAccount(env.testClient, env.justices[0], async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[0]));
      await c.write('checkIn', [], env.justices[0]);
    });

    await warpForward(env.testClient, inactPeriod - 1n);
    await expectRevert(env.contracts.court.write('emergencyVacateSeat', [0]), 'NeitherLivenessConditionMet');
  });

  it('checkIn: clears liveness challenge', async () => {
    await writeAs(env.contracts.court, env.publicClient, env.actors.monarchAddr, env.testClient,
      'challengeCourtLiveness', []);
    expect(Number(await env.contracts.court.read('livenessDeadline'))).not.toBe(0);

    await asAccount(env.testClient, env.justices[0], async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[0]));
      await c.write('checkIn', [], env.justices[0]);
    });
    expect(await env.contracts.court.read('livenessDeadline')).toBe(0n);
  });

  it('revert: checkIn nonJustice', async () => {
    await expectRevert(
      writeAs(env.contracts.court, env.publicClient, unauthorized, env.testClient, 'checkIn', []),
      'NotJustice',
    );
  });

  // ── Judicial Order Execution ─────────────────────────────────────────

  it('executeJudicialOrder: removes Majlis member', async () => {
    const target = env.addresses.parliament;
    const data = env.contracts.parliament.encode('removeMember', [env.actors.citizen5, 0]); // 0 = Majlis
    const factHash = keccak256(encodePacked(['string', 'address', 'bytes'], ['JUDICIAL_ORDER', target, data]));
    await certifyFact(env, factHash);

    await asAccount(env.testClient, env.justices[0], async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[0]));
      await c.write('executeJudicialOrder', [target, data], env.justices[0]);
    });

    expect(await env.contracts.court.read('isFactCertified', [factHash])).toBe(false);
    expect(await env.contracts.parliament.read('isActiveMajlisMember', [env.actors.citizen5])).toBe(false);
  });

  it('revert: executeJudicialOrder notJustice', async () => {
    const target = env.addresses.parliament;
    const data = env.contracts.parliament.encode('removeMember', [env.actors.citizen5, 0]);
    await expectRevert(
      writeAs(env.contracts.court, env.publicClient, unauthorized, env.testClient,
        'executeJudicialOrder', [target, data]),
      'NotJustice',
    );
  });

  it('revert: executeJudicialOrder factNotCertified', async () => {
    const target = env.addresses.parliament;
    const data = env.contracts.parliament.encode('removeMember', [env.actors.citizen5, 0]);
    await asAccount(env.testClient, env.justices[0], async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[0]));
      await expectRevert(c.write('executeJudicialOrder', [target, data], env.justices[0]), 'FactNotCertified');
    });
  });

  it('revert: executeJudicialOrder invalidTarget', async () => {
    const target = makeAddr('unregistered');
    const data = '0xdeadbeef' as `0x${string}`;
    const factHash = keccak256(encodePacked(['string', 'address', 'bytes'], ['JUDICIAL_ORDER', target, data]));
    await certifyFact(env, factHash);

    await asAccount(env.testClient, env.justices[0], async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[0]));
      await expectRevert(c.write('executeJudicialOrder', [target, data], env.justices[0]), 'InvalidTarget');
    });
  });

  it('revert: executeJudicialOrder no replay', async () => {
    const target = env.addresses.parliament;
    const data = env.contracts.parliament.encode('removeMember', [env.actors.citizen5, 0]);
    const factHash = keccak256(encodePacked(['string', 'address', 'bytes'], ['JUDICIAL_ORDER', target, data]));
    await certifyFact(env, factHash);

    await asAccount(env.testClient, env.justices[0], async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[0]));
      await c.write('executeJudicialOrder', [target, data], env.justices[0]);
    });
    await asAccount(env.testClient, env.justices[0], async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.justices[0]));
      await expectRevert(c.write('executeJudicialOrder', [target, data], env.justices[0]), 'FactNotCertified');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. PETITION — collective petitions from Majlis/Senate
// ═══════════════════════════════════════════════════════════════════════════════

describe('SupremeCourt: Petition (MixinMajlis + MixinSenate)', () => {
  let env: SenateEnv;
  let snapshot: `0x${string}`;
  const unauthorized = makeAddr('unauthorized');

  beforeAll(async () => {
    const base = await setupGovBase();
    await setupMajlis(base);
    const senateEnv = await setupSenate(base);
    env = senateEnv;
    snapshot = await env.testClient.snapshot();
  }, 60_000);

  beforeEach(async () => {
    await env.testClient.revert({ id: snapshot });
    snapshot = await env.testClient.snapshot();
  });

  it('collectivePetition: Majlis auto-files', async () => {
    await writeAs(env.contracts.court, env.publicClient, env.actors.citizen1, env.testClient,
      'createCollectivePetition', [42, keccak256(toHex('petition')), 0]); // 0=Majlis
    expect(await env.contracts.court.read('petitionCount')).toBe(1n);
    expect(await env.contracts.court.read('reviewCount')).toBe(1n);
  });

  it('collectivePetition: Senate auto-files', async () => {
    await writeAs(env.contracts.court, env.publicClient, env.senators[0], env.testClient,
      'createCollectivePetition', [7, keccak256(toHex('senate petition')), 1]); // 1=Senate
    expect(await env.contracts.court.read('reviewCount')).toBe(1n);
  });

  it('revert: signPetition invalidPetition', async () => {
    await expectRevert(
      writeAs(env.contracts.court, env.publicClient, env.actors.citizen1, env.testClient,
        'signPetition', [999n]),
      'InvalidPetition',
    );
  });

  it('revert: collectivePetition notMember', async () => {
    await expectRevert(
      writeAs(env.contracts.court, env.publicClient, unauthorized, env.testClient,
        'createCollectivePetition', [42, keccak256(toHex('petition')), 0]),
      'NotParliamentMember',
    );
  });

  it('revert: signPetition alreadySigned (auto-filed)', async () => {
    await writeAs(env.contracts.court, env.publicClient, env.actors.citizen1, env.testClient,
      'createCollectivePetition', [42, keccak256(toHex('petition')), 0]);
    await expectRevert(
      writeAs(env.contracts.court, env.publicClient, env.actors.citizen1, env.testClient,
        'signPetition', [0n]),
      'PetitionAlreadyFiled',
    );
  });

  it('revert: signPetition wrongChamber', async () => {
    // Seat 6 extra Majlis members so threshold > 1
    for (let i = 0; i < 6; i++) {
      const extra = `0x${(5000 + i).toString(16).padStart(40, '0')}` as Address;
      await asAccount(env.testClient, env.addresses.election, async () => {
        const c = contractAs(env.contracts.parliament, env.publicClient, walletForAddress(env.addresses.election));
        await c.write('seatMember', [extra, 0], env.addresses.election);
      });
    }
    await writeAs(env.contracts.court, env.publicClient, env.actors.citizen1, env.testClient,
      'createCollectivePetition', [42, keccak256(toHex('petition')), 0]);
    // Senator tries to sign a Majlis petition
    await expectRevert(
      writeAs(env.contracts.court, env.publicClient, env.senators[0], env.testClient,
        'signPetition', [0n]),
      'NotParliamentMember',
    );
  });

  it('revert: senatorCannotCreateMajlisPetition', async () => {
    await expectRevert(
      writeAs(env.contracts.court, env.publicClient, env.senators[0], env.testClient,
        'createCollectivePetition', [43, keccak256(toHex('petition')), 0]),
      'NotParliamentMember',
    );
  });

  it('signPetition: threshold reached auto-files review', async () => {
    // Seat 6 extra Majlis so threshold > 1
    for (let i = 0; i < 6; i++) {
      const extra = `0x${(5000 + i).toString(16).padStart(40, '0')}` as Address;
      await asAccount(env.testClient, env.addresses.election, async () => {
        const c = contractAs(env.contracts.parliament, env.publicClient, walletForAddress(env.addresses.election));
        await c.write('seatMember', [extra, 0], env.addresses.election);
      });
    }

    await writeAs(env.contracts.court, env.publicClient, env.actors.citizen1, env.testClient,
      'createCollectivePetition', [50, keccak256(toHex('petition-sign')), 0]);
    const reviewsBefore = (await env.contracts.court.read('reviewCount')) as bigint;

    await writeAs(env.contracts.court, env.publicClient, env.actors.citizen2, env.testClient,
      'signPetition', [0n]);
    expect(await env.contracts.court.read('reviewCount')).toBe(reviewsBefore + 1n);
  });

  it('revert: signPetition alreadySigned withHighThreshold', async () => {
    for (let i = 0; i < 6; i++) {
      const extra = `0x${(5000 + i).toString(16).padStart(40, '0')}` as Address;
      await asAccount(env.testClient, env.addresses.election, async () => {
        const c = contractAs(env.contracts.parliament, env.publicClient, walletForAddress(env.addresses.election));
        await c.write('seatMember', [extra, 0], env.addresses.election);
      });
    }

    await writeAs(env.contracts.court, env.publicClient, env.actors.citizen1, env.testClient,
      'createCollectivePetition', [51, keccak256(toHex('petition-dup-sign')), 0]);
    await expectRevert(
      writeAs(env.contracts.court, env.publicClient, env.actors.citizen1, env.testClient,
        'signPetition', [0n]),
      'PetitionAlreadySigned',
    );
  });

  it('revert: signPetition expired', async () => {
    for (let i = 0; i < 6; i++) {
      const extra = `0x${(5000 + i).toString(16).padStart(40, '0')}` as Address;
      await asAccount(env.testClient, env.addresses.election, async () => {
        const c = contractAs(env.contracts.parliament, env.publicClient, walletForAddress(env.addresses.election));
        await c.write('seatMember', [extra, 0], env.addresses.election);
      });
    }

    await writeAs(env.contracts.court, env.publicClient, env.actors.citizen1, env.testClient,
      'createCollectivePetition', [99, keccak256(toHex('expiry-test')), 0]);

    const timeoutKey = await env.contracts.constitution.read('PARAM_PETITION_TIMEOUT');
    const timeout = (await env.contracts.constitution.read('getParameter', [timeoutKey])) as bigint;
    await warpForward(env.testClient, timeout + 1n);

    await expectRevert(
      writeAs(env.contracts.court, env.publicClient, env.actors.citizen2, env.testClient,
        'signPetition', [0n]),
      'PetitionExpired',
    );
  });

  it('revert: duplicatePetition', async () => {
    await writeAs(env.contracts.court, env.publicClient, env.actors.citizen1, env.testClient,
      'createCollectivePetition', [42, keccak256(toHex('petition1')), 0]);
    await expectRevert(
      writeAs(env.contracts.court, env.publicClient, env.actors.citizen2, env.testClient,
        'createCollectivePetition', [42, keccak256(toHex('petition2')), 0]),
      'DuplicatePetition',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. CARETAKER — nomination blocked during caretaker mode
// ═══════════════════════════════════════════════════════════════════════════════

describe('SupremeCourt: Caretaker (MixinCaretaker)', () => {
  let env: GovTestEnv;
  let snapshot: `0x${string}`;

  beforeAll(async () => {
    const base = await setupGovBase();
    await setupMajlis(base);
    await setupCaretaker(base);
    env = base;
    snapshot = await env.testClient.snapshot();
  }, 60_000);

  beforeEach(async () => {
    await env.testClient.revert({ id: snapshot });
    snapshot = await env.testClient.snapshot();
  });

  it('revert: nominateJustice caretakerMode', async () => {
    const justiceAddr = makeAddr('justice');
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'nominateJustice', [justiceAddr, 0]),
      'CaretakerModeActive',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. SUSPENSION — PM nomination during Crown suspension
// ═══════════════════════════════════════════════════════════════════════════════

describe('SupremeCourt: Suspension (MixinGovernment + MixinCrownSuspension)', () => {
  let env: JusticesEnv;
  let snapshot: `0x${string}`;

  beforeAll(async () => {
    const base = await setupGovBase();
    await setupMajlis(base);
    await setupGovernment(base);
    const senateEnv = await setupSenate(base);
    const justicesEnv = await setupJustices(senateEnv);
    await setupCrownSuspension(justicesEnv);
    env = justicesEnv;
    snapshot = await env.testClient.snapshot();
  }, 120_000);

  beforeEach(async () => {
    await env.testClient.revert({ id: snapshot });
    snapshot = await env.testClient.snapshot();
  });

  it('nominateJusticeDuringSuspension: happy case (with deputy)', async () => {
    await writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
      'designateDeputyPM', [env.actors.citizen1]);

    const justiceAddr = makeAddr('suspensionJustice');
    await writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
      'nominateJusticeDuringSuspension', [justiceAddr, 7]);
    const stage = await env.contracts.court.read('getAppointmentStage', [7]);
    expect(Number(stage)).toBe(1); // CrownNom1
  });

  it('nominateJusticeSecondDuringSuspension: happy case', async () => {
    await writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
      'designateDeputyPM', [env.actors.citizen1]);

    const addr1 = makeAddr('suspJustice1');
    await writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
      'nominateJusticeDuringSuspension', [addr1, 7]);

    const rejectData = env.contracts.court.encode('rejectNominee', [7]);
    await executeSenateAction(env, env.addresses.court, rejectData);

    const addr2 = makeAddr('suspJustice2');
    await writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
      'nominateJusticeSecondDuringSuspension', [addr2, 7]);
    const stage = await env.contracts.court.read('getAppointmentStage', [7]);
    expect(Number(stage)).toBe(2); // CrownNom2
  });

  it('appointJusticeFromListDuringSuspension: PM picks from list', async () => {
    await writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
      'designateDeputyPM', [env.actors.citizen1]);

    const addr1 = makeAddr('suspJ1');
    const addr2 = makeAddr('suspJ2');
    await writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
      'nominateJusticeDuringSuspension', [addr1, 7]);
    const rejectData1 = env.contracts.court.encode('rejectNominee', [7]);
    await executeSenateAction(env, env.addresses.court, rejectData1);

    await writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
      'nominateJusticeSecondDuringSuspension', [addr2, 7]);
    const rejectData2 = env.contracts.court.encode('rejectNominee', [7]);
    await executeSenateAction(env, env.addresses.court, rejectData2);

    const candidates: [Address, Address, Address] = [makeAddr('c1'), makeAddr('c2'), makeAddr('c3')];
    const listData = env.contracts.court.encode('proposeSenateList', [7, candidates]);
    await executeSenateAction(env, env.addresses.court, listData);

    await writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
      'appointJusticeFromListDuringSuspension', [7, 1]);
    expect(await env.contracts.court.read('isActiveJustice', [candidates[1]])).toBe(true);
  });

  // ── 5b: Deputy overdue blocks nomination ─────────────────────────────

  it('revert: nominateJusticeDuringSuspension deputyOverdue', async () => {
    const justiceAddr = makeAddr('suspensionJustice');
    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
        'nominateJusticeDuringSuspension', [justiceAddr, 7]),
      'DeputyDesignationOverdue',
    );
  });

  it('revert: nominateJusticeSecondDuringSuspension deputyOverdue', async () => {
    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
        'nominateJusticeSecondDuringSuspension', [makeAddr('j'), 7]),
      'DeputyDesignationOverdue',
    );
  });

  it('revert: appointJusticeFromListDuringSuspension deputyOverdue', async () => {
    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
        'appointJusticeFromListDuringSuspension', [7, 0]),
      'DeputyDesignationOverdue',
    );
  });

  // ── 5c: Caretaker bypass ─────────────────────────────────────────────

  it('caretakerBypass: nomination succeeds during Crown suspension', async () => {
    await writeAs(env.contracts.parliament, env.publicClient, env.senators[0], env.testClient,
      'initiateFormationDuringSuspension', []);
    expect(await env.contracts.executive.read('isCaretaker')).toBe(true);

    const justiceAddr = makeAddr('suspensionJustice');
    await asAccount(env.testClient, env.addresses.executive, async () => {
      const c = contractAs(env.contracts.court, env.publicClient, walletForAddress(env.addresses.executive));
      await c.write('nominateJustice', [justiceAddr, 7], env.addresses.executive);
    });
    const stage = await env.contracts.court.read('getAppointmentStage', [7]);
    expect(Number(stage)).toBe(1); // CrownNom1
  });

  // ── 5d: Crown cannot nominate during suspension ──────────────────────

  it('revert: Crown cannot nominate during suspension (NotMonarch)', async () => {
    const justiceAddr = makeAddr('suspensionJustice');
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'nominateJustice', [justiceAddr, 7]),
      'NotMonarch',
    );
  });

  // ── 5e: Non-PM cannot nominate ───────────────────────────────────────

  it('revert: nominateJusticeDuringSuspension notPM', async () => {
    await writeAs(env.contracts.executive, env.publicClient, env.actors.pmCandidate, env.testClient,
      'designateDeputyPM', [env.actors.citizen1]);
    await expectRevert(
      writeAs(env.contracts.executive, env.publicClient, env.actors.citizen1, env.testClient,
        'nominateJusticeDuringSuspension', [makeAddr('j'), 7]),
      'NotPrimeMinister',
    );
  });
});
