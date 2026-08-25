/**
 * CitizenRegistry.sol RPC tests — TypeScript port of CitizenRegistry.t.sol.
 *
 * 53 tests across 2 scenarios:
 * A: Empty Registry (37 tests)
 * B: With Citizens (16 tests)
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import {
  type Address,
  type PublicClient,
  type TestClient,
  keccak256,
  encodePacked,
  getAddress,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createAnvilClients, snapshot, revert } from '../../src/client/AnvilHelpers.js';
import { CitizenRegistryArtifact } from '../../src/abi/index.js';
import { Contract } from '../../src/client/GovClient.js';
import {
  makeAddr,
  deployStandalone,
  callAs,
  expectRevert,
  getEvents,
  walletWithKey,
} from '../setup/testUtils.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Shared State
// ═══════════════════════════════════════════════════════════════════════════════

let publicClient: PublicClient;
let testClient: TestClient;

// Authority private key (matches Foundry's 0xA11CE)
const AUTHORITY_KEY = '0x00000000000000000000000000000000000000000000000000000000000a11ce' as `0x${string}`;
const authorityAccount = privateKeyToAccount(AUTHORITY_KEY);
const authority = authorityAccount.address;

// Other actors
const citizen1 = makeAddr('citizen1');
const citizen2 = makeAddr('citizen2');
const citizen3 = makeAddr('citizen3');
const nonAuthority = makeAddr('nonAuthority');
const newAuthority = makeAddr('newAuthority');

// Identity hashes (match Solidity keccak256("passport:citizen1"))
const IDENTITY_HASH_1 = keccak256(encodePacked(['string'], ['passport:citizen1']));
const IDENTITY_HASH_2 = keccak256(encodePacked(['string'], ['passport:citizen2']));
const IDENTITY_HASH_3 = keccak256(encodePacked(['string'], ['passport:citizen3']));

const CHAIN_ID = 31337n; // Foundry chain ID

// ═══════════════════════════════════════════════════════════════════════════════
// Signature Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/** Sign a registration message (mirrors _signRegistration in Solidity) */
async function signRegistration(
  registryAddr: Address,
  citizen: Address,
  idHash: `0x${string}`,
  province: number,
  nonce: bigint,
): Promise<{ v: number; r: `0x${string}`; s: `0x${string}` }> {
  const digest = keccak256(
    encodePacked(
      ['address', 'bytes32', 'uint8', 'uint256', 'uint256', 'address'],
      [citizen, idHash, province, nonce, CHAIN_ID, registryAddr],
    ),
  );

  // signMessage with raw bytes adds the Ethereum prefix and signs (same as vm.sign on ethSignedHash)
  const signature = await authorityAccount.signMessage({ message: { raw: digest as `0x${string}` } });

  // Parse signature into v, r, s
  const r = ('0x' + signature.slice(2, 66)) as `0x${string}`;
  const s = ('0x' + signature.slice(66, 130)) as `0x${string}`;
  const v = parseInt(signature.slice(130, 132), 16);
  return { v, r, s };
}

/** Sign with a specific nonce (for replay tests) */
async function signRegistrationWithNonce(
  registryAddr: Address,
  citizen: Address,
  idHash: `0x${string}`,
  province: number,
  nonce: bigint,
): Promise<{ v: number; r: `0x${string}`; s: `0x${string}` }> {
  return signRegistration(registryAddr, citizen, idHash, province, nonce);
}

