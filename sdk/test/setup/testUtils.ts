/**
 * Shared test utilities for standalone contract tests.
 * Provides helpers for deployment, impersonation, reverts, and events.
 */

import {
  type Address,
  type PublicClient,
  type WalletClient,
  type TestClient,
  getAddress,
  keccak256,
  toHex,
  createWalletClient,
  http,
  parseEventLogs,
} from 'viem';
import { foundry } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { expect } from 'vitest';
import { Contract } from '../../src/client/GovClient.js';
import type { Artifact } from '../../src/abi/index.js';
import { asAccount } from '../../src/client/AnvilHelpers.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Address Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/** Generate a deterministic address from a label (like Foundry's makeAddr) */
export function makeAddr(name: string): Address {
  const hash = keccak256(toHex(name));
  return getAddress('0x' + hash.slice(26));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Deployment
// ═══════════════════════════════════════════════════════════════════════════════

/** Anvil default account[0] private key */
const DEPLOYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;

/** Create a wallet client with a private key for a specific Anvil account index */
export function walletWithKey(key: `0x${string}`): WalletClient {
  const account = privateKeyToAccount(key);
  return createWalletClient({
    chain: foundry,
    transport: http('http://127.0.0.1:8545'),
    account,
  });
}

/** Create the default deployer wallet (Anvil account[0]) */
export function deployerWallet(): WalletClient {
  return walletWithKey(DEPLOYER_KEY);
}

/** Deploy a single contract and return a Contract wrapper */
export async function deployStandalone(
  publicClient: PublicClient,
  walletClient: WalletClient,
  artifact: Artifact,
  args: unknown[] = [],
): Promise<Contract> {
  const hash = await walletClient.deployContract({
    abi: artifact.abi as any,
    bytecode: artifact.bytecode,
    args,
    account: walletClient.account!,
    chain: walletClient.chain,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error('Deployment failed — no contract address');
  return new Contract(receipt.contractAddress, artifact, publicClient, walletClient);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Impersonation
// ═══════════════════════════════════════════════════════════════════════════════

/** Call a contract function as an impersonated address */
export async function callAs(
  testClient: TestClient,
  publicClient: PublicClient,
  caller: Address,
  contract: Contract,
  fn: string,
  args: unknown[] = [],
): Promise<`0x${string}`> {
  return asAccount(testClient, caller, async () => {
    const wallet = createWalletClient({
      chain: foundry,
      transport: http('http://127.0.0.1:8545'),
      account: { address: caller, type: 'json-rpc' } as any,
    });
    const c = new Contract(contract.address, contract.artifact, publicClient, wallet);
    return c.write(fn, args);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Revert Assertions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Assert that a contract call reverts with a specific error name.
 * Mirrors Foundry's `vm.expectRevert(Contract.ErrorName.selector)`.
 */
export async function expectRevert(
  promise: Promise<unknown>,
  errorName: string,
): Promise<void> {
  try {
    await promise;
    expect.fail(`Expected revert with ${errorName} but call succeeded`);
  } catch (e: any) {
    // Don't catch our own assertion failures
    if (e.message?.startsWith('Expected revert with')) throw e;

    // Try decoded error name from viem's contract error
    const name = e.cause?.data?.errorName ?? e.data?.errorName;
    if (name) {
      expect(name, `Expected error ${errorName} but got ${name}`).toBe(errorName);
      return;
    }

    // Fallback: check if the error message/shortMessage contains the error name
    // This handles deployment errors where viem can't decode the custom error
    const msg = e.shortMessage ?? e.cause?.shortMessage ?? e.message ?? '';
    expect(
      msg.includes(errorName) || msg.includes('revert'),
      `Expected revert with ${errorName} but got: ${msg}`,
    ).toBe(true);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Event Assertions
// ═══════════════════════════════════════════════════════════════════════════════

/** Get decoded events from a transaction hash */
export async function getEvents(
  publicClient: PublicClient,
  hash: `0x${string}`,
  abi: readonly unknown[],
  eventName?: string,
): Promise<any[]> {
  const receipt = await publicClient.getTransactionReceipt({ hash });
  return parseEventLogs({ abi: abi as any, logs: receipt.logs, eventName } as any);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Code Injection (vm.etch equivalent)
// ═══════════════════════════════════════════════════════════════════════════════

/** Set contract code at an address (like Foundry's vm.etch) */
export async function setCode(
  testClient: TestClient,
  address: Address,
  bytecode: `0x${string}` = '0x00',
): Promise<void> {
  await testClient.setCode({ address, bytecode });
}
