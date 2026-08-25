/**
 * Test fixtures — TypeScript port of TestBase.sol (GovTestBase).
 *
 * Deploys all 11 contracts, performs coronation, registers citizens,
 * initializes provinces, assigns citizens to provinces, appoints audit head.
 *
 * Uses Anvil's default accounts (with known private keys) for the deployer,
 * and impersonation for contract-to-contract calls. Named actors (monarch,
 * citizen1-7, etc.) map to Anvil accounts 1-14.
 */

import {
  type Address,
  type PublicClient,
  type WalletClient,
  type TestClient,
  keccak256,
  encodePacked,
  toHex,
  padHex,
  getAddress,
  createWalletClient,
  http,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import { createAnvilClients, warpTo, asAccount, BASE_TIMESTAMP, setBalance } from '../../src/client/AnvilHelpers.js';
import { deployGov, type GovContracts, type GovAddresses } from '../../src/client/GovClient.js';
import { MOCK_CSCA_KEY_HASH } from '../../src/types/index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Anvil Default Accounts (deterministic private keys, 10000 ETH each)
// ═══════════════════════════════════════════════════════════════════════════════

/** Anvil private keys matching the default accounts */
const ANVIL_PRIVATE_KEYS: `0x${string}`[] = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
  '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e',
  '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356',
  '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97',
  '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6',
  '0xf214f2b2cd398c806f84e317254e0f0b801d0643303237d97a22a48e01628897',
  '0x701b615bbdfb9de65240bc28bd21bbc0d996645a3dd57e7b12bc2bdf6f192c82',
  '0xa267530f49f8280200edf313ee7af6b827f2a8bce2897751d06a843f644967b1',
  '0x47c99abed3324a2707c28affff1267e45918ec8c3f20b8aa892e8b065d2942dd',
  '0xc526ee95bf44d8fc405a158bb884d9d1238d99f0612e9f33d006bb0789009aaa',
  '0x8166f546bab6da521a8369cab06c5d2b9e46670292d85c875ee9ec20e84ffb61',
  '0xea6c44ac03bff858b476bba40716402b03e41b8e97e276d1baec7c37d42484a0',
  '0x689af8efa8c651a91ad287602527f3af2fe9f6501a7ac4b061667b5a93e037fd',
  '0xde9be858da4a475276426320d5e9262ecfc3ba460bfac56360bfa6c4c28b4ee0',
  '0xdf57089febbacf7ba0bc227dafbffa9fc08a93fdc68e1e42411a14efcf23656e',
];

/** Anvil's 20 default accounts — derived from private keys (guarantees consistency). */
const ANVIL_ACCOUNTS: Address[] = ANVIL_PRIVATE_KEYS.map(
  (key) => getAddress(privateKeyToAccount(key).address),
);

// ═══════════════════════════════════════════════════════════════════════════════
// Actor Addresses
// ═══════════════════════════════════════════════════════════════════════════════

export interface Actors {
  deployer: Address;
  authorityKey: Address;
  monarchAddr: Address;
  auditHead: Address;
  citizen1: Address;
  citizen2: Address;
  citizen3: Address;
  citizen4: Address;
  citizen5: Address;
  citizen6: Address;
  citizen7: Address;
  pmCandidate: Address;
  pmCandidate2: Address;
}

export function createActors(): Actors {
  return {
    deployer: ANVIL_ACCOUNTS[0],
    authorityKey: ANVIL_ACCOUNTS[1],
    monarchAddr: ANVIL_ACCOUNTS[2],
    auditHead: ANVIL_ACCOUNTS[3],
    citizen1: ANVIL_ACCOUNTS[4],
    citizen2: ANVIL_ACCOUNTS[5],
    citizen3: ANVIL_ACCOUNTS[6],
    citizen4: ANVIL_ACCOUNTS[7],
    citizen5: ANVIL_ACCOUNTS[8],
    citizen6: ANVIL_ACCOUNTS[9],
    citizen7: ANVIL_ACCOUNTS[10],
    pmCandidate: ANVIL_ACCOUNTS[11],
    pmCandidate2: ANVIL_ACCOUNTS[12],
  };
}

/** Create a wallet client for a specific Anvil account index (uses private key) */
function walletFor(index: number): WalletClient {
  const account = privateKeyToAccount(ANVIL_PRIVATE_KEYS[index]);
  return createWalletClient({
    chain: foundry,
    transport: http('http://127.0.0.1:8545'),
    account,
  });
}

