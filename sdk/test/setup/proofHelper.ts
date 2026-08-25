/**
 * ProofHelper — TypeScript port of ProofHelper.sol
 *
 * Generates mock ZK ballot/referendum proofs for testing.
 * MockBallotVerifier ignores proof points; only validates pubSignals structure.
 */

import { keccak256, encodePacked, type Address } from 'viem';
import {
  MOCK_CSCA_KEY_HASH,
  MOCK_CURRENT_DATE,
  CITIZENSHIP_IRAN,
  type ProofPoints,
} from '../../src/types/index.js';
import type { GovTestEnv } from './fixtures.js';
import { writeAs } from './fixtures.js';

/** Zero proof points — MockBallotVerifier ignores them */
const ZERO_PROOF: ProofPoints = {
  a: [0n, 0n],
  b: [[0n, 0n], [0n, 0n]],
  c: [0n, 0n],
};

/**
 * Deterministic identity hash for a voter.
 * Matches ProofHelper.sol: keccak256(abi.encodePacked("identity", voter))
 */
export function identityHash(voter: Address): `0x${string}` {
  return keccak256(encodePacked(['string', 'address'], ['identity', voter]));
}

/**
 * Build a mock ballot proof for election voting.
 * Matches ProofHelper._mockBallotProof().
 */
export function mockBallotProof(
  idHash: `0x${string}`,
  electionId: bigint,
  candidateIndex: bigint,
  provinceId: number,
): { proof: ProofPoints; pubSignals: bigint[] } {
  const nullifier = BigInt(
    keccak256(encodePacked(['bytes32', 'uint256'], [idHash, electionId])),
  );

  const pubSignals = new Array<bigint>(23).fill(0n);
  pubSignals[0] = nullifier;
  pubSignals[6] = CITIZENSHIP_IRAN;
  pubSignals[9] = electionId;
  pubSignals[10] = candidateIndex;
  pubSignals[11] = BigInt(provinceId);
  pubSignals[12] = MOCK_CSCA_KEY_HASH;
  pubSignals[13] = MOCK_CURRENT_DATE;

  return { proof: ZERO_PROOF, pubSignals };
}

/**
 * Build a mock referendum proof.
 * Matches ProofHelper._mockReferendumProof().
 */
export function mockReferendumProof(
  idHash: `0x${string}`,
  amendmentId: bigint,
): { proof: ProofPoints; pubSignals: bigint[] } {
  const nullifier = BigInt(
    keccak256(encodePacked(['bytes32', 'uint256'], [idHash, amendmentId])),
  );

  const pubSignals = new Array<bigint>(23).fill(0n);
  pubSignals[0] = nullifier;
  pubSignals[6] = CITIZENSHIP_IRAN;
  pubSignals[9] = amendmentId;
  pubSignals[12] = MOCK_CSCA_KEY_HASH;
  pubSignals[13] = MOCK_CURRENT_DATE;

  return { proof: ZERO_PROOF, pubSignals };
}

/**
 * Cast a ballot in an election (matches TestBase._castBallot).
 */
export async function castBallot(
  env: GovTestEnv,
  voter: Address,
  electionId: bigint,
  candidateIndex: bigint,
  provinceId = 1,
): Promise<void> {
  const idHash = identityHash(voter);
  const { proof, pubSignals } = mockBallotProof(idHash, electionId, candidateIndex, provinceId);

  await writeAs(env.contracts.election, env.publicClient, voter, env.testClient,
    'castBallot', [electionId, candidateIndex, proof, pubSignals]);
}

/**
 * Cast a referendum vote (matches TestBase._castReferendumVote).
 */
export async function castReferendumVote(
  env: GovTestEnv,
  voter: Address,
  amendmentId: bigint,
  support: boolean,
): Promise<void> {
  const idHash = identityHash(voter);
  const { proof, pubSignals } = mockReferendumProof(idHash, amendmentId);

  await writeAs(env.contracts.referendum, env.publicClient, voter, env.testClient,
    'castReferendumVote', [amendmentId, support, proof, pubSignals]);
}