/** Sign with a WRONG private key (for nonAuthoritySigner test) */
async function signWithFakeKey(
  registryAddr: Address,
  citizen: Address,
  idHash: `0x${string}`,
  province: number,
  nonce: bigint,
): Promise<{ v: number; r: `0x${string}`; s: `0x${string}` }> {
  const fakeKey = '0x000000000000000000000000000000000000000000000000000000000000beef' as `0x${string}`;
  const fakeAccount = privateKeyToAccount(fakeKey);

  const digest = keccak256(
    encodePacked(
      ['address', 'bytes32', 'uint8', 'uint256', 'uint256', 'address'],
      [citizen, idHash, province, nonce, CHAIN_ID, registryAddr],
    ),
  );

  const signature = await fakeAccount.signMessage({ message: { raw: digest as `0x${string}` } });
  const r = ('0x' + signature.slice(2, 66)) as `0x${string}`;
  const s = ('0x' + signature.slice(66, 130)) as `0x${string}`;
  const v = parseInt(signature.slice(130, 132), 16);
  return { v, r, s };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Deploy helper
// ═══════════════════════════════════════════════════════════════════════════════

// Deployer = Anvil account[0] (has 10000 ETH)
const DEPLOYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;

async function deployRegistry(tc: TestClient): Promise<Contract> {
  // Deploy with Anvil account[0] (funded), pass authority as constructor arg
  const deployerWal = walletWithKey(DEPLOYER_KEY);
  const reg = await deployStandalone(publicClient, deployerWal, CitizenRegistryArtifact, [authority]);
  // Fund the authority account so it can send transactions
  await tc.setBalance({ address: authority, value: 10n ** 20n }); // 100 ETH
  return reg;
}

/** Create a registry Contract wrapper that sends as the authority */
function registryAsAuthority(registry: Contract): Contract {
  const wallet = walletWithKey(AUTHORITY_KEY);
  return new Contract(registry.address, registry.artifact, publicClient, wallet);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO A: Empty Registry
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario A: Empty Registry', () => {
  let registry: Contract;
  let authRegistry: Contract;
  let snapId: `0x${string}`;

  beforeAll(async () => {
    const clients = createAnvilClients();
    publicClient = clients.public;
    testClient = clients.test;

    await fetch('http://127.0.0.1:8545', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'anvil_reset', params: [], id: 1 }),
    });

    registry = await deployRegistry(testClient);
    authRegistry = registryAsAuthority(registry);
  }, 60_000);

  beforeEach(async () => {
    snapId = await snapshot(testClient);
  });

  afterEach(async () => {
    await revert(testClient, snapId);
  });

  // ─── Constructor ─────────────────────────────────────────────────────

  it('constructor: sets authority', async () => {
    expect(await registry.read('authority')).toBe(getAddress(authority));
    expect(await registry.read('citizenCount')).toBe(0n);
  });

  it('revert: constructor with zero address', async () => {
    const wallet = walletWithKey(AUTHORITY_KEY);
    await expectRevert(
      deployStandalone(publicClient, wallet, CitizenRegistryArtifact, ['0x0000000000000000000000000000000000000000']),
      'ZeroAddress',
    );
  });

  // ─── Views on empty registry ─────────────────────────────────────────

  it('isCitizen: false for unregistered', async () => {
    expect(await registry.read('isCitizen', [citizen1])).toBe(false);
  });

  it('citizenCount: 0 when empty', async () => {
    expect(await registry.read('citizenCount')).toBe(0n);
  });

  it('identityHash: zero for unregistered', async () => {
    expect(await registry.read('identityHash', [citizen1])).toBe('0x0000000000000000000000000000000000000000000000000000000000000000');
  });

  it('citizenProvince: 0 for unregistered', async () => {
    expect(Number(await registry.read('citizenProvince', [citizen1]))).toBe(0);
  });

  // ─── registerCitizen: happy paths ────────────────────────────────────

  it('registerCitizen: registers with correct state', async () => {
    await authRegistry.write('registerCitizen', [citizen1, IDENTITY_HASH_1, 1]);

    expect(await registry.read('isCitizen', [citizen1])).toBe(true);
    expect(await registry.read('identityHash', [citizen1])).toBe(IDENTITY_HASH_1);
    expect(await registry.read('citizenCount')).toBe(1n);
    expect(Number(await registry.read('citizenProvince', [citizen1]))).toBe(1);
    expect(await registry.read('provinceCitizenCount', [1])).toBe(1n);
  });

  it('registerCitizen: multiple citizens', async () => {
    await authRegistry.write('registerCitizen', [citizen1, IDENTITY_HASH_1, 1]);
    await authRegistry.write('registerCitizen', [citizen2, IDENTITY_HASH_2, 1]);
    await authRegistry.write('registerCitizen', [citizen3, IDENTITY_HASH_3, 5]);

    expect(await registry.read('citizenCount')).toBe(3n);
    expect(await registry.read('provinceCitizenCount', [1])).toBe(2n);
    expect(await registry.read('provinceCitizenCount', [5])).toBe(1n);
  });

  it('registerCitizen: emits events', async () => {
    const hash = await authRegistry.write('registerCitizen', [citizen1, IDENTITY_HASH_1, 1]);
    const regEvents = await getEvents(publicClient, hash, CitizenRegistryArtifact.abi, 'CitizenRegistered');
    const provEvents = await getEvents(publicClient, hash, CitizenRegistryArtifact.abi, 'ProvinceAssigned');
    expect(regEvents.length).toBe(1);
    expect(provEvents.length).toBe(1);
  });

  // ─── registerCitizen: revert paths ───────────────────────────────────

  it('revert: registerCitizen by non-authority', async () => {
    await expectRevert(
      callAs(testClient, publicClient, nonAuthority, registry, 'registerCitizen', [citizen1, IDENTITY_HASH_1, 1]),
      'NotAuthority',
    );
  });

  it('revert: registerCitizen zero address', async () => {
    await expectRevert(
      authRegistry.write('registerCitizen', ['0x0000000000000000000000000000000000000000', IDENTITY_HASH_1, 1]),
      'ZeroAddress',
    );
  });

  it('revert: registerCitizen already registered', async () => {
    await authRegistry.write('registerCitizen', [citizen1, IDENTITY_HASH_1, 1]);
    await expectRevert(
      authRegistry.write('registerCitizen', [citizen1, IDENTITY_HASH_1, 1]),
      'AlreadyRegistered',
    );
  });

  it('revert: registerCitizen invalid province 0', async () => {
    await expectRevert(
      authRegistry.write('registerCitizen', [citizen1, IDENTITY_HASH_1, 0]),
      'InvalidProvince',
    );
  });

  it('revert: registerCitizen invalid province too high', async () => {
    await expectRevert(
      authRegistry.write('registerCitizen', [citizen1, IDENTITY_HASH_1, 32]),
      'InvalidProvince',
    );
  });

  it('boundary: registerCitizen province 31', async () => {
    await authRegistry.write('registerCitizen', [citizen1, IDENTITY_HASH_1, 31]);
    expect(Number(await registry.read('citizenProvince', [citizen1]))).toBe(31);
    expect(await registry.read('provinceCitizenCount', [31])).toBe(1n);
  });

  it('boundary: registerCitizen many registrations', async () => {
    const count = 50;
    for (let i = 0; i < count; i++) {
      const addr = getAddress('0x' + (i + 100).toString(16).padStart(40, '0'));
      const idHash = keccak256(encodePacked(['string', 'uint256'], ['citizen', BigInt(i)]));
      await authRegistry.write('registerCitizen', [addr, idHash, 1]);
    }
    expect(await registry.read('citizenCount')).toBe(BigInt(count));
  });

  // ─── registerWithSignature: happy paths ──────────────────────────────

  it('registerWithSignature: self-registration', async () => {
    const nonce = (await registry.read('registrationNonce', [citizen1])) as bigint;
    const { v, r, s } = await signRegistration(registry.address, citizen1, IDENTITY_HASH_1, 1, nonce);

    await callAs(testClient, publicClient, citizen1, registry, 'registerWithSignature', [citizen1, IDENTITY_HASH_1, 1, v, r, s]);

    expect(await registry.read('isCitizen', [citizen1])).toBe(true);
    expect(await registry.read('identityHash', [citizen1])).toBe(IDENTITY_HASH_1);
    expect(Number(await registry.read('citizenProvince', [citizen1]))).toBe(1);
  });

  it('registerWithSignature: third party submits', async () => {
    const nonce = (await registry.read('registrationNonce', [citizen1])) as bigint;
    const { v, r, s } = await signRegistration(registry.address, citizen1, IDENTITY_HASH_1, 1, nonce);

    await callAs(testClient, publicClient, nonAuthority, registry, 'registerWithSignature', [citizen1, IDENTITY_HASH_1, 1, v, r, s]);
    expect(await registry.read('isCitizen', [citizen1])).toBe(true);
  });

  it('registerWithSignature: emits events', async () => {
    const nonce = (await registry.read('registrationNonce', [citizen1])) as bigint;
    const { v, r, s } = await signRegistration(registry.address, citizen1, IDENTITY_HASH_1, 1, nonce);

    const hash = await callAs(testClient, publicClient, citizen1, registry, 'registerWithSignature', [citizen1, IDENTITY_HASH_1, 1, v, r, s]);
    const regEvents = await getEvents(publicClient, hash, CitizenRegistryArtifact.abi, 'CitizenRegistered');
    const provEvents = await getEvents(publicClient, hash, CitizenRegistryArtifact.abi, 'ProvinceAssigned');
    expect(regEvents.length).toBe(1);
    expect(provEvents.length).toBe(1);
  });

  // ─── registerWithSignature: revert paths ─────────────────────────────

  it('revert: registerWithSignature wrong citizen address', async () => {
    const nonce = (await registry.read('registrationNonce', [citizen1])) as bigint;
    const { v, r, s } = await signRegistration(registry.address, citizen1, IDENTITY_HASH_1, 1, nonce);

    await expectRevert(
      callAs(testClient, publicClient, citizen2, registry, 'registerWithSignature', [citizen2, IDENTITY_HASH_1, 1, v, r, s]),
      'InvalidSignature',
    );
  });

  it('revert: registerWithSignature wrong identity hash', async () => {
    const nonce = (await registry.read('registrationNonce', [citizen1])) as bigint;
    const { v, r, s } = await signRegistration(registry.address, citizen1, IDENTITY_HASH_1, 1, nonce);

    await expectRevert(
      callAs(testClient, publicClient, citizen1, registry, 'registerWithSignature', [citizen1, IDENTITY_HASH_2, 1, v, r, s]),
      'InvalidSignature',
    );
  });

  it('revert: registerWithSignature already registered', async () => {
    const nonce = (await registry.read('registrationNonce', [citizen1])) as bigint;
    const { v, r, s } = await signRegistration(registry.address, citizen1, IDENTITY_HASH_1, 1, nonce);

    await callAs(testClient, publicClient, citizen1, registry, 'registerWithSignature', [citizen1, IDENTITY_HASH_1, 1, v, r, s]);

    await expectRevert(
      callAs(testClient, publicClient, citizen1, registry, 'registerWithSignature', [citizen1, IDENTITY_HASH_1, 1, v, r, s]),
      'AlreadyRegistered',
    );
  });

  it('revert: registerWithSignature zero address', async () => {
    const zero = '0x0000000000000000000000000000000000000000' as Address;
    const nonce = (await registry.read('registrationNonce', [zero])) as bigint;
    const { v, r, s } = await signRegistration(registry.address, zero, IDENTITY_HASH_1, 1, nonce);

    await expectRevert(
      callAs(testClient, publicClient, citizen1, registry, 'registerWithSignature', [zero, IDENTITY_HASH_1, 1, v, r, s]),
      'ZeroAddress',
    );
  });

  it('revert: registerWithSignature non-authority signer', async () => {
    const nonce = (await registry.read('registrationNonce', [citizen1])) as bigint;
    const { v, r, s } = await signWithFakeKey(registry.address, citizen1, IDENTITY_HASH_1, 1, nonce);

    await expectRevert(
      callAs(testClient, publicClient, citizen1, registry, 'registerWithSignature', [citizen1, IDENTITY_HASH_1, 1, v, r, s]),
      'InvalidSignature',
    );
  });

  it('revert: registerWithSignature ecrecover returns zero', async () => {
    const zeroBytes32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;
    await expectRevert(
      callAs(testClient, publicClient, citizen1, registry, 'registerWithSignature', [citizen1, IDENTITY_HASH_1, 1, 0, zeroBytes32, zeroBytes32]),
      'InvalidSignature',
    );
  });

  it('revert: registerWithSignature wrong province', async () => {
    const nonce = (await registry.read('registrationNonce', [citizen1])) as bigint;
    const { v, r, s } = await signRegistration(registry.address, citizen1, IDENTITY_HASH_1, 1, nonce);

    // Signed for province 1, submit with province 2
    await expectRevert(
      callAs(testClient, publicClient, citizen1, registry, 'registerWithSignature', [citizen1, IDENTITY_HASH_1, 2, v, r, s]),
      'InvalidSignature',
    );
  });

  it('revert: registerWithSignature invalid province 0', async () => {
    const nonce = (await registry.read('registrationNonce', [citizen1])) as bigint;
    const { v, r, s } = await signRegistration(registry.address, citizen1, IDENTITY_HASH_1, 0, nonce);

    await expectRevert(
      callAs(testClient, publicClient, citizen1, registry, 'registerWithSignature', [citizen1, IDENTITY_HASH_1, 0, v, r, s]),
      'InvalidProvince',
    );
  });

  it('revert: registerWithSignature invalid province too high', async () => {
    const nonce = (await registry.read('registrationNonce', [citizen1])) as bigint;
    const { v, r, s } = await signRegistration(registry.address, citizen1, IDENTITY_HASH_1, 32, nonce);

    await expectRevert(
      callAs(testClient, publicClient, citizen1, registry, 'registerWithSignature', [citizen1, IDENTITY_HASH_1, 32, v, r, s]),
      'InvalidProvince',
    );
  });

  // ─── setCscaKey ──────────────────────────────────────────────────────

  it('setCscaKey: sets key fields', async () => {
    await authRegistry.write('setCscaKey', [123n, 456n, 0xDEADn]);
    expect(await registry.read('cscaPubKeyAx')).toBe(123n);
    expect(await registry.read('cscaPubKeyAy')).toBe(456n);
    expect(await registry.read('cscaKeyHash')).toBe(BigInt(0xDEAD));
  });

  it('setCscaKey: overwrite', async () => {
    await authRegistry.write('setCscaKey', [111n, 222n, 0xAAAAn]);
    await authRegistry.write('setCscaKey', [333n, 444n, 0xBBBBn]);
    expect(await registry.read('cscaPubKeyAx')).toBe(333n);
    expect(await registry.read('cscaPubKeyAy')).toBe(444n);
    expect(await registry.read('cscaKeyHash')).toBe(BigInt(0xBBBB));
  });

  it('revert: setCscaKey by non-authority', async () => {
    await expectRevert(
      callAs(testClient, publicClient, nonAuthority, registry, 'setCscaKey', [0n, 0n, 0xDEADn]),
      'NotAuthority',
    );
  });

  // ─── transferAuthority ───────────────────────────────────────────────

  it('transferAuthority: changes authority', async () => {
    await authRegistry.write('transferAuthority', [newAuthority]);
    expect(await registry.read('authority')).toBe(newAuthority);
  });

  it('transferAuthority: emits event', async () => {
    const hash = await authRegistry.write('transferAuthority', [newAuthority]);
    const events = await getEvents(publicClient, hash, CitizenRegistryArtifact.abi, 'AuthorityTransferred');
    expect(events.length).toBe(1);
  });

  it('transferAuthority: new authority can register', async () => {
    await authRegistry.write('transferAuthority', [newAuthority]);
    await callAs(testClient, publicClient, newAuthority, registry, 'registerCitizen', [citizen1, IDENTITY_HASH_1, 1]);
    expect(await registry.read('isCitizen', [citizen1])).toBe(true);
  });

  it('transferAuthority: old authority cannot register', async () => {
    await authRegistry.write('transferAuthority', [newAuthority]);
    await expectRevert(
      authRegistry.write('registerCitizen', [citizen1, IDENTITY_HASH_1, 1]),
      'NotAuthority',
    );
  });

  it('revert: transferAuthority to zero address', async () => {
    await expectRevert(
      authRegistry.write('transferAuthority', ['0x0000000000000000000000000000000000000000']),
      'ZeroAddress',
    );
  });

  it('revert: transferAuthority by non-authority', async () => {
    await expectRevert(
      callAs(testClient, publicClient, nonAuthority, registry, 'transferAuthority', [newAuthority]),
      'NotAuthority',
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO B: Registry With Citizens
// ═══════════════════════════════════════════════════════════════════════════════

describe('Scenario B: Registry With Citizens', () => {
  let registry: Contract;
  let authRegistry: Contract;
  let snapId: `0x${string}`;

  beforeAll(async () => {
    const clients = createAnvilClients();
    publicClient = clients.public;
    testClient = clients.test;

    await fetch('http://127.0.0.1:8545', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'anvil_reset', params: [], id: 1 }),
    });

    registry = await deployRegistry(testClient);
    authRegistry = registryAsAuthority(registry);

    // Register 2 citizens
    await authRegistry.write('registerCitizen', [citizen1, IDENTITY_HASH_1, 1]);
    await authRegistry.write('registerCitizen', [citizen2, IDENTITY_HASH_2, 5]);
  }, 60_000);

  beforeEach(async () => {
    snapId = await snapshot(testClient);
  });

  afterEach(async () => {
    await revert(testClient, snapId);
  });

  // ─── revokeCitizenship: happy paths ──────────────────────────────────

  it('revokeCitizenship: revokes citizen', async () => {
    await authRegistry.write('revokeCitizenship', [citizen1]);
    expect(await registry.read('isCitizen', [citizen1])).toBe(false);
    expect(await registry.read('identityHash', [citizen1])).toBe('0x0000000000000000000000000000000000000000000000000000000000000000');
    expect(await registry.read('citizenCount')).toBe(1n);
  });

  it('revokeCitizenship: emits event', async () => {
    const hash = await authRegistry.write('revokeCitizenship', [citizen1]);
    const events = await getEvents(publicClient, hash, CitizenRegistryArtifact.abi, 'CitizenRevoked');
    expect(events.length).toBe(1);
  });

  it('revokeCitizenship: count decrements', async () => {
    expect(await registry.read('citizenCount')).toBe(2n);
    await authRegistry.write('revokeCitizenship', [citizen1]);
    expect(await registry.read('citizenCount')).toBe(1n);
    expect(await registry.read('isCitizen', [citizen2])).toBe(true);
  });

  it('revokeCitizenship: clears province', async () => {
    expect(Number(await registry.read('citizenProvince', [citizen2]))).toBe(5);
    expect(await registry.read('provinceCitizenCount', [5])).toBe(1n);

    await authRegistry.write('revokeCitizenship', [citizen2]);

    expect(Number(await registry.read('citizenProvince', [citizen2]))).toBe(0);
    expect(await registry.read('provinceCitizenCount', [5])).toBe(0n);
  });

  // ─── revokeCitizenship: revert paths ─────────────────────────────────

  it('revert: revokeCitizenship not registered', async () => {
    const notRegistered = makeAddr('notRegistered');
    await expectRevert(
      authRegistry.write('revokeCitizenship', [notRegistered]),
      'NotRegistered',
    );
  });

  it('revert: revokeCitizenship by non-authority', async () => {
    await expectRevert(
      callAs(testClient, publicClient, nonAuthority, registry, 'revokeCitizenship', [citizen1]),
      'NotAuthority',
    );
  });

  // ─── Revoke and re-register ──────────────────────────────────────────

  it('revoke and re-register', async () => {
    await authRegistry.write('revokeCitizenship', [citizen1]);

    const newHash = keccak256(encodePacked(['string'], ['passport:citizen1:renewed']));
    await authRegistry.write('registerCitizen', [citizen1, newHash, 3]);

    expect(await registry.read('isCitizen', [citizen1])).toBe(true);
    expect(await registry.read('identityHash', [citizen1])).toBe(newHash);
    expect(Number(await registry.read('citizenProvince', [citizen1]))).toBe(3);
    expect(await registry.read('citizenCount')).toBe(2n);
  });

  // ─── assignProvince: happy paths ─────────────────────────────────────

  it('assignProvince: reassigns province', async () => {
    await authRegistry.write('assignProvince', [citizen1, 3]);
    expect(Number(await registry.read('citizenProvince', [citizen1]))).toBe(3);
    expect(await registry.read('provinceCitizenCount', [1])).toBe(0n);
    expect(await registry.read('provinceCitizenCount', [3])).toBe(1n);
  });

  it('assignProvince: emits event', async () => {
    const hash = await authRegistry.write('assignProvince', [citizen1, 7]);
    const events = await getEvents(publicClient, hash, CitizenRegistryArtifact.abi, 'ProvinceAssigned');
    expect(events.length).toBe(1);
  });

  it('assignProvince: multiple reassigns', async () => {
    await authRegistry.write('assignProvince', [citizen1, 5]);
    await authRegistry.write('assignProvince', [citizen1, 10]);
    expect(Number(await registry.read('citizenProvince', [citizen1]))).toBe(10);
    expect(await registry.read('provinceCitizenCount', [1])).toBe(0n);
    expect(await registry.read('provinceCitizenCount', [5])).toBe(1n); // citizen2 still here
    expect(await registry.read('provinceCitizenCount', [10])).toBe(1n);
  });

  // ─── assignProvince: revert paths ────────────────────────────────────

  it('revert: assignProvince not registered', async () => {
    const notRegistered = makeAddr('notRegistered');
    await expectRevert(
      authRegistry.write('assignProvince', [notRegistered, 1]),
      'NotRegistered',
    );
  });

  it('revert: assignProvince invalid province 0', async () => {
    await expectRevert(
      authRegistry.write('assignProvince', [citizen1, 0]),
      'InvalidProvince',
    );
  });

  it('revert: assignProvince invalid province too high', async () => {
    await expectRevert(
      authRegistry.write('assignProvince', [citizen1, 32]),
      'InvalidProvince',
    );
  });

  it('revert: assignProvince by non-authority', async () => {
    await expectRevert(
      callAs(testClient, publicClient, nonAuthority, registry, 'assignProvince', [citizen1, 1]),
      'NotAuthority',
    );
  });

  // ─── Signature replay protection ─────────────────────────────────────

  it('revert: signature replay after revocation', async () => {
    await authRegistry.write('revokeCitizenship', [citizen1]);
    expect(await registry.read('registrationNonce', [citizen1])).toBe(1n);

    // Sign with old nonce (0) — should fail
    const { v, r, s } = await signRegistrationWithNonce(registry.address, citizen1, IDENTITY_HASH_1, 1, 0n);
    await expectRevert(
      callAs(testClient, publicClient, citizen1, registry, 'registerWithSignature', [citizen1, IDENTITY_HASH_1, 1, v, r, s]),
      'InvalidSignature',
    );
  });

  it('re-register with new signature after revocation', async () => {
    await authRegistry.write('revokeCitizenship', [citizen1]);
    expect(await registry.read('registrationNonce', [citizen1])).toBe(1n);

    // Sign with new nonce (1)
    const newHash = keccak256(encodePacked(['string'], ['passport:citizen1:renewed']));
    const nonce = (await registry.read('registrationNonce', [citizen1])) as bigint;
    const { v, r, s } = await signRegistration(registry.address, citizen1, newHash, 1, nonce);

    await callAs(testClient, publicClient, citizen1, registry, 'registerWithSignature', [citizen1, newHash, 1, v, r, s]);

    expect(await registry.read('isCitizen', [citizen1])).toBe(true);
    expect(await registry.read('identityHash', [citizen1])).toBe(newHash);
  });
});
