/**
 * Constitution.sol RPC tests — TypeScript port of Constitution.t.sol.
 *
 * 65 tests across 3 scenarios:
 * A: Uninitialized (17 tests)
 * B: Initialized (43 tests)
 * C: Finalized (5 tests)
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { type Address, type PublicClient, type TestClient, keccak256, toHex } from 'viem';
import { createAnvilClients, snapshot, revert } from '../../src/client/AnvilHelpers.js';
import { ConstitutionArtifact } from '../../src/abi/index.js';
import { Contract } from '../../src/client/GovClient.js';
import {
  makeAddr,
  deployerWallet,
  deployStandalone,
  callAs,
  expectRevert,
  getEvents,
  setCode,
  walletWithKey,
} from '../setup/testUtils.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Shared State
// ═══════════════════════════════════════════════════════════════════════════════

let publicClient: PublicClient;
let testClient: TestClient;

// Deployer = Anvil account[0]
const DEPLOYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const UNAUTHORIZED_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;

// Mock contract addresses
const mockAddrs = {
  registry: makeAddr('registryContract'),
  crown: makeAddr('crownContract'),
  parliament: makeAddr('parliamentContract'),
  executive: makeAddr('executiveContract'),
  court: makeAddr('courtContract'),
  election: makeAddr('electionContract'),
  referendum: makeAddr('referendumContract'),
  budget: makeAddr('budgetContract'),
  pc: makeAddr('pcContract'),
  verifier: makeAddr('verifierContract'),
};
const unauthorized = makeAddr('unauthorized');
const monarch = makeAddr('monarch');
const pm = makeAddr('pm');

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

async function readKey(c: Contract, keyName: string): Promise<`0x${string}`> {
  return (await c.read(keyName)) as `0x${string}`;
}

async function getContractNames(c: Contract): Promise<`0x${string}`[]> {
  return Promise.all([
    readKey(c, 'CONTRACT_CITIZEN_REGISTRY'),
    readKey(c, 'CONTRACT_CROWN'),
    readKey(c, 'CONTRACT_PARLIAMENT'),
    readKey(c, 'CONTRACT_EXECUTIVE'),
    readKey(c, 'CONTRACT_SUPREME_COURT'),
    readKey(c, 'CONTRACT_ELECTION'),
    readKey(c, 'CONTRACT_REFERENDUM'),
    readKey(c, 'CONTRACT_BUDGET'),
    readKey(c, 'CONTRACT_PROVINCIAL_COUNCIL'),
    readKey(c, 'CONTRACT_BALLOT_VERIFIER'),
  ]);
}

function getContractAddrs(): Address[] {
  return [
    mockAddrs.registry, mockAddrs.crown, mockAddrs.parliament, mockAddrs.executive,
    mockAddrs.court, mockAddrs.election, mockAddrs.referendum, mockAddrs.budget,
    mockAddrs.pc, mockAddrs.verifier,
  ];
}

async function etchAll(tc: TestClient): Promise<void> {
  for (const addr of getContractAddrs()) {
    await setCode(tc, addr);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO A: Uninitialized Constitution
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario A: Uninitialized Constitution', () => {
  let constitution: Contract;
  let deployer: Address;
  let snapId: `0x${string}`;

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

    const wallet = deployerWallet();
    deployer = wallet.account!.address;
    constitution = await deployStandalone(publicClient, wallet, ConstitutionArtifact);
  }, 60_000);

  beforeEach(async () => {
    snapId = await snapshot(testClient);
  });

  afterEach(async () => {
    await revert(testClient, snapId);
  });

  // ─── Constructor ─────────────────────────────────────────────────────

  it('constructor sets deployer', async () => {
    const d = await constitution.read('deployer');
    expect(d).toBe(deployer);
  });

  it('constructor: not initialized', async () => {
    const init = await constitution.read('initialized');
    expect(init).toBe(false);
  });

  it('default parameters are correct', async () => {
    const DAYS = 86400n;
    const checks: [string, bigint][] = [
      ['PARAM_MAJLIS_TERM', 4n * 365n * DAYS],
      ['PARAM_SENATE_TERM', 6n * 365n * DAYS],
      ['PARAM_JUSTICE_TERM', 9n * 365n * DAYS],
      ['PARAM_JUSTICE_COUNT', 12n],
      ['PARAM_COURT_QUORUM', 7n],
      ['PARAM_SENATE_CROWN_PCT', 10n],
      ['PARAM_CROWN_LAW_DEADLINE', 14n * DAYS],
      ['PARAM_SENATE_REVIEW_PERIOD', 30n * DAYS],
      ['PARAM_CONFIDENCE_HONEYMOON', 90n * DAYS],
      ['PARAM_NOMINATION_DEADLINE', 14n * DAYS],
      ['PARAM_MAJLIS_LIST_DEADLINE', 14n * DAYS],
      ['PARAM_ELECTION_REG_PERIOD', 14n * DAYS],
      ['PARAM_ELECTION_VOTE_PERIOD', 7n * DAYS],
      ['PARAM_DISSOLUTION_ELECTION_DEADLINE', 60n * DAYS],
      ['PARAM_AMENDMENT_THRESHOLD', 67n],
      ['PARAM_EMERGENCY_AMEND_THRESHOLD', 75n],
      ['PARAM_EMERGENCY_AMEND_DURATION', 365n * DAYS],
      ['PARAM_CROWN_APPOINT_DEADLINE', 7n * DAYS],
      ['PARAM_CROWN_JUSTICE_APPOINT_DEADLINE', 14n * DAYS],
      ['PARAM_CONFIDENCE_VOTE_PERIOD', 14n * DAYS],
      ['PARAM_MAJLIS_QUORUM', 50n],
      ['PARAM_SENATE_QUORUM', 50n],
      ['PARAM_MIN_VOTING_PERIOD', 3n * DAYS],
      ['PARAM_PETITION_TIMEOUT', 30n * DAYS],
      ['PARAM_FACT_CERT_PERIOD', 14n * DAYS],
      ['PARAM_BY_ELECTION_DEADLINE', 90n * DAYS],
      ['PARAM_VACANCY_VOTE_PERIOD', 14n * DAYS],
      ['PARAM_COURT_LIVENESS_PERIOD', 7n * DAYS],
      ['PARAM_COURT_INACTIVITY_PERIOD', 14n * DAYS],
      ['PARAM_COUNCIL_TERM', 4n * 365n * DAYS],
      ['PARAM_SENATE_SELECTION_REG_PERIOD', 14n * DAYS],
      ['PARAM_SENATE_SELECTION_VOTE_PERIOD', 7n * DAYS],
      ['PARAM_SUCCESSION_REFERENDUM_DEADLINE', 365n * DAYS],
      ['PARAM_DEPUTY_DESIGNATION_DEADLINE', 14n * DAYS],
      ['PARAM_TOTAL_MAJLIS_SEATS', 290n],
      ['PARAM_CROWN_SEAT_DEADLINE', 14n * DAYS],
    ];

    for (const [paramName, expected] of checks) {
      const key = await readKey(constitution, paramName);
      const value = await constitution.read('getParameter', [key]);
      expect(value, `${paramName}`).toBe(expected);
    }
  });

  it('protected parameters', async () => {
    const protectedParams = [
      'PARAM_JUSTICE_TERM', 'PARAM_COURT_QUORUM', 'PARAM_JUSTICE_COUNT',
      'PARAM_AMENDMENT_THRESHOLD', 'PARAM_EMERGENCY_AMEND_THRESHOLD',
      'PARAM_ELECTION_REG_PERIOD', 'PARAM_ELECTION_VOTE_PERIOD',
      'PARAM_DISSOLUTION_ELECTION_DEADLINE', 'PARAM_MAJLIS_TERM',
      'PARAM_SENATE_TERM', 'PARAM_CONFIDENCE_VOTE_PERIOD',
      'PARAM_EMERGENCY_AMEND_DURATION', 'PARAM_COUNCIL_TERM',
      'PARAM_TOTAL_MAJLIS_SEATS',
    ];
    for (const p of protectedParams) {
      const key = await readKey(constitution, p);
      const isProtected = await constitution.read('isProtectedParameter', [key]);
      expect(isProtected, `${p} should be protected`).toBe(true);
    }
  });

  it('unprotected parameters', async () => {
    const unprotected = [
      'PARAM_CONFIDENCE_HONEYMOON', 'PARAM_CROWN_LAW_DEADLINE',
      'PARAM_MIN_VOTING_PERIOD', 'PARAM_FACT_CERT_PERIOD',
    ];
    for (const p of unprotected) {
      const key = await readKey(constitution, p);
      const isProtected = await constitution.read('isProtectedParameter', [key]);
      expect(isProtected, `${p} should NOT be protected`).toBe(false);
    }
  });

  it('getParameter: unknown key returns 0', async () => {
    const val = await constitution.read('getParameter', [keccak256(toHex('NONEXISTENT'))]);
    expect(val).toBe(0n);
  });

  it('getContract: uninitialized returns zero address', async () => {
    const key = await readKey(constitution, 'CONTRACT_CROWN');
    const addr = await constitution.read('getContract', [key]);
    expect(addr).toBe('0x0000000000000000000000000000000000000000');
  });

  it('getRole: vacant returns zero address', async () => {
    const key = await readKey(constitution, 'ROLE_MONARCH');
    const addr = await constitution.read('getRole', [key]);
    expect(addr).toBe('0x0000000000000000000000000000000000000000');
  });

  it('hasRole: false for vacant role', async () => {
    const key = await readKey(constitution, 'ROLE_MONARCH');
    const has = await constitution.read('hasRole', [key, unauthorized]);
    expect(has).toBe(false);
  });

  // ─── Initialize: happy paths ─────────────────────────────────────────

  it('initialize: sets contracts and marks initialized', async () => {
    await etchAll(testClient);
    const names = await getContractNames(constitution);
    const addrs = getContractAddrs();
    await constitution.write('initialize', [names, addrs]);

    expect(await constitution.read('initialized')).toBe(true);
    const crownKey = await readKey(constitution, 'CONTRACT_CROWN');
    expect(await constitution.read('getContract', [crownKey])).toBe(mockAddrs.crown);
  });

  it('initialize: emits ContractRegistered', async () => {
    await etchAll(testClient);
    const names = await getContractNames(constitution);
    const addrs = getContractAddrs();
    const hash = await constitution.write('initialize', [names, addrs]);
    const events = await getEvents(publicClient, hash, ConstitutionArtifact.abi, 'ContractRegistered');
    expect(events.length).toBe(10);
  });

  it('initialize: emits Initialized', async () => {
    await etchAll(testClient);
    const names = await getContractNames(constitution);
    const addrs = getContractAddrs();
    const hash = await constitution.write('initialize', [names, addrs]);
    const events = await getEvents(publicClient, hash, ConstitutionArtifact.abi, 'Initialized');
    expect(events.length).toBe(1);
  });

  it('initialize: keeps deployer', async () => {
    await etchAll(testClient);
    const names = await getContractNames(constitution);
    const addrs = getContractAddrs();
    await constitution.write('initialize', [names, addrs]);
    expect(await constitution.read('deployer')).toBe(deployer);
  });

  // ─── Initialize: revert paths ────────────────────────────────────────

  it('revert: initialize by non-deployer', async () => {
    const names = await getContractNames(constitution);
    const addrs = getContractAddrs();
    await expectRevert(
      callAs(testClient, publicClient, unauthorized, constitution, 'initialize', [names, addrs]),
      'NotDeployer',
    );
  });

  it('revert: initialize already initialized', async () => {
    await etchAll(testClient);
    const names = await getContractNames(constitution);
    const addrs = getContractAddrs();
    await constitution.write('initialize', [names, addrs]);

    await expectRevert(
      constitution.write('initialize', [names, addrs]),
      'AlreadyInitialized',
    );
  });

  it('revert: initialize length mismatch', async () => {
    const crownKey = await readKey(constitution, 'CONTRACT_CROWN');
    const parlKey = await readKey(constitution, 'CONTRACT_PARLIAMENT');
    await expectRevert(
      constitution.write('initialize', [[crownKey, parlKey], [mockAddrs.crown]]),
      'InvalidParameter',
    );
  });

  it('revert: initialize with zero address', async () => {
    await etchAll(testClient);
    const names = await getContractNames(constitution);
    const addrs = getContractAddrs();
    addrs[0] = '0x0000000000000000000000000000000000000000';
    await expectRevert(
      constitution.write('initialize', [names, addrs]),
      'ZeroAddress',
    );
  });

  it('revert: initialize with EOA addresses (no code)', async () => {
    // Don't etch — all addresses are EOAs
    const names = await getContractNames(constitution);
    const addrs = getContractAddrs();
    await expectRevert(
      constitution.write('initialize', [names, addrs]),
      'InvalidAddress',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO B: Initialized Constitution
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario B: Initialized Constitution', () => {
  let constitution: Contract;
  let deployer: Address;
  let snapId: `0x${string}`;

  // Cached keys
  let ROLE_MONARCH: `0x${string}`;
  let ROLE_PRIME_MINISTER: `0x${string}`;
  let ROLE_AUDIT_HEAD: `0x${string}`;
  let PARAM_MAJLIS_TERM: `0x${string}`;
  let CONTRACT_CROWN: `0x${string}`;

  beforeAll(async () => {
    const clients = createAnvilClients();
    publicClient = clients.public;
    testClient = clients.test;

    await fetch('http://127.0.0.1:8545', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'anvil_reset', params: [], id: 1 }),
    });

    const wallet = deployerWallet();
    deployer = wallet.account!.address;
    constitution = await deployStandalone(publicClient, wallet, ConstitutionArtifact);

    // Cache keys
    ROLE_MONARCH = await readKey(constitution, 'ROLE_MONARCH');
    ROLE_PRIME_MINISTER = await readKey(constitution, 'ROLE_PRIME_MINISTER');
    ROLE_AUDIT_HEAD = await readKey(constitution, 'ROLE_AUDIT_HEAD');
    PARAM_MAJLIS_TERM = await readKey(constitution, 'PARAM_MAJLIS_TERM');
    CONTRACT_CROWN = await readKey(constitution, 'CONTRACT_CROWN');

    // Etch code and initialize
    await etchAll(testClient);
    const names = await getContractNames(constitution);
    const addrs = getContractAddrs();
    await constitution.write('initialize', [names, addrs]);
  }, 60_000);

  beforeEach(async () => {
    snapId = await snapshot(testClient);
  });

  afterEach(async () => {
    await revert(testClient, snapId);
  });

  // ─── setRole: happy paths ────────────────────────────────────────────

  it('setRole: by Crown', async () => {
    await callAs(testClient, publicClient, mockAddrs.crown, constitution, 'setRole', [ROLE_MONARCH, monarch]);
    expect(await constitution.read('getRole', [ROLE_MONARCH])).toBe(monarch);
    expect(await constitution.read('hasRole', [ROLE_MONARCH, monarch])).toBe(true);
  });

  it('setRole: emits RoleChanged', async () => {
    const hash = await callAs(testClient, publicClient, mockAddrs.crown, constitution, 'setRole', [ROLE_MONARCH, monarch]);
    const events = await getEvents(publicClient, hash, ConstitutionArtifact.abi, 'RoleChanged');
    expect(events.length).toBe(1);
    expect(events[0].args.role).toBe(ROLE_MONARCH);
  });

  it('setRole: change holder', async () => {
    const newMonarch = makeAddr('newMonarch');
    await callAs(testClient, publicClient, mockAddrs.crown, constitution, 'setRole', [ROLE_MONARCH, monarch]);
    await callAs(testClient, publicClient, mockAddrs.crown, constitution, 'setRole', [ROLE_MONARCH, newMonarch]);

    expect(await constitution.read('getRole', [ROLE_MONARCH])).toBe(newMonarch);
    expect(await constitution.read('hasRole', [ROLE_MONARCH, monarch])).toBe(false);
    expect(await constitution.read('hasRole', [ROLE_MONARCH, newMonarch])).toBe(true);
  });

  it('setRole: vacate', async () => {
    const ZERO = '0x0000000000000000000000000000000000000000';
    await callAs(testClient, publicClient, mockAddrs.executive, constitution, 'setRole', [ROLE_PRIME_MINISTER, pm]);
    await callAs(testClient, publicClient, mockAddrs.executive, constitution, 'setRole', [ROLE_PRIME_MINISTER, ZERO]);
    expect(await constitution.read('getRole', [ROLE_PRIME_MINISTER])).toBe(ZERO);
  });

  it('setRole: by Executive', async () => {
    await callAs(testClient, publicClient, mockAddrs.executive, constitution, 'setRole', [ROLE_PRIME_MINISTER, pm]);
    expect(await constitution.read('getRole', [ROLE_PRIME_MINISTER])).toBe(pm);
  });

  it('setRole: by Referendum', async () => {
    await callAs(testClient, publicClient, mockAddrs.referendum, constitution, 'setRole', [ROLE_MONARCH, monarch]);
    expect(await constitution.read('getRole', [ROLE_MONARCH])).toBe(monarch);
  });

  // ─── setRole: AUDIT_HEAD special paths ───────────────────────────────

  it('setRole: audit head by Budget', async () => {
    const auditHead = makeAddr('auditHead');
    await callAs(testClient, publicClient, mockAddrs.budget, constitution, 'setRole', [ROLE_AUDIT_HEAD, auditHead]);
    expect(await constitution.read('getRole', [ROLE_AUDIT_HEAD])).toBe(auditHead);
  });

  it('setRole: audit head by Referendum', async () => {
    const auditHead = makeAddr('auditHead');
    await callAs(testClient, publicClient, mockAddrs.referendum, constitution, 'setRole', [ROLE_AUDIT_HEAD, auditHead]);
    expect(await constitution.read('getRole', [ROLE_AUDIT_HEAD])).toBe(auditHead);
  });

  it('revert: setRole audit head by Crown', async () => {
    await expectRevert(
      callAs(testClient, publicClient, mockAddrs.crown, constitution, 'setRole', [ROLE_AUDIT_HEAD, makeAddr('auditHead')]),
      'NotAuthorized',
    );
  });

  it('revert: setRole audit head by Executive', async () => {
    await expectRevert(
      callAs(testClient, publicClient, mockAddrs.executive, constitution, 'setRole', [ROLE_AUDIT_HEAD, makeAddr('auditHead')]),
      'NotAuthorized',
    );
  });

  it('revert: setRole audit head by unauthorized', async () => {
    await expectRevert(
      callAs(testClient, publicClient, unauthorized, constitution, 'setRole', [ROLE_AUDIT_HEAD, makeAddr('auditHead')]),
      'NotAuthorized',
    );
  });

  it('revert: setRole audit head by Parliament', async () => {
    await expectRevert(
      callAs(testClient, publicClient, mockAddrs.parliament, constitution, 'setRole', [ROLE_AUDIT_HEAD, makeAddr('auditHead')]),
      'NotAuthorized',
    );
  });

  // ─── setRole: revert paths ───────────────────────────────────────────

  it('revert: setRole by unauthorized', async () => {
    await expectRevert(
      callAs(testClient, publicClient, unauthorized, constitution, 'setRole', [ROLE_MONARCH, monarch]),
      'NotAuthorized',
    );
  });

  it('revert: setRole by Parliament', async () => {
    await expectRevert(
      callAs(testClient, publicClient, mockAddrs.parliament, constitution, 'setRole', [ROLE_PRIME_MINISTER, pm]),
      'NotAuthorized',
    );
  });

  it('revert: setRole by Election', async () => {
    await expectRevert(
      callAs(testClient, publicClient, mockAddrs.election, constitution, 'setRole', [ROLE_MONARCH, monarch]),
      'NotAuthorized',
    );
  });

  it('revert: setRole by Court', async () => {
    await expectRevert(
      callAs(testClient, publicClient, mockAddrs.court, constitution, 'setRole', [ROLE_MONARCH, monarch]),
      'NotAuthorized',
    );
  });

  // ─── amendParameter: happy paths ─────────────────────────────────────

  it('amendParameter: by Referendum', async () => {
    const newValue = 5n * 365n * 86400n;
    await callAs(testClient, publicClient, mockAddrs.referendum, constitution, 'amendParameter', [PARAM_MAJLIS_TERM, newValue]);
    expect(await constitution.read('getParameter', [PARAM_MAJLIS_TERM])).toBe(newValue);
  });

  it('amendParameter: emits ParameterAmended', async () => {
    const newValue = 5n * 365n * 86400n;
    const hash = await callAs(testClient, publicClient, mockAddrs.referendum, constitution, 'amendParameter', [PARAM_MAJLIS_TERM, newValue]);
    const events = await getEvents(publicClient, hash, ConstitutionArtifact.abi, 'ParameterAmended');
    expect(events.length).toBe(1);
    expect(events[0].args.key).toBe(PARAM_MAJLIS_TERM);
  });

  it('boundary: amendParameter to zero', async () => {
    await callAs(testClient, publicClient, mockAddrs.referendum, constitution, 'amendParameter', [PARAM_MAJLIS_TERM, 0n]);
    expect(await constitution.read('getParameter', [PARAM_MAJLIS_TERM])).toBe(0n);
  });

  it('boundary: amendParameter to max uint256', async () => {
    const maxUint = (1n << 256n) - 1n;
    await callAs(testClient, publicClient, mockAddrs.referendum, constitution, 'amendParameter', [PARAM_MAJLIS_TERM, maxUint]);
    expect(await constitution.read('getParameter', [PARAM_MAJLIS_TERM])).toBe(maxUint);
  });

  // ─── amendParameter: revert paths ────────────────────────────────────

  it('revert: amendParameter by Crown', async () => {
    await expectRevert(
      callAs(testClient, publicClient, mockAddrs.crown, constitution, 'amendParameter', [PARAM_MAJLIS_TERM, 5n * 365n * 86400n]),
      'NotAuthorized',
    );
  });

  it('revert: amendParameter by Executive', async () => {
    await expectRevert(
      callAs(testClient, publicClient, mockAddrs.executive, constitution, 'amendParameter', [PARAM_MAJLIS_TERM, 5n * 365n * 86400n]),
      'NotAuthorized',
    );
  });

  it('revert: amendParameter by unauthorized', async () => {
    await expectRevert(
      callAs(testClient, publicClient, unauthorized, constitution, 'amendParameter', [PARAM_MAJLIS_TERM, 5n * 365n * 86400n]),
      'NotAuthorized',
    );
  });

  it('revert: amendParameter by Parliament', async () => {
    await expectRevert(
      callAs(testClient, publicClient, mockAddrs.parliament, constitution, 'amendParameter', [PARAM_MAJLIS_TERM, 5n * 365n * 86400n]),
      'NotAuthorized',
    );
  });

  it('revert: amendParameter by Budget', async () => {
    await expectRevert(
      callAs(testClient, publicClient, mockAddrs.budget, constitution, 'amendParameter', [PARAM_MAJLIS_TERM, 5n * 365n * 86400n]),
      'NotAuthorized',
    );
  });

  // ─── amendContract: happy paths ──────────────────────────────────────

  it('amendContract: by Referendum', async () => {
    const newCrown = makeAddr('newCrown');
    await callAs(testClient, publicClient, mockAddrs.referendum, constitution, 'amendContract', [CONTRACT_CROWN, newCrown]);
    expect(await constitution.read('getContract', [CONTRACT_CROWN])).toBe(newCrown);
  });

  it('amendContract: emits ContractAmended', async () => {
    const newCrown = makeAddr('newCrown');
    const hash = await callAs(testClient, publicClient, mockAddrs.referendum, constitution, 'amendContract', [CONTRACT_CROWN, newCrown]);
    const events = await getEvents(publicClient, hash, ConstitutionArtifact.abi, 'ContractAmended');
    expect(events.length).toBe(1);
  });

  it('amendContract: to zero address', async () => {
    const ZERO = '0x0000000000000000000000000000000000000000';
    await callAs(testClient, publicClient, mockAddrs.referendum, constitution, 'amendContract', [CONTRACT_CROWN, ZERO]);
    expect(await constitution.read('getContract', [CONTRACT_CROWN])).toBe(ZERO);
  });

  // ─── amendContract: revert paths ─────────────────────────────────────

  it('revert: amendContract by Crown', async () => {
    await expectRevert(
      callAs(testClient, publicClient, mockAddrs.crown, constitution, 'amendContract', [CONTRACT_CROWN, makeAddr('newCrown')]),
      'NotAuthorized',
    );
  });

  it('revert: amendContract by Executive', async () => {
    await expectRevert(
      callAs(testClient, publicClient, mockAddrs.executive, constitution, 'amendContract', [CONTRACT_CROWN, makeAddr('newCrown')]),
      'NotAuthorized',
    );
  });

  it('revert: amendContract by unauthorized', async () => {
    await expectRevert(
      callAs(testClient, publicClient, unauthorized, constitution, 'amendContract', [CONTRACT_CROWN, makeAddr('newCrown')]),
      'NotAuthorized',
    );
  });

  it('revert: amendContract by Parliament', async () => {
    await expectRevert(
      callAs(testClient, publicClient, mockAddrs.parliament, constitution, 'amendContract', [CONTRACT_CROWN, makeAddr('newCrown')]),
      'NotAuthorized',
    );
  });

  it('revert: amendContract by Budget', async () => {
    await expectRevert(
      callAs(testClient, publicClient, mockAddrs.budget, constitution, 'amendContract', [CONTRACT_CROWN, makeAddr('newCrown')]),
      'NotAuthorized',
    );
  });

  // ─── finalizeSetup: happy paths ──────────────────────────────────────

  it('finalizeSetup: by deployer', async () => {
    await constitution.write('finalizeSetup', []);
    expect(await constitution.read('deployer')).toBe('0x0000000000000000000000000000000000000000');
  });

  it('finalizeSetup: by Crown', async () => {
    await callAs(testClient, publicClient, mockAddrs.crown, constitution, 'finalizeSetup', []);
    expect(await constitution.read('deployer')).toBe('0x0000000000000000000000000000000000000000');
  });

  it('finalizeSetup: emits SetupFinalized', async () => {
    const hash = await constitution.write('finalizeSetup', []);
    const events = await getEvents(publicClient, hash, ConstitutionArtifact.abi, 'SetupFinalized');
    expect(events.length).toBe(1);
  });

  // ─── finalizeSetup: revert paths ─────────────────────────────────────

  it('revert: finalizeSetup by unauthorized', async () => {
    await expectRevert(
      callAs(testClient, publicClient, unauthorized, constitution, 'finalizeSetup', []),
      'NotAuthorized',
    );
  });

  it('revert: finalizeSetup already finalized', async () => {
    await constitution.write('finalizeSetup', []);
    await expectRevert(
      constitution.write('finalizeSetup', []),
      'AlreadyFinalized',
    );
  });

  it('revert: finalizeSetup by Executive', async () => {
    await expectRevert(
      callAs(testClient, publicClient, mockAddrs.executive, constitution, 'finalizeSetup', []),
      'NotAuthorized',
    );
  });

  it('revert: finalizeSetup by Parliament', async () => {
    await expectRevert(
      callAs(testClient, publicClient, mockAddrs.parliament, constitution, 'finalizeSetup', []),
      'NotAuthorized',
    );
  });

  it('revert: finalizeSetup by Referendum', async () => {
    await expectRevert(
      callAs(testClient, publicClient, mockAddrs.referendum, constitution, 'finalizeSetup', []),
      'NotAuthorized',
    );
  });

  it('revert: finalizeSetup by Budget', async () => {
    await expectRevert(
      callAs(testClient, publicClient, mockAddrs.budget, constitution, 'finalizeSetup', []),
      'NotAuthorized',
    );
  });

  // ─── Contract registry views ─────────────────────────────────────────

  it('getContract: returns all initialized addresses', async () => {
    expect(await constitution.read('getContract', [CONTRACT_CROWN])).toBe(mockAddrs.crown);
    const execKey = await readKey(constitution, 'CONTRACT_EXECUTIVE');
    expect(await constitution.read('getContract', [execKey])).toBe(mockAddrs.executive);
    const budgetKey = await readKey(constitution, 'CONTRACT_BUDGET');
    expect(await constitution.read('getContract', [budgetKey])).toBe(mockAddrs.budget);
    const pcKey = await readKey(constitution, 'CONTRACT_PROVINCIAL_COUNCIL');
    expect(await constitution.read('getContract', [pcKey])).toBe(mockAddrs.pc);
    const verifKey = await readKey(constitution, 'CONTRACT_BALLOT_VERIFIER');
    expect(await constitution.read('getContract', [verifKey])).toBe(mockAddrs.verifier);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO C: Finalized Constitution
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario C: Finalized Constitution', () => {
  let constitution: Contract;
  let snapId: `0x${string}`;

  let ROLE_MONARCH: `0x${string}`;
  let PARAM_MAJLIS_TERM: `0x${string}`;
  let CONTRACT_CROWN: `0x${string}`;

  beforeAll(async () => {
    const clients = createAnvilClients();
    publicClient = clients.public;
    testClient = clients.test;

    await fetch('http://127.0.0.1:8545', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'anvil_reset', params: [], id: 1 }),
    });

    const wallet = deployerWallet();
    constitution = await deployStandalone(publicClient, wallet, ConstitutionArtifact);

    ROLE_MONARCH = await readKey(constitution, 'ROLE_MONARCH');
    PARAM_MAJLIS_TERM = await readKey(constitution, 'PARAM_MAJLIS_TERM');
    CONTRACT_CROWN = await readKey(constitution, 'CONTRACT_CROWN');

    await etchAll(testClient);
    const names = await getContractNames(constitution);
    const addrs = getContractAddrs();
    await constitution.write('initialize', [names, addrs]);
    await constitution.write('finalizeSetup', []);
  }, 60_000);

  beforeEach(async () => {
    snapId = await snapshot(testClient);
  });

  afterEach(async () => {
    await revert(testClient, snapId);
  });

  it('deployer is wiped', async () => {
    expect(await constitution.read('deployer')).toBe('0x0000000000000000000000000000000000000000');
  });

  it('revert: finalizeSetup cannot call again', async () => {
    await expectRevert(
      callAs(testClient, publicClient, makeAddr('deployer'), constitution, 'finalizeSetup', []),
      'AlreadyFinalized',
    );
  });

  it('setRole still works after finalization', async () => {
    await callAs(testClient, publicClient, mockAddrs.crown, constitution, 'setRole', [ROLE_MONARCH, monarch]);
    expect(await constitution.read('getRole', [ROLE_MONARCH])).toBe(monarch);
  });

  it('amendParameter still works after finalization', async () => {
    const newVal = 5n * 365n * 86400n;
    await callAs(testClient, publicClient, mockAddrs.referendum, constitution, 'amendParameter', [PARAM_MAJLIS_TERM, newVal]);
    expect(await constitution.read('getParameter', [PARAM_MAJLIS_TERM])).toBe(newVal);
  });

  it('amendContract still works after finalization', async () => {
    const newCrown = makeAddr('newCrown');
    await callAs(testClient, publicClient, mockAddrs.referendum, constitution, 'amendContract', [CONTRACT_CROWN, newCrown]);
    expect(await constitution.read('getContract', [CONTRACT_CROWN])).toBe(newCrown);
  });
});
