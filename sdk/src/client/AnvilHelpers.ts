/**
 * AnvilHelpers — time warping, snapshotting, and account management for Anvil.
 *
 * These wrap Anvil-specific JSON-RPC methods (evm_increaseTime, evm_snapshot, etc.)
 * and provide typed helpers matching the Foundry test cheatcodes.
 */

import {
  type Address,
  type PublicClient,
  type WalletClient,
  type TestClient,
  createTestClient,
  createPublicClient,
  createWalletClient,
  http,
  type Chain,
} from 'viem';
import { foundry } from 'viem/chains';

// ═══════════════════════════════════════════════════════════════════════════════
// Client Factory
// ═══════════════════════════════════════════════════════════════════════════════

export interface AnvilClients {
  public: PublicClient;
  wallet: WalletClient;
  test: TestClient;
}

/**
 * Create all three viem clients pointing at a local Anvil instance.
 * @param rpcUrl - Anvil RPC URL (default: http://127.0.0.1:8545)
 * @param account - Account address to use for wallet client
 */
export function createAnvilClients(rpcUrl = 'http://127.0.0.1:8545', account?: Address): AnvilClients {
  const transport = http(rpcUrl);
  const chain = foundry;

  const publicClient = createPublicClient({ chain, transport });

  const testClient = createTestClient({
    chain,
    mode: 'anvil',
    transport,
  });

  const walletClient = createWalletClient({
    chain,
    transport,
    account,
  });

  return {
    public: publicClient,
    wallet: walletClient,
    test: testClient,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Time Helpers (matching vm.warp / vm.warpForward)
// ═══════════════════════════════════════════════════════════════════════════════

/** Advance block timestamp by `seconds`. Mirrors `vm.warp(currentTime + seconds)`. */
export async function warpForward(test: TestClient, seconds: number | bigint): Promise<void> {
  await test.increaseTime({ seconds: Number(seconds) });
  await test.mine({ blocks: 1 });
}

/** Set block timestamp to an absolute value. Mirrors `vm.warp(timestamp)`. */
export async function warpTo(test: TestClient, timestamp: number | bigint): Promise<void> {
  await test.setNextBlockTimestamp({ timestamp: BigInt(timestamp) });
  await test.mine({ blocks: 1 });
}

/** Get current block timestamp. */
export async function currentTimestamp(publicClient: PublicClient): Promise<bigint> {
  const block = await publicClient.getBlock();
  return block.timestamp;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Snapshot / Revert (for test isolation)
// ═══════════════════════════════════════════════════════════════════════════════

/** Take a snapshot of the current chain state. Returns snapshot ID. */
export async function snapshot(test: TestClient): Promise<`0x${string}`> {
  return await test.snapshot();
}

/** Revert chain state to a previous snapshot. */
export async function revert(test: TestClient, snapshotId: `0x${string}`): Promise<void> {
  await test.revert({ id: snapshotId });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Account Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/** Impersonate an account (like vm.prank for the rest of the session). */
export async function impersonate(test: TestClient, address: Address): Promise<void> {
  await test.impersonateAccount({ address });
}

/** Stop impersonating an account. */
export async function stopImpersonate(test: TestClient, address: Address): Promise<void> {
  await test.stopImpersonatingAccount({ address });
}

/** Set ETH balance for an address (useful for impersonated contracts). */
export async function setBalance(test: TestClient, address: Address, value: bigint): Promise<void> {
  await test.setBalance({ address, value });
}

/**
 * Execute a transaction as a specific account (one-shot impersonation).
 * Mirrors `vm.prank(account)` — impersonate, execute, stop.
 */
export async function asAccount<T>(
  test: TestClient,
  account: Address,
  fn: () => Promise<T>,
): Promise<T> {
  await impersonate(test, account);
  await setBalance(test, account, 10n ** 18n); // Ensure gas funds
  try {
    return await fn();
  } finally {
    await stopImpersonate(test, account);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Constants (matching TestBase.sol)
// ═══════════════════════════════════════════════════════════════════════════════

/** 2026-02-17 00:00 UTC — the base timestamp used in all tests */
export const BASE_TIMESTAMP = 1771286400n;

/** Standard time durations in seconds */
export const DAYS = (n: number) => BigInt(n) * 86400n;
