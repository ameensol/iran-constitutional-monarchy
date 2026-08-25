/**
 * ABI imports from Foundry compiled output (contracts/out/).
 *
 * Each contract exports its ABI and bytecode for viem contract calls.
 * ABIs are loaded from the Foundry build output at runtime via fs.readFileSync.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface Artifact {
  abi: readonly Record<string, unknown>[];
  bytecode: `0x${string}`;
}

function loadArtifact(contractDir: string, contractName: string): Artifact {
  const path = resolve(__dirname, '../../../contracts/out', contractDir, `${contractName}.json`);
  const raw = JSON.parse(readFileSync(path, 'utf-8'));
  return {
    abi: raw.abi,
    bytecode: raw.bytecode.object as `0x${string}`,
  };
}

export const ConstitutionArtifact = loadArtifact('Constitution.sol', 'Constitution');
export const CitizenRegistryArtifact = loadArtifact('CitizenRegistry.sol', 'CitizenRegistry');
export const CrownArtifact = loadArtifact('Crown.sol', 'Crown');
export const ParliamentArtifact = loadArtifact('Parliament.sol', 'Parliament');
export const ExecutiveArtifact = loadArtifact('Executive.sol', 'Executive');
export const SupremeCourtArtifact = loadArtifact('SupremeCourt.sol', 'SupremeCourt');
export const ElectionArtifact = loadArtifact('Election.sol', 'Election');
export const ReferendumArtifact = loadArtifact('Referendum.sol', 'Referendum');
export const BudgetArtifact = loadArtifact('Budget.sol', 'Budget');
export const ProvincialCouncilArtifact = loadArtifact('ProvincialCouncil.sol', 'ProvincialCouncil');
export const MockBallotVerifierArtifact = loadArtifact('MockBallotVerifier.sol', 'MockBallotVerifier');
