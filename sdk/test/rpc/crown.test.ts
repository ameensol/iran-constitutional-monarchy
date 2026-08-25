/**
 * Crown.sol RPC tests — port of Crown.t.sol (116 tests).
 *
 * Organized by scenario:
 * 1. Pre-Coronation (standalone deploy, 12 tests)
 * 2. Coronated (full deploy, 38 tests)
 * 3. With Succession + Regency + Suspension + Exhaustion (66 tests)
 */

import {
  type Address,
  type PublicClient,
  type TestClient,
  getAddress,
  keccak256,
  encodePacked,
  toHex,
  padHex,
  zeroAddress,
} from 'viem';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import {
  setupGovBase,
  type GovTestEnv,
  contractAs,
  writeAs,
  walletForAddress,
} from '../setup/fixtures.js';
import {
  makeAddr,
  deployerWallet,
  deployStandalone,
  expectRevert,
  getEvents,
  setCode,
} from '../setup/testUtils.js';
import {
  setupMajlis,
  setupSenate,
  setupJustices,
  certifyFact,
  executeMajlisAction,
  prepareMajlisAction,
  type SenateEnv,
  type JusticesEnv,
} from '../setup/mixins.js';
import {
  createAnvilClients,
  warpForward,
  DAYS,
  asAccount,
  setBalance,
} from '../../src/client/AnvilHelpers.js';
import {
  ConstitutionArtifact,
  CrownArtifact,
} from '../../src/abi/index.js';
import { Contract } from '../../src/client/GovClient.js';

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 1: PRE-CORONATION (standalone deploy, no monarch)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Crown Pre-Coronation', () => {
  let publicClient: PublicClient;
  let testClient: TestClient;
  let deployer: Address;
  let crown: Contract;
  let constitution: Contract;
  let snapshotId: `0x${string}`;

  const monarchAddr = makeAddr('monarch');
  const heir1 = makeAddr('heir1');
  const unauthorized = makeAddr('unauthorized');

  // Mock contract addresses
  const mockRegistry = makeAddr('mockRegistry');
  const mockParliament = makeAddr('mockParliament');
  const mockExecutive = makeAddr('mockExecutive');
  const mockCourt = makeAddr('mockCourt');
  const mockElection = makeAddr('mockElection');
  const mockReferendum = makeAddr('mockReferendum');
  const mockBudget = makeAddr('mockBudget');
  const mockPC = makeAddr('mockPC');
  const mockVerifier = makeAddr('mockVerifier');

  beforeAll(async () => {
    const clients = createAnvilClients();
    publicClient = clients.public;
    testClient = clients.test;

    // Reset Anvil
    await fetch('http://127.0.0.1:8545', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'anvil_reset', params: [], id: 1 }),
    });

    const dw = deployerWallet();
    deployer = dw.account!.address;

    // Deploy Constitution + Crown
    constitution = await deployStandalone(publicClient, dw, ConstitutionArtifact);
    crown = await deployStandalone(publicClient, dw, CrownArtifact, [constitution.address]);

    // Etch mock bytecode at all mock addresses
    const mocks = [mockRegistry, mockParliament, mockExecutive, mockCourt,
      mockElection, mockReferendum, mockBudget, mockPC, mockVerifier];
    for (const m of mocks) {
      await setCode(testClient, m);
    }

    // Get contract name keys
    const keys = await Promise.all([
      constitution.read('CONTRACT_CITIZEN_REGISTRY'),
      constitution.read('CONTRACT_CROWN'),
      constitution.read('CONTRACT_PARLIAMENT'),
      constitution.read('CONTRACT_EXECUTIVE'),
      constitution.read('CONTRACT_SUPREME_COURT'),
      constitution.read('CONTRACT_ELECTION'),
      constitution.read('CONTRACT_REFERENDUM'),
      constitution.read('CONTRACT_BUDGET'),
      constitution.read('CONTRACT_PROVINCIAL_COUNCIL'),
      constitution.read('CONTRACT_BALLOT_VERIFIER'),
    ]) as `0x${string}`[];

    const addrs: Address[] = [
      mockRegistry, crown.address, mockParliament, mockExecutive,
      mockCourt, mockElection, mockReferendum, mockBudget, mockPC, mockVerifier,
    ];

    await constitution.write('initialize', [keys, addrs]);
  });

  beforeEach(async () => { snapshotId = await testClient.snapshot(); });
  afterEach(async () => { await testClient.revert({ id: snapshotId }); });

  // ── Constructor ──────────────────────────────────────────────────────────

  it('constructor: sets constitution address', async () => {
    expect(await crown.read('constitution')).toBe(getAddress(constitution.address));
  });

  it('constructor: not suspended', async () => {
    expect(await crown.read('suspended')).toBe(false);
  });

  it('constructor: revert on zero address', async () => {
    const dw = deployerWallet();
    await expectRevert(
      deployStandalone(publicClient, dw, CrownArtifact, [zeroAddress]),
      'ZeroAddress',
    );
  });

  // ── Coronation ────────────────────────────────────────────────────────────

  it('coronation: sets monarch role', async () => {
    await crown.write('coronation', [monarchAddr]);
    const ROLE_MONARCH = await constitution.read('ROLE_MONARCH') as `0x${string}`;
    expect(await constitution.read('getRole', [ROLE_MONARCH])).toBe(getAddress(monarchAddr));
  });

  it('coronation: emits Coronation event', async () => {
    const hash = await crown.write('coronation', [monarchAddr]);
    const events = await getEvents(publicClient, hash, crown.artifact.abi, 'Coronation');
    expect(events.length).toBe(1);
    expect((events[0] as any).args.monarch).toBe(getAddress(monarchAddr));
  });

  it('coronation: auto-finalizes setup', async () => {
    await crown.write('coronation', [monarchAddr]);
    expect(await constitution.read('deployer')).toBe(zeroAddress);
  });

  it('coronation: revert if already crowned', async () => {
    await crown.write('coronation', [monarchAddr]);
    await expectRevert(
      crown.write('coronation', [heir1]),
      'MonarchAlreadySet',
    );
  });

  it('coronation: revert on zero address', async () => {
    await expectRevert(
      crown.write('coronation', [zeroAddress]),
      'ZeroAddress',
    );
  });

  it('coronation: revert if not deployer', async () => {
    await setBalance(testClient, unauthorized, 10n ** 20n);
    const w = walletForAddress(unauthorized);
    const crownUnauth = new Contract(crown.address, crown.artifact, publicClient, w);
    await asAccount(testClient, unauthorized, async () => {
      await expectRevert(
        crownUnauth.write('coronation', [monarchAddr]),
        'NotAuthorized',
      );
    });
  });

  it('coronation: revert after auto-finalize (deployer wiped)', async () => {
    await crown.write('coronation', [monarchAddr]);
    // Vacate monarch via Crown's setRole
    const ROLE_MONARCH = await constitution.read('ROLE_MONARCH') as `0x${string}`;
    await asAccount(testClient, crown.address, async () => {
      const cc = contractAs(constitution, publicClient, walletForAddress(crown.address));
      await cc.write('setRole', [ROLE_MONARCH, zeroAddress], crown.address);
    });
    // Deployer is wiped — coronation reverts
    await expectRevert(
      crown.write('coronation', [heir1]),
      'NotAuthorized',
    );
  });

  it('finalizeSetup: revert after coronation', async () => {
    await crown.write('coronation', [monarchAddr]);
    await expectRevert(
      constitution.write('finalizeSetup', []),
      'AlreadyFinalized',
    );
  });

  // ── Boundary ──────────────────────────────────────────────────────────────

  it('boundary: no monarch — nominatePM reverts NotMonarch', async () => {
    await setBalance(testClient, monarchAddr, 10n ** 20n);
    await asAccount(testClient, monarchAddr, async () => {
      const crownM = contractAs(crown, publicClient, walletForAddress(monarchAddr));
      await expectRevert(
        crownM.write('nominatePrimeMinister', [makeAddr('pm')], monarchAddr),
        'NotMonarch',
      );
    });
  });

  it('boundary: succession list starts empty', async () => {
    expect(await crown.read('successionListLength')).toBe(0n);
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 2: CORONATED (full deploy, monarch set)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Crown Coronated', () => {
  let env: GovTestEnv;
  let snapshotId: `0x${string}`;

  const unauthorized = makeAddr('unauthorized');

  beforeAll(async () => {
    env = await setupGovBase();
  });

  beforeEach(async () => { snapshotId = await env.testClient.snapshot(); });
  afterEach(async () => { await env.testClient.revert({ id: snapshotId }); });

  // ── PM Nomination (modifier tests) ────────────────────────────────────────

  it('nominatePM: revert on zero address', async () => {
    // Need formation for PM nomination to work; but ZeroAddress check is first
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'nominatePrimeMinister', [zeroAddress]),
      'ZeroAddress',
    );
  });

  it('nominatePM: revert if not monarch', async () => {
    await setBalance(env.testClient, unauthorized, 10n ** 20n);
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, unauthorized, env.testClient,
        'nominatePrimeMinister', [makeAddr('pm')]),
      'NotMonarch',
    );
  });

  // ── Justice Nomination ────────────────────────────────────────────────────

  it('nominateJustice: happy path — nominates to empty seat', async () => {
    const candidate = env.actors.citizen1;
    const hash = await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'nominateJustice', [candidate, 0]);
    const events = await getEvents(env.publicClient, hash, env.contracts.crown.artifact.abi, 'JusticeNominated');
    expect(events.length).toBe(1);
    expect((events[0] as any).args.nominee).toBe(getAddress(candidate));
  });

  it('nominateJustice: revert on zero address', async () => {
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'nominateJustice', [zeroAddress, 0]),
      'ZeroAddress',
    );
  });

  it('nominateJustice: revert if not monarch', async () => {
    await setBalance(env.testClient, unauthorized, 10n ** 20n);
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, unauthorized, env.testClient,
        'nominateJustice', [env.actors.citizen1, 0]),
      'NotMonarch',
    );
  });

  it('nominateJusticeSecond: revert on zero address', async () => {
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'nominateJusticeSecond', [zeroAddress, 0]),
      'ZeroAddress',
    );
  });

  it('nominateJusticeSecond: revert if not monarch', async () => {
    await setBalance(env.testClient, unauthorized, 10n ** 20n);
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, unauthorized, env.testClient,
        'nominateJusticeSecond', [env.actors.citizen1, 0]),
      'NotMonarch',
    );
  });

  it('appointJusticeFromList: revert if not monarch', async () => {
    await setBalance(env.testClient, unauthorized, 10n ** 20n);
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, unauthorized, env.testClient,
        'appointJusticeFromList', [0, 1]),
      'NotMonarch',
    );
  });

  // ── PM from List ──────────────────────────────────────────────────────────

  it('appointPMFromList: revert if not monarch', async () => {
    await setBalance(env.testClient, unauthorized, 10n ** 20n);
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, unauthorized, env.testClient,
        'appointPMFromList', [0]),
      'NotMonarch',
    );
  });

  // ── Senator Appointment ───────────────────────────────────────────────────

  it('appointSenators: revert on zero address', async () => {
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'appointSenators', [[env.actors.citizen1, zeroAddress]]),
      'ZeroAddress',
    );
  });

  it('appointSenators: revert if not monarch', async () => {
    await setBalance(env.testClient, unauthorized, 10n ** 20n);
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, unauthorized, env.testClient,
        'appointSenators', [[env.actors.citizen1]]),
      'NotMonarch',
    );
  });

  // ── Legislative Actions (modifier only) ───────────────────────────────────

  it('returnLaw: revert if not monarch', async () => {
    await setBalance(env.testClient, unauthorized, 10n ** 20n);
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, unauthorized, env.testClient,
        'returnLaw', [42]),
      'NotMonarch',
    );
  });

  it('referToSupremeCourt: revert if not monarch', async () => {
    await setBalance(env.testClient, unauthorized, 10n ** 20n);
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, unauthorized, env.testClient,
        'referToSupremeCourt', [42]),
      'NotMonarch',
    );
  });

  it('enactLaw: revert if not monarch', async () => {
    await setBalance(env.testClient, unauthorized, 10n ** 20n);
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, unauthorized, env.testClient,
        'enactLaw', [42]),
      'NotMonarch',
    );
  });

  // ── Dissolution ───────────────────────────────────────────────────────────

  it('declareDissolution: revert if not monarch', async () => {
    await setBalance(env.testClient, unauthorized, 10n ** 20n);
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, unauthorized, env.testClient,
        'declareDissolution', []),
      'NotMonarch',
    );
  });

  // ── Senate Stagger ────────────────────────────────────────────────────────

  it('initializeSenateStagger: revert if not monarch', async () => {
    await setBalance(env.testClient, unauthorized, 10n ** 20n);
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, unauthorized, env.testClient,
        'initializeSenateStagger', [[env.actors.citizen1]]),
      'NotMonarch',
    );
  });

  // ── Provincial Council Init ───────────────────────────────────────────────

  it('initializeProvincialCouncils: revert if not monarch', async () => {
    const inits = [{ id: 99, name: padHex(toHex('TEST'), { size: 32 }), councilSize: 5n, senateSeatCount: 2n, majlisSeatCount: 10n, cohort: 0 }];
    await setBalance(env.testClient, unauthorized, 10n ** 20n);
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, unauthorized, env.testClient,
        'initializeProvincialCouncils', [inits]),
      'NotMonarch',
    );
  });

  // ── Acting PM ─────────────────────────────────────────────────────────────

  it('designateActingPM: revert if not monarch', async () => {
    await setBalance(env.testClient, unauthorized, 10n ** 20n);
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, unauthorized, env.testClient,
        'designateActingPM', [makeAddr('acting')]),
      'NotMonarch',
    );
  });

  // ── Execute Ministerial Act ───────────────────────────────────────────────

  it('executeMinisterialAct: happy path on Constitution', async () => {
    // Call a valid view function via ministerial act
    const paramKey = await env.contracts.constitution.read('PARAM_MAJLIS_TERM') as `0x${string}`;
    const data = env.contracts.constitution.encode('getParameter', [paramKey]);
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'executeMinisterialAct', [env.addresses.constitution, data]);
  });

  it('executeMinisterialAct: happy path on ProvincialCouncil', async () => {
    // Call a valid function on PC
    const data = env.contracts.pc.encode('selectionCount', []);
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'executeMinisterialAct', [env.addresses.pc, data]);
  });

  it('executeMinisterialAct: revert if not monarch', async () => {
    const data = env.contracts.constitution.encode('getParameter', [padHex('0x', { size: 32 })]);
    await setBalance(env.testClient, unauthorized, 10n ** 20n);
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, unauthorized, env.testClient,
        'executeMinisterialAct', [env.addresses.constitution, data]),
      'NotMonarch',
    );
  });

  it('executeMinisterialAct: revert on invalid target', async () => {
    const unregistered = makeAddr('unregistered');
    const data = '0xdeadbeef' as `0x${string}`;
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'executeMinisterialAct', [unregistered, data]),
      'InvalidTarget',
    );
  });

  it('executeMinisterialAct: revert on execution failure', async () => {
    // Call constitution.initialize which reverts (already initialized)
    const data = env.contracts.constitution.encode('initialize', [[], []]);
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'executeMinisterialAct', [env.addresses.constitution, data]),
      'ExecutionFailed',
    );
  });

  // ── Boundary: CrownNotSuspended ────────────────────────────────────────

  it('claimCrownResumption: revert if not suspended', async () => {
    await expectRevert(
      env.contracts.crown.write('claimCrownResumption', []),
      'CrownNotSuspended',
    );
  });

  it('claimSuccessionReferendumDeadline: revert if not exhausted', async () => {
    await expectRevert(
      env.contracts.crown.write('claimSuccessionReferendumDeadline', []),
      'SuccessionNotExhausted',
    );
  });

  // ── With Majlis (nested — tests needing seated Majlis) ──────────────────

  describe('With Majlis', () => {
    beforeAll(async () => {
      await setupMajlis(env);
    });

    // ── PM Nomination (happy path) ─────────────────────────────────────

    it('nominatePM: happy path after starting formation', async () => {
      // Start formation via Majlis governance action
      const startData = env.contracts.executive.encode('startFormation', []);
      await executeMajlisAction(env, env.addresses.executive, startData);

      // Monarch nominates PM
      const hash = await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'nominatePrimeMinister', [env.actors.pmCandidate]);
      const events = await getEvents(env.publicClient, hash, env.contracts.crown.artifact.abi, 'PMNominated');
      expect(events.length).toBe(1);
      expect((events[0] as any).args.nominee).toBe(getAddress(env.actors.pmCandidate));
    });

    // ── Dissolution ─────────────────────────────────────────────────────

    it('declareDissolution: happy path', async () => {
      const hash = await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'declareDissolution', []);
      const events = await getEvents(env.publicClient, hash, env.contracts.crown.artifact.abi, 'DissolutionDeclared');
      expect(events.length).toBe(1);
    });

    // ── Designate Acting PM ─────────────────────────────────────────────

    it('designateActingPM: happy path during formation', async () => {
      const startData = env.contracts.executive.encode('startFormation', []);
      await executeMajlisAction(env, env.addresses.executive, startData);

      await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'designateActingPM', [env.actors.pmCandidate]);
      const ROLE_PM = await env.contracts.constitution.read('ROLE_PRIME_MINISTER') as `0x${string}`;
      expect(await env.contracts.constitution.read('getRole', [ROLE_PM])).toBe(getAddress(env.actors.pmCandidate));
    });

    it('designateActingPM: revert if no formation', async () => {
      // No formation in progress
      await expectRevert(
        writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
          'designateActingPM', [makeAddr('acting')]),
        'revert', // Wrapped by Crown
      );
    });

    // Note: appointSenators happy path requires elected senators first (10% Crown cap).
    // Tested through setupSenate mixin in Succession Suite.

    // Note: initializeSenateStagger happy path requires senators to be seated.
    // Tested through setupSenate mixin in Succession Suite.

    // Note: initializeProvincialCouncils happy path can only run once (ProvincesAlreadyInitialized).
    // Tested through setupGovBase in fixtures.ts.

    // ── Nomination Wrong Stage ──────────────────────────────────────────

    it('nominatePM: revert in Idle stage (no formation)', async () => {
      await expectRevert(
        writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
          'nominatePrimeMinister', [env.actors.pmCandidate]),
        'revert', // Executive reverts, Crown propagates directly
      );
    });
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIOS 3-6: SUCCESSION SUITE
// Full setup: GovBase + Majlis + Senate + Justices + heirs registered + succession list
// ═══════════════════════════════════════════════════════════════════════════════