/** Create a wallet client for a specific address */
export function walletForAddress(address: Address): WalletClient {
  const idx = ANVIL_ACCOUNTS.findIndex((a) => a.toLowerCase() === address.toLowerCase());
  if (idx >= 0) {
    return walletFor(idx);
  }
  // For non-Anvil accounts (e.g. contract addresses), use JSON-RPC impersonation
  return createWalletClient({
    chain: foundry,
    transport: http('http://127.0.0.1:8545'),
    account: { address, type: 'json-rpc' } as any,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Full Test Environment
// ═══════════════════════════════════════════════════════════════════════════════

export interface GovTestEnv {
  contracts: GovContracts;
  addresses: GovAddresses;
  actors: Actors;
  publicClient: PublicClient;
  testClient: TestClient;
  /** Current chain timestamp (tracked manually like TestBase.currentTime) */
  currentTime: bigint;
}

/**
 * Full governance test environment setup — mirrors TestBase.sol setUp().
 */
export async function setupGovBase(): Promise<GovTestEnv> {
  const clients = createAnvilClients();
  const actors = createActors();

  // Reset Anvil to genesis state (allows multiple suites to share one instance).
  // viem's test.reset() passes forking params that Anvil rejects, so we use raw RPC.
  await fetch('http://127.0.0.1:8545', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'anvil_reset', params: [], id: 1 }),
  });

  // Use Anvil account[0] as deployer (has private key, 10000 ETH)
  const deployerWallet = walletFor(0);

  // Deploy all contracts (deployer deploys, authorityKey as passport authority)
  const { contracts, addresses } = await deployGov(
    clients.public,
    deployerWallet,
    actors.authorityKey,
  );

  // Coronation (deployer calls crown.coronation)
  await contracts.crown.write('coronation', [actors.monarchAddr], actors.deployer);

  // Set trusted CSCA key (authorityKey calls registry.setCscaKey)
  const authWallet = walletFor(1);
  const authRegistry = new (contracts.registry.constructor as any)(
    contracts.registry.address,
    contracts.registry.artifact,
    clients.public,
    authWallet,
  );
  await authRegistry.write('setCscaKey', [0n, 0n, MOCK_CSCA_KEY_HASH], actors.authorityKey);

  // Warp to 2026-02-17 00:00 UTC
  await warpTo(clients.test, BASE_TIMESTAMP);

  // Register 9 citizens (all initially province 1)
  const allCitizens: Address[] = [
    actors.citizen1, actors.citizen2, actors.citizen3, actors.citizen4, actors.citizen5,
    actors.citizen6, actors.citizen7, actors.pmCandidate, actors.pmCandidate2,
  ];

  for (const citizen of allCitizens) {
    const identityHash = keccak256(encodePacked(['address'], [citizen]));
    await authRegistry.write('registerCitizen', [citizen, identityHash, 1], actors.authorityKey);
  }

  // Initialize 3 provinces: Tehran(id=1), Isfahan(id=2), Fars(id=3)
  const provinceInits = [
    { id: 1, name: padHex(toHex('TEHRAN'), { size: 32 }), councilSize: 5n, senateSeatCount: 3n, majlisSeatCount: 200n, cohort: 0 },
    { id: 2, name: padHex(toHex('ISFAHAN'), { size: 32 }), councilSize: 5n, senateSeatCount: 2n, majlisSeatCount: 60n, cohort: 1 },
    { id: 3, name: padHex(toHex('FARS'), { size: 32 }), councilSize: 5n, senateSeatCount: 2n, majlisSeatCount: 30n, cohort: 2 },
  ];

  const monarchCrown = contractAs(contracts.crown, clients.public, walletFor(2));
  await monarchCrown.write('initializeProvincialCouncils', [provinceInits], actors.monarchAddr);

  // Assign provinces: citizen6-7 → province 2, pmCandidate+pmCandidate2 → province 3
  await authRegistry.write('assignProvince', [actors.citizen6, 2], actors.authorityKey);
  await authRegistry.write('assignProvince', [actors.citizen7, 2], actors.authorityKey);
  await authRegistry.write('assignProvince', [actors.pmCandidate, 3], actors.authorityKey);
  await authRegistry.write('assignProvince', [actors.pmCandidate2, 3], actors.authorityKey);

  // Appoint audit head (Art. IX.4) — called by parliament contract address
  await asAccount(clients.test, addresses.parliament, async () => {
    const parlBudget = contractAs(contracts.budget, clients.public, walletForAddress(addresses.parliament));
    await parlBudget.write('appointAuditHead', [actors.auditHead], addresses.parliament);
  });

  return {
    contracts,
    addresses,
    actors,
    publicClient: clients.public,
    testClient: clients.test,
    currentTime: BASE_TIMESTAMP,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

import { Contract } from '../../src/client/GovClient.js';
import type { Artifact } from '../../src/abi/index.js';

/** Create a Contract wrapper for a different wallet (for sending as a different actor) */
export function contractAs(contract: Contract, publicClient: PublicClient, wallet: WalletClient): Contract {
  return new Contract(contract.address, contract.artifact, publicClient, wallet);
}

/**
 * Write a contract function as a specific actor.
 * Creates a temporary Contract wrapper with the actor's wallet.
 */
export async function writeAs(
  contract: Contract,
  publicClient: PublicClient,
  actorAddr: Address,
  testClient: TestClient,
  functionName: string,
  args: unknown[] = [],
): Promise<`0x${string}`> {
  // Check if actor is an Anvil default account
  const idx = ANVIL_ACCOUNTS.findIndex((a) => a.toLowerCase() === actorAddr.toLowerCase());
  if (idx >= 0) {
    const c = contractAs(contract, publicClient, walletFor(idx));
    return c.write(functionName, args, actorAddr);
  }
  // Otherwise, impersonate
  return asAccount(testClient, actorAddr, async () => {
    const c = contractAs(contract, publicClient, walletForAddress(actorAddr));
    return c.write(functionName, args, actorAddr);
  });
}