describe('Crown Succession Suite', () => {
  let env: JusticesEnv;
  let snapshotId: `0x${string}`;

  // Heirs (deterministic addresses — will be registered as citizens + funded)
  const heir1 = makeAddr('heir1');
  const heir2 = makeAddr('heir2');
  const heir3 = makeAddr('heir3');
  const unauthorized = makeAddr('unauthorized');

  beforeAll(async () => {
    // Full governance setup
    const baseEnv = await setupGovBase();
    await setupMajlis(baseEnv);
    const senateEnv = await setupSenate(baseEnv);
    env = await setupJustices(senateEnv);

    // Register heirs as citizens
    const authWallet = walletForAddress(env.actors.authorityKey);
    const authRegistry = contractAs(env.contracts.registry, env.publicClient, authWallet);
    for (const heir of [heir1, heir2, heir3]) {
      const idHash = keccak256(encodePacked(['string', 'address'], ['heir', heir]));
      await authRegistry.write('registerCitizen', [heir, idHash, 1], env.actors.authorityKey);
    }

    // Fund heirs for transactions
    for (const heir of [heir1, heir2, heir3, unauthorized]) {
      await setBalance(env.testClient, heir, 10n ** 20n);
    }

    // Certify SUCCESSION_LIST_UPDATE so we can set the succession list
    const succListHash = keccak256(encodePacked(
      ['string', 'address'], ['SUCCESSION_LIST_UPDATE', env.actors.monarchAddr],
    ));
    await certifyFact(env, succListHash);

    // Set succession list
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'updateSuccessionList', [[heir1, heir2, heir3]]);
  });

  beforeEach(async () => { snapshotId = await env.testClient.snapshot(); });
  afterEach(async () => { await env.testClient.revert({ id: snapshotId }); });

  // ═══ Update Succession List ═══════════════════════════════════════════════

  it('updateSuccessionList: happy path — replaces list', async () => {
    // SUCCESSION_LIST_UPDATE already certified in beforeAll
    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'updateSuccessionList', [[heir1, heir2]]);

    const list = await env.contracts.crown.read('getSuccessionList') as Address[];
    expect(list.length).toBe(2);
    expect(list[0]).toBe(getAddress(heir1));
    expect(list[1]).toBe(getAddress(heir2));
    expect(await env.contracts.crown.read('successionListLength')).toBe(2n);
  });

  it('updateSuccessionList: emits SuccessorUpdated events', async () => {
    // SUCCESSION_LIST_UPDATE already certified in beforeAll
    const hash = await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'updateSuccessionList', [[heir1, heir2]]);
    const events = await getEvents(env.publicClient, hash, env.contracts.crown.artifact.abi, 'SuccessorUpdated');
    expect(events.length).toBe(2);
  });

  it('updateSuccessionList: revert on zero address', async () => {
    // SUCCESSION_LIST_UPDATE already certified in beforeAll
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'updateSuccessionList', [[heir1, zeroAddress]]),
      'ZeroAddress',
    );
  });

  it('updateSuccessionList: revert if not monarch', async () => {
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, unauthorized, env.testClient,
        'updateSuccessionList', [[heir1]]),
      'NotMonarch',
    );
  });

  it('updateSuccessionList: revert if too long (>20)', async () => {
    // SUCCESSION_LIST_UPDATE already certified in beforeAll
    // Create 21 addresses, register as citizens
    const longList: Address[] = [];
    const authWallet = walletForAddress(env.actors.authorityKey);
    const authRegistry = contractAs(env.contracts.registry, env.publicClient, authWallet);
    for (let i = 0; i < 21; i++) {
      const addr = makeAddr(`longheir${i}`);
      longList.push(addr);
      const idHash = keccak256(encodePacked(['string', 'address'], ['longheir', addr]));
      await authRegistry.write('registerCitizen', [addr, idHash, 1], env.actors.authorityKey);
    }

    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'updateSuccessionList', [longList]),
      'SuccessionListTooLong',
    );
  });

  // Note: "revert if court cert not found" is untestable here because
  // SUCCESSION_LIST_UPDATE is permanently certified in beforeAll.
  // The CourtCertificationRequired revert path is tested via abdicate and
  // claimSuccession which use different fact hashes.

  it('updateSuccessionList: revert if heir not citizen', async () => {
    // SUCCESSION_LIST_UPDATE already certified in beforeAll
    const notCitizen = makeAddr('notCitizen');
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'updateSuccessionList', [[heir1, notCitizen]]),
      'NotCitizen',
    );
  });

  // ═══ Abdication ═══════════════════════════════════════════════════════════

  it('abdicate: happy path — crowns heir', async () => {
    // Certify abdication + heir confirmation
    const abdicationHash = keccak256(encodePacked(
      ['string', 'address'], ['ABDICATION_CERTIFIED', env.actors.monarchAddr],
    ));
    const heirHash = keccak256(encodePacked(
      ['string', 'address', 'address'], ['HEIR_CONFIRMED', env.actors.monarchAddr, heir1],
    ));
    await certifyFact(env, abdicationHash);
    await certifyFact(env, heirHash);

    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'abdicate', [heir1]);

    const ROLE_MONARCH = await env.contracts.constitution.read('ROLE_MONARCH') as `0x${string}`;
    expect(await env.contracts.constitution.read('getRole', [ROLE_MONARCH])).toBe(getAddress(heir1));
  });

  it('abdicate: emits Abdication and SuccessionTriggered events', async () => {
    const abdicationHash = keccak256(encodePacked(
      ['string', 'address'], ['ABDICATION_CERTIFIED', env.actors.monarchAddr],
    ));
    const heirHash = keccak256(encodePacked(
      ['string', 'address', 'address'], ['HEIR_CONFIRMED', env.actors.monarchAddr, heir1],
    ));
    await certifyFact(env, abdicationHash);
    await certifyFact(env, heirHash);

    const hash = await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'abdicate', [heir1]);

    const abdEvents = await getEvents(env.publicClient, hash, env.contracts.crown.artifact.abi, 'Abdication');
    expect(abdEvents.length).toBe(1);
    const succEvents = await getEvents(env.publicClient, hash, env.contracts.crown.artifact.abi, 'SuccessionTriggered');
    expect(succEvents.length).toBe(1);
  });

  it('abdicate: revert if court cert missing', async () => {
    // Only certify HEIR_CONFIRMED, not ABDICATION_CERTIFIED
    const heirHash = keccak256(encodePacked(
      ['string', 'address', 'address'], ['HEIR_CONFIRMED', env.actors.monarchAddr, heir1],
    ));
    await certifyFact(env, heirHash);

    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'abdicate', [heir1]),
      'CourtCertificationRequired',
    );
  });

  it('abdicate: revert if heir not confirmed', async () => {
    // Only certify ABDICATION_CERTIFIED, not HEIR_CONFIRMED
    const abdicationHash = keccak256(encodePacked(
      ['string', 'address'], ['ABDICATION_CERTIFIED', env.actors.monarchAddr],
    ));
    await certifyFact(env, abdicationHash);

    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'abdicate', [heir1]),
      'HeirNotConfirmed',
    );
  });

  it('abdicate: revert if successor not in list (eligible heirs ahead)', async () => {
    // With real contracts, heir1 is eligible and ahead of unauthorized in the list,
    // so _verifySuccessionOrder hits SuccessionOrderViolated before InvalidSuccessor
    const abdicationHash = keccak256(encodePacked(
      ['string', 'address'], ['ABDICATION_CERTIFIED', env.actors.monarchAddr],
    ));
    const heirHash = keccak256(encodePacked(
      ['string', 'address', 'address'], ['HEIR_CONFIRMED', env.actors.monarchAddr, unauthorized],
    ));
    await certifyFact(env, abdicationHash);
    await certifyFact(env, heirHash);

    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'abdicate', [unauthorized]),
      'SuccessionOrderViolated',
    );
  });

  it('abdicate: revert if succession order violated', async () => {
    // Try to abdicate to heir2 while heir1 is still eligible
    const abdicationHash = keccak256(encodePacked(
      ['string', 'address'], ['ABDICATION_CERTIFIED', env.actors.monarchAddr],
    ));
    const heirHash = keccak256(encodePacked(
      ['string', 'address', 'address'], ['HEIR_CONFIRMED', env.actors.monarchAddr, heir2],
    ));
    await certifyFact(env, abdicationHash);
    await certifyFact(env, heirHash);

    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
        'abdicate', [heir2]),
      'SuccessionOrderViolated',
    );
  });

  it('abdicate: revert if not monarch', async () => {
    await expectRevert(
      writeAs(env.contracts.crown, env.publicClient, unauthorized, env.testClient,
        'abdicate', [heir1]),
      'NotMonarch',
    );
  });

  it('abdicate: clears heir slot', async () => {
    const abdicationHash = keccak256(encodePacked(
      ['string', 'address'], ['ABDICATION_CERTIFIED', env.actors.monarchAddr],
    ));
    const heirHash = keccak256(encodePacked(
      ['string', 'address', 'address'], ['HEIR_CONFIRMED', env.actors.monarchAddr, heir1],
    ));
    await certifyFact(env, abdicationHash);
    await certifyFact(env, heirHash);

    await writeAs(env.contracts.crown, env.publicClient, env.actors.monarchAddr, env.testClient,
      'abdicate', [heir1]);

    expect(await env.contracts.crown.read('successionList', [0])).toBe(zeroAddress);
  });

  // ═══ Claim Succession ═════════════════════════════════════════════════════

  it('claimSuccession: happy path — crowns heir1', async () => {
    const vacancyHash = keccak256(encodePacked(
      ['string', 'address'], ['MONARCH_VACANCY', env.actors.monarchAddr],
    ));
    const heirHash = keccak256(encodePacked(
      ['string', 'address', 'address'], ['HEIR_CONFIRMED', env.actors.monarchAddr, heir1],
    ));
    await certifyFact(env, vacancyHash);
    await certifyFact(env, heirHash);

    await env.contracts.crown.write('claimSuccession', [heir1]);

    const ROLE_MONARCH = await env.contracts.constitution.read('ROLE_MONARCH') as `0x${string}`;
    expect(await env.contracts.constitution.read('getRole', [ROLE_MONARCH])).toBe(getAddress(heir1));
  });

  it('claimSuccession: permissionless — anyone can call', async () => {
    const vacancyHash = keccak256(encodePacked(
      ['string', 'address'], ['MONARCH_VACANCY', env.actors.monarchAddr],
    ));
    const heirHash = keccak256(encodePacked(
      ['string', 'address', 'address'], ['HEIR_CONFIRMED', env.actors.monarchAddr, heir1],
    ));
    await certifyFact(env, vacancyHash);
    await certifyFact(env, heirHash);

    // Anyone can call
    await writeAs(env.contracts.crown, env.publicClient, unauthorized, env.testClient,
      'claimSuccession', [heir1]);

    const ROLE_MONARCH = await env.contracts.constitution.read('ROLE_MONARCH') as `0x${string}`;
    expect(await env.contracts.constitution.read('getRole', [ROLE_MONARCH])).toBe(getAddress(heir1));
  });

  it('claimSuccession: revert if vacancy not certified', async () => {
    // Don't certify vacancy
    await expectRevert(
      env.contracts.crown.write('claimSuccession', [heir1]),
      'VacancyNotCertified',
    );
  });

  it('claimSuccession: revert if heir not confirmed', async () => {
    const vacancyHash = keccak256(encodePacked(
      ['string', 'address'], ['MONARCH_VACANCY', env.actors.monarchAddr],
    ));
    await certifyFact(env, vacancyHash);
    // Don't certify HEIR_CONFIRMED

    await expectRevert(
      env.contracts.crown.write('claimSuccession', [heir1]),
      'HeirNotConfirmed',
    );
  });

  it('claimSuccession: revert if successor not in list (eligible heirs ahead)', async () => {
    // With real contracts, heir1 is eligible and ahead of unauthorized,
    // so _verifySuccessionOrder hits SuccessionOrderViolated first
    const vacancyHash = keccak256(encodePacked(
      ['string', 'address'], ['MONARCH_VACANCY', env.actors.monarchAddr],
    ));
    const heirHash = keccak256(encodePacked(
      ['string', 'address', 'address'], ['HEIR_CONFIRMED', env.actors.monarchAddr, unauthorized],
    ));
    await certifyFact(env, vacancyHash);
    await certifyFact(env, heirHash);

    await expectRevert(
      env.contracts.crown.write('claimSuccession', [unauthorized]),
      'SuccessionOrderViolated',
    );
  });

  it('claimSuccession: skips Court-ineligible heir', async () => {
    const vacancyHash = keccak256(encodePacked(
      ['string', 'address'], ['MONARCH_VACANCY', env.actors.monarchAddr],
    ));
    const heirHash = keccak256(encodePacked(
      ['string', 'address', 'address'], ['HEIR_CONFIRMED', env.actors.monarchAddr, heir2],
    ));
    const ineligHash = keccak256(encodePacked(
      ['string', 'address'], ['SUCCESSION_INELIGIBLE', heir1],
    ));
    await certifyFact(env, vacancyHash);
    await certifyFact(env, heirHash);
    await certifyFact(env, ineligHash);

    await env.contracts.crown.write('claimSuccession', [heir2]);

    const ROLE_MONARCH = await env.contracts.constitution.read('ROLE_MONARCH') as `0x${string}`;
    expect(await env.contracts.constitution.read('getRole', [ROLE_MONARCH])).toBe(getAddress(heir2));
  });

  it('claimSuccession: revert if eligible heir ahead not excluded', async () => {
    const vacancyHash = keccak256(encodePacked(
      ['string', 'address'], ['MONARCH_VACANCY', env.actors.monarchAddr],
    ));
    const heirHash = keccak256(encodePacked(
      ['string', 'address', 'address'], ['HEIR_CONFIRMED', env.actors.monarchAddr, heir2],
    ));
    await certifyFact(env, vacancyHash);
    await certifyFact(env, heirHash);
    // heir1 is NOT ineligible → order violated

    await expectRevert(
      env.contracts.crown.write('claimSuccession', [heir2]),
      'SuccessionOrderViolated',
    );
  });

  it('claimSuccession: skips revoked citizen', async () => {
    // Revoke heir1's citizenship
    const authWallet = walletForAddress(env.actors.authorityKey);
    const authRegistry = contractAs(env.contracts.registry, env.publicClient, authWallet);
    await authRegistry.write('revokeCitizenship', [heir1], env.actors.authorityKey);

    const vacancyHash = keccak256(encodePacked(
      ['string', 'address'], ['MONARCH_VACANCY', env.actors.monarchAddr],
    ));
    const heirHash = keccak256(encodePacked(
      ['string', 'address', 'address'], ['HEIR_CONFIRMED', env.actors.monarchAddr, heir2],
    ));
    await certifyFact(env, vacancyHash);
    await certifyFact(env, heirHash);

    await env.contracts.crown.write('claimSuccession', [heir2]);

    const ROLE_MONARCH = await env.contracts.constitution.read('ROLE_MONARCH') as `0x${string}`;
    expect(await env.contracts.constitution.read('getRole', [ROLE_MONARCH])).toBe(getAddress(heir2));
  });

  it('claimSuccession: revert if confirmed heir not citizen', async () => {
    // Revoke heir1's citizenship
    const authWallet = walletForAddress(env.actors.authorityKey);
    const authRegistry = contractAs(env.contracts.registry, env.publicClient, authWallet);
    await authRegistry.write('revokeCitizenship', [heir1], env.actors.authorityKey);

    const vacancyHash = keccak256(encodePacked(
      ['string', 'address'], ['MONARCH_VACANCY', env.actors.monarchAddr],
    ));
    const heirHash = keccak256(encodePacked(
      ['string', 'address', 'address'], ['HEIR_CONFIRMED', env.actors.monarchAddr, heir1],
    ));
    await certifyFact(env, vacancyHash);
    await certifyFact(env, heirHash);

    await expectRevert(
      env.contracts.crown.write('claimSuccession', [heir1]),
      'NotCitizen',
    );
  });

  // ═══ Claim Succession Exhausted ═══════════════════════════════════════════

  it('claimSuccessionExhausted: revert if vacancy not certified', async () => {
    await expectRevert(
      env.contracts.crown.write('claimSuccessionExhausted', []),
      'VacancyNotCertified',
    );
  });

  it('claimSuccessionExhausted: revert if eligible member exists', async () => {
    const vacancyHash = keccak256(encodePacked(
      ['string', 'address'], ['MONARCH_VACANCY', env.actors.monarchAddr],
    ));
    await certifyFact(env, vacancyHash);
    // heir1 is eligible → SuccessionNotExhausted

    await expectRevert(
      env.contracts.crown.write('claimSuccessionExhausted', []),
      'SuccessionNotExhausted',
    );
  });

  it('claimSuccessionExhausted: all ineligible → suspends Crown', async () => {
    const vacancyHash = keccak256(encodePacked(
      ['string', 'address'], ['MONARCH_VACANCY', env.actors.monarchAddr],
    ));
    await certifyFact(env, vacancyHash);

    // Mark all heirs ineligible
    for (const heir of [heir1, heir2, heir3]) {
      const ineligHash = keccak256(encodePacked(
        ['string', 'address'], ['SUCCESSION_INELIGIBLE', heir],
      ));
      await certifyFact(env, ineligHash);
    }

    await env.contracts.crown.write('claimSuccessionExhausted', []);
    expect(await env.contracts.crown.read('suspended')).toBe(true);
    const ROLE_MONARCH = await env.contracts.constitution.read('ROLE_MONARCH') as `0x${string}`;
    expect(await env.contracts.constitution.read('getRole', [ROLE_MONARCH])).toBe(zeroAddress);
  });

  // ═══ Regency ══════════════════════════════════════════════════════════════

  it('claimRegency: happy path — sets regent', async () => {
    const incapHash = keccak256(encodePacked(
      ['string', 'address'], ['MONARCH_INCAPACITY', env.actors.monarchAddr],
    ));
    const regentHash = keccak256(encodePacked(
      ['string', 'address', 'address'], ['REGENT_CONFIRMED', env.actors.monarchAddr, heir1],
    ));
    await certifyFact(env, incapHash);
    await certifyFact(env, regentHash);

    await env.contracts.crown.write('claimRegency', [heir1]);

    const ROLE_REGENT = await env.contracts.constitution.read('ROLE_REGENT') as `0x${string}`;
    expect(await env.contracts.constitution.read('getRole', [ROLE_REGENT])).toBe(getAddress(heir1));
  });

  it('claimRegency: emits RegencyStarted event', async () => {
    const incapHash = keccak256(encodePacked(
      ['string', 'address'], ['MONARCH_INCAPACITY', env.actors.monarchAddr],
    ));
    const regentHash = keccak256(encodePacked(
      ['string', 'address', 'address'], ['REGENT_CONFIRMED', env.actors.monarchAddr, heir1],
    ));
    await certifyFact(env, incapHash);
    await certifyFact(env, regentHash);

    const hash = await env.contracts.crown.write('claimRegency', [heir1]);
    const events = await getEvents(env.publicClient, hash, env.contracts.crown.artifact.abi, 'RegencyStarted');
    expect(events.length).toBe(1);
    expect((events[0] as any).args.regent).toBe(getAddress(heir1));
  });

  it('claimRegency: permissionless', async () => {
    const incapHash = keccak256(encodePacked(
      ['string', 'address'], ['MONARCH_INCAPACITY', env.actors.monarchAddr],
    ));
    const regentHash = keccak256(encodePacked(
      ['string', 'address', 'address'], ['REGENT_CONFIRMED', env.actors.monarchAddr, heir1],
    ));
    await certifyFact(env, incapHash);
    await certifyFact(env, regentHash);

    await writeAs(env.contracts.crown, env.publicClient, unauthorized, env.testClient,
      'claimRegency', [heir1]);

    const ROLE_REGENT = await env.contracts.constitution.read('ROLE_REGENT') as `0x${string}`;
    expect(await env.contracts.constitution.read('getRole', [ROLE_REGENT])).toBe(getAddress(heir1));
  });

  it('claimRegency: regent NOT removed from succession list', async () => {
    const incapHash = keccak256(encodePacked(
      ['string', 'address'], ['MONARCH_INCAPACITY', env.actors.monarchAddr],
    ));
    const regentHash = keccak256(encodePacked(
      ['string', 'address', 'address'], ['REGENT_CONFIRMED', env.actors.monarchAddr, heir1],
    ));
    await certifyFact(env, incapHash);
    await certifyFact(env, regentHash);

    await env.contracts.crown.write('claimRegency', [heir1]);
    expect(await env.contracts.crown.read('successionList', [0])).toBe(getAddress(heir1));
  });

  it('claimRegency: revert on zero address', async () => {
    const incapHash = keccak256(encodePacked(
      ['string', 'address'], ['MONARCH_INCAPACITY', env.actors.monarchAddr],
    ));
    await certifyFact(env, incapHash);

    await expectRevert(
      env.contracts.crown.write('claimRegency', [zeroAddress]),
      'ZeroAddress',
    );
  });

  it('claimRegency: revert if incapacity not certified', async () => {
    await expectRevert(
      env.contracts.crown.write('claimRegency', [heir1]),
      'IncapacityNotCertified',
    );
  });

  it('claimRegency: revert if not in list (eligible heirs ahead)', async () => {
    // With real contracts, heir1 is eligible and ahead of unauthorized,
    // so _verifySuccessionOrder hits SuccessionOrderViolated first
    const incapHash = keccak256(encodePacked(
      ['string', 'address'], ['MONARCH_INCAPACITY', env.actors.monarchAddr],
    ));
    const regentHash = keccak256(encodePacked(
      ['string', 'address', 'address'], ['REGENT_CONFIRMED', env.actors.monarchAddr, unauthorized],
    ));
    await certifyFact(env, incapHash);
    await certifyFact(env, regentHash);

    await expectRevert(
      env.contracts.crown.write('claimRegency', [unauthorized]),
      'SuccessionOrderViolated',
    );
  });

  it('claimRegency: revert if regent not confirmed', async () => {
    const incapHash = keccak256(encodePacked(
      ['string', 'address'], ['MONARCH_INCAPACITY', env.actors.monarchAddr],
    ));
    await certifyFact(env, incapHash);
    // Don't certify REGENT_CONFIRMED

    await expectRevert(
      env.contracts.crown.write('claimRegency', [heir1]),
      'RegentNotConfirmed',
    );
  });

  it('claimRegency: revert if regent already set', async () => {
    const incapHash = keccak256(encodePacked(
      ['string', 'address'], ['MONARCH_INCAPACITY', env.actors.monarchAddr],
    ));
    const regentHash = keccak256(encodePacked(
      ['string', 'address', 'address'], ['REGENT_CONFIRMED', env.actors.monarchAddr, heir1],
    ));
    await certifyFact(env, incapHash);
    await certifyFact(env, regentHash);

    await env.contracts.crown.write('claimRegency', [heir1]);

    // Try to set regent again
    await expectRevert(
      env.contracts.crown.write('claimRegency', [heir2]),
      'RegentAlreadySet',
    );
  });

  // ── Regent Acts as Monarch ──────────────────────────────────────────────

  it('regent can act as monarch (nominateJustice)', async () => {
    // Start regency
    const incapHash = keccak256(encodePacked(
      ['string', 'address'], ['MONARCH_INCAPACITY', env.actors.monarchAddr],
    ));
    const regentHash = keccak256(encodePacked(
      ['string', 'address', 'address'], ['REGENT_CONFIRMED', env.actors.monarchAddr, heir1],
    ));
    await certifyFact(env, incapHash);
    await certifyFact(env, regentHash);
    await env.contracts.crown.write('claimRegency', [heir1]);

    // Regent calls nominateJustice (a new seat, e.g., seat 8)
    await writeAs(env.contracts.crown, env.publicClient, heir1, env.testClient,
      'nominateJustice', [env.actors.citizen1, 8]);
  });

  it('regent can executeMinisterialAct', async () => {
    const incapHash = keccak256(encodePacked(
      ['string', 'address'], ['MONARCH_INCAPACITY', env.actors.monarchAddr],
    ));
    const regentHash = keccak256(encodePacked(
      ['string', 'address', 'address'], ['REGENT_CONFIRMED', env.actors.monarchAddr, heir1],
    ));
    await certifyFact(env, incapHash);
    await certifyFact(env, regentHash);
    await env.contracts.crown.write('claimRegency', [heir1]);

    const paramKey = await env.contracts.constitution.read('PARAM_MAJLIS_TERM') as `0x${string}`;
    const data = env.contracts.constitution.encode('getParameter', [paramKey]);
    await writeAs(env.contracts.crown, env.publicClient, heir1, env.testClient,
      'executeMinisterialAct', [env.addresses.constitution, data]);
  });

  // ── Claim Regency End ──────────────────────────────────────────────────

  it('claimRegencyEnd: clears regent', async () => {
    // Start regency
    const incapHash = keccak256(encodePacked(
      ['string', 'address'], ['MONARCH_INCAPACITY', env.actors.monarchAddr],
    ));
    const regentHash = keccak256(encodePacked(
      ['string', 'address', 'address'], ['REGENT_CONFIRMED', env.actors.monarchAddr, heir1],
    ));
    await certifyFact(env, incapHash);
    await certifyFact(env, regentHash);
    await env.contracts.crown.write('claimRegency', [heir1]);

    // Certify recovery
    const recoveryHash = keccak256(encodePacked(
      ['string', 'address'], ['MONARCH_RECOVERY', env.actors.monarchAddr],
    ));
    await certifyFact(env, recoveryHash);

    await env.contracts.crown.write('claimRegencyEnd', []);

    const ROLE_REGENT = await env.contracts.constitution.read('ROLE_REGENT') as `0x${string}`;
    expect(await env.contracts.constitution.read('getRole', [ROLE_REGENT])).toBe(zeroAddress);
  });

  it('claimRegencyEnd: emits RegencyEnded event', async () => {
    const incapHash = keccak256(encodePacked(
      ['string', 'address'], ['MONARCH_INCAPACITY', env.actors.monarchAddr],
    ));
    const regentHash = keccak256(encodePacked(
      ['string', 'address', 'address'], ['REGENT_CONFIRMED', env.actors.monarchAddr, heir1],
    ));
    await certifyFact(env, incapHash);
    await certifyFact(env, regentHash);
    await env.contracts.crown.write('claimRegency', [heir1]);

    const recoveryHash = keccak256(encodePacked(
      ['string', 'address'], ['MONARCH_RECOVERY', env.actors.monarchAddr],
    ));
    await certifyFact(env, recoveryHash);

    const hash = await env.contracts.crown.write('claimRegencyEnd', []);
    const events = await getEvents(env.publicClient, hash, env.contracts.crown.artifact.abi, 'RegencyEnded');
    expect(events.length).toBe(1);
    expect((events[0] as any).args.regent).toBe(getAddress(heir1));
  });

  it('claimRegencyEnd: permissionless', async () => {
    const incapHash = keccak256(encodePacked(
      ['string', 'address'], ['MONARCH_INCAPACITY', env.actors.monarchAddr],
    ));
    const regentHash = keccak256(encodePacked(
      ['string', 'address', 'address'], ['REGENT_CONFIRMED', env.actors.monarchAddr, heir1],
    ));
    await certifyFact(env, incapHash);
    await certifyFact(env, regentHash);
    await env.contracts.crown.write('claimRegency', [heir1]);

    const recoveryHash = keccak256(encodePacked(
      ['string', 'address'], ['MONARCH_RECOVERY', env.actors.monarchAddr],
    ));
    await certifyFact(env, recoveryHash);

    await writeAs(env.contracts.crown, env.publicClient, unauthorized, env.testClient,
      'claimRegencyEnd', []);

    const ROLE_REGENT = await env.contracts.constitution.read('ROLE_REGENT') as `0x${string}`;
    expect(await env.contracts.constitution.read('getRole', [ROLE_REGENT])).toBe(zeroAddress);
  });

  it('claimRegencyEnd: revert if recovery not certified', async () => {
    const incapHash = keccak256(encodePacked(
      ['string', 'address'], ['MONARCH_INCAPACITY', env.actors.monarchAddr],
    ));
    const regentHash = keccak256(encodePacked(
      ['string', 'address', 'address'], ['REGENT_CONFIRMED', env.actors.monarchAddr, heir1],
    ));
    await certifyFact(env, incapHash);
    await certifyFact(env, regentHash);
    await env.contracts.crown.write('claimRegency', [heir1]);

    // Don't certify recovery
    await expectRevert(
      env.contracts.crown.write('claimRegencyEnd', []),
      'RecoveryNotCertified',
    );
  });

  // ═══ Crown Suspended (via vacancy with no succession) ═════════════════════

  describe('Suspended', () => {
    beforeAll(async () => {
      // Suspend Crown: certify vacancy, then exhaust (no succession list → empty)
      // We need to clear the succession list first, then exhaust
      // But we already have heirs... so let's just call claimSuccessionExhausted
      // with all heirs marked ineligible

      // Actually, for a simpler setup: revoke all heirs' citizenship
      // Then vacancy + claimSuccessionExhausted succeeds (no eligible members)
      const authWallet = walletForAddress(env.actors.authorityKey);
      const authRegistry = contractAs(env.contracts.registry, env.publicClient, authWallet);
      for (const heir of [heir1, heir2, heir3]) {
        await authRegistry.write('revokeCitizenship', [heir], env.actors.authorityKey);
      }

      const vacancyHash = keccak256(encodePacked(
        ['string', 'address'], ['MONARCH_VACANCY', env.actors.monarchAddr],
      ));
      await certifyFact(env, vacancyHash);
      await env.contracts.crown.write('claimSuccessionExhausted', []);
    });

    it('suspension: state is suspended', async () => {
      expect(await env.contracts.crown.read('suspended')).toBe(true);
      const ROLE_MONARCH = await env.contracts.constitution.read('ROLE_MONARCH') as `0x${string}`;
      expect(await env.contracts.constitution.read('getRole', [ROLE_MONARCH])).toBe(zeroAddress);
    });

    it('suspension: sets timestamp', async () => {
      const ts = await env.contracts.crown.read('successionExhaustedAt') as bigint;
      expect(ts).toBeGreaterThan(0n);
    });

    it('suspended: nominatePM reverts CrownSuspended', async () => {
      // Set a monarch despite suspension (via Crown's setRole)
      const ROLE_MONARCH = await env.contracts.constitution.read('ROLE_MONARCH') as `0x${string}`;
      await asAccount(env.testClient, env.contracts.crown.address, async () => {
        const cc = contractAs(env.contracts.constitution, env.publicClient, walletForAddress(env.contracts.crown.address));
        await cc.write('setRole', [ROLE_MONARCH, heir1], env.contracts.crown.address);
      });

      // Re-register heir1 so they can call
      const authWallet = walletForAddress(env.actors.authorityKey);
      const authRegistry = contractAs(env.contracts.registry, env.publicClient, authWallet);
      const idHash = keccak256(encodePacked(['string', 'address'], ['heir', heir1]));
      await authRegistry.write('registerCitizen', [heir1, idHash, 1], env.actors.authorityKey);

      await expectRevert(
        writeAs(env.contracts.crown, env.publicClient, heir1, env.testClient,
          'nominatePrimeMinister', [makeAddr('pm')]),
        'CrownSuspended',
      );
    });

    it('suspended: returnLaw reverts CrownSuspended', async () => {
      const ROLE_MONARCH = await env.contracts.constitution.read('ROLE_MONARCH') as `0x${string}`;
      await asAccount(env.testClient, env.contracts.crown.address, async () => {
        const cc = contractAs(env.contracts.constitution, env.publicClient, walletForAddress(env.contracts.crown.address));
        await cc.write('setRole', [ROLE_MONARCH, heir1], env.contracts.crown.address);
      });

      await expectRevert(
        writeAs(env.contracts.crown, env.publicClient, heir1, env.testClient,
          'returnLaw', [42]),
        'CrownSuspended',
      );
    });

    it('suspended: declareDissolution reverts CrownSuspended', async () => {
      const ROLE_MONARCH = await env.contracts.constitution.read('ROLE_MONARCH') as `0x${string}`;
      await asAccount(env.testClient, env.contracts.crown.address, async () => {
        const cc = contractAs(env.contracts.constitution, env.publicClient, walletForAddress(env.contracts.crown.address));
        await cc.write('setRole', [ROLE_MONARCH, heir1], env.contracts.crown.address);
      });

      await expectRevert(
        writeAs(env.contracts.crown, env.publicClient, heir1, env.testClient,
          'declareDissolution', []),
        'CrownSuspended',
      );
    });

    it('suspended: executeMinisterialAct reverts CrownSuspended', async () => {
      const ROLE_MONARCH = await env.contracts.constitution.read('ROLE_MONARCH') as `0x${string}`;
      await asAccount(env.testClient, env.contracts.crown.address, async () => {
        const cc = contractAs(env.contracts.constitution, env.publicClient, walletForAddress(env.contracts.crown.address));
        await cc.write('setRole', [ROLE_MONARCH, heir1], env.contracts.crown.address);
      });

      const data = env.contracts.constitution.encode('getParameter', [padHex('0x', { size: 32 })]);
      await expectRevert(
        writeAs(env.contracts.crown, env.publicClient, heir1, env.testClient,
          'executeMinisterialAct', [env.addresses.constitution, data]),
        'CrownSuspended',
      );
    });

    // ── Crown Resumption ──────────────────────────────────────────────────

    it('claimCrownResumption: happy path', async () => {
      const ROLE_MONARCH = await env.contracts.constitution.read('ROLE_MONARCH') as `0x${string}`;
      await asAccount(env.testClient, env.contracts.crown.address, async () => {
        const cc = contractAs(env.contracts.constitution, env.publicClient, walletForAddress(env.contracts.crown.address));
        await cc.write('setRole', [ROLE_MONARCH, heir1], env.contracts.crown.address);
      });

      await env.contracts.crown.write('claimCrownResumption', []);
      expect(await env.contracts.crown.read('suspended')).toBe(false);
    });

    it('claimCrownResumption: emits CrownSuspension(false)', async () => {
      const ROLE_MONARCH = await env.contracts.constitution.read('ROLE_MONARCH') as `0x${string}`;
      await asAccount(env.testClient, env.contracts.crown.address, async () => {
        const cc = contractAs(env.contracts.constitution, env.publicClient, walletForAddress(env.contracts.crown.address));
        await cc.write('setRole', [ROLE_MONARCH, heir1], env.contracts.crown.address);
      });

      const hash = await env.contracts.crown.write('claimCrownResumption', []);
      const events = await getEvents(env.publicClient, hash, env.contracts.crown.artifact.abi, 'CrownSuspension');
      expect(events.length).toBe(1);
      expect((events[0] as any).args.suspended).toBe(false);
    });

    it('claimCrownResumption: resets exhaustion timestamp', async () => {
      expect(await env.contracts.crown.read('successionExhaustedAt')).toBeGreaterThan(0n);

      const ROLE_MONARCH = await env.contracts.constitution.read('ROLE_MONARCH') as `0x${string}`;
      await asAccount(env.testClient, env.contracts.crown.address, async () => {
        const cc = contractAs(env.contracts.constitution, env.publicClient, walletForAddress(env.contracts.crown.address));
        await cc.write('setRole', [ROLE_MONARCH, heir1], env.contracts.crown.address);
      });

      await env.contracts.crown.write('claimCrownResumption', []);
      expect(await env.contracts.crown.read('successionExhaustedAt')).toBe(0n);
      expect(await env.contracts.crown.read('suspended')).toBe(false);
    });

    it('claimCrownResumption: revert if no monarch', async () => {
      await expectRevert(
        env.contracts.crown.write('claimCrownResumption', []),
        'NoMonarch',
      );
    });

    it('claimCrownResumption: permissionless', async () => {
      const ROLE_MONARCH = await env.contracts.constitution.read('ROLE_MONARCH') as `0x${string}`;
      await asAccount(env.testClient, env.contracts.crown.address, async () => {
        const cc = contractAs(env.contracts.constitution, env.publicClient, walletForAddress(env.contracts.crown.address));
        await cc.write('setRole', [ROLE_MONARCH, heir1], env.contracts.crown.address);
      });

      await writeAs(env.contracts.crown, env.publicClient, unauthorized, env.testClient,
        'claimCrownResumption', []);
      expect(await env.contracts.crown.read('suspended')).toBe(false);
    });

    // ── Succession Referendum Deadline ────────────────────────────────────

    it('claimSuccessionReferendumDeadline: happy path after 1 year', async () => {
      await warpForward(env.testClient, DAYS(365) + 1n);
      env.currentTime += DAYS(365) + 1n;

      const hash = await env.contracts.crown.write('claimSuccessionReferendumDeadline', []);
      const events = await getEvents(env.publicClient, hash, env.contracts.crown.artifact.abi, 'SuccessionReferendumDue');
      expect(events.length).toBe(1);
    });

    it('claimSuccessionReferendumDeadline: revert before deadline', async () => {
      await warpForward(env.testClient, DAYS(100));
      env.currentTime += DAYS(100);

      await expectRevert(
        env.contracts.crown.write('claimSuccessionReferendumDeadline', []),
        'DeadlineNotReached',
      );
    });

    it('claimSuccessionReferendumDeadline: boundary — exactly at deadline', async () => {
      await warpForward(env.testClient, DAYS(365));
      env.currentTime += DAYS(365);

      await env.contracts.crown.write('claimSuccessionReferendumDeadline', []);
      expect(await env.contracts.crown.read('successionReferendumClaimed')).toBe(true);
    });

    it('claimSuccessionReferendumDeadline: boundary — one second before', async () => {
      await warpForward(env.testClient, DAYS(365) - 1n);
      env.currentTime += DAYS(365) - 1n;

      await expectRevert(
        env.contracts.crown.write('claimSuccessionReferendumDeadline', []),
        'DeadlineNotReached',
      );
    });

    it('claimSuccessionReferendumDeadline: revert if already claimed', async () => {
      await warpForward(env.testClient, DAYS(365) + 1n);
      env.currentTime += DAYS(365) + 1n;
      await env.contracts.crown.write('claimSuccessionReferendumDeadline', []);

      await expectRevert(
        env.contracts.crown.write('claimSuccessionReferendumDeadline', []),
        'AlreadyClaimed',
      );
    });

    it('claimSuccessionReferendumDeadline: permissionless', async () => {
      await warpForward(env.testClient, DAYS(365) + 1n);
      env.currentTime += DAYS(365) + 1n;

      await writeAs(env.contracts.crown, env.publicClient, unauthorized, env.testClient,
        'claimSuccessionReferendumDeadline', []);
    });

    it('claimCrownResumption: resets referendumClaimed', async () => {
      // Warp past deadline, claim referendum
      await warpForward(env.testClient, DAYS(365) + 1n);
      env.currentTime += DAYS(365) + 1n;
      await env.contracts.crown.write('claimSuccessionReferendumDeadline', []);
      expect(await env.contracts.crown.read('successionReferendumClaimed')).toBe(true);

      // Resume Crown
      const ROLE_MONARCH = await env.contracts.constitution.read('ROLE_MONARCH') as `0x${string}`;
      await asAccount(env.testClient, env.contracts.crown.address, async () => {
        const cc = contractAs(env.contracts.constitution, env.publicClient, walletForAddress(env.contracts.crown.address));
        await cc.write('setRole', [ROLE_MONARCH, heir1], env.contracts.crown.address);
      });
      await env.contracts.crown.write('claimCrownResumption', []);

      expect(await env.contracts.crown.read('successionReferendumClaimed')).toBe(false);
    });
  });
});
