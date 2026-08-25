/**
 * Test mixins — TypeScript ports of the 7 Mixin*.sol helpers.
 *
 * Each mixin takes a GovTestEnv and mutates chain state to reach a specific
 * governance scenario. They compose in the same hierarchy as Solidity.
 */

import {
  type Address,
  keccak256,
  encodePacked,
  toHex,
} from 'viem';
import type { GovTestEnv } from './fixtures.js';
import { writeAs, contractAs, walletForAddress } from './fixtures.js';
import { asAccount, warpForward, DAYS } from '../../src/client/AnvilHelpers.js';
import { castBallot } from './proofHelper.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Governance Action Helpers (matching MixinMajlis/MixinSenate)
// ═══════════════════════════════════════════════════════════════════════════════

/** Propose + vote 3/5 yes + finalize a Majlis governance action (no execute). */
export async function prepareMajlisAction(
  env: GovTestEnv,
  target: Address,
  data: `0x${string}`,
): Promise<bigint> {
  const { contracts, actors, testClient, publicClient } = env;
  const { citizen1, citizen2, citizen3 } = actors;

  const descHash = keccak256(toHex('majlis-action'));
  await writeAs(contracts.parliament, publicClient, citizen1, testClient,
    'proposeGovernanceAction', [target, data, 0, 50, descHash]);

  const actionCount = (await contracts.parliament.read('governanceActionCount')) as bigint;
  const actionId = actionCount - 1n;

  for (const voter of [citizen1, citizen2, citizen3]) {
    await writeAs(contracts.parliament, publicClient, voter, testClient,
      'voteOnGovernanceAction', [actionId, true]);
  }

  await warpForward(testClient, DAYS(3));
  env.currentTime += DAYS(3);
  await contracts.parliament.write('finalizeGovernanceAction', [actionId]);

  return actionId;
}

/** Execute a Majlis governance action: propose, 3/5 vote yes, finalize, execute. */
export async function executeMajlisAction(
  env: GovTestEnv,
  target: Address,
  data: `0x${string}`,
): Promise<bigint> {
  const actionId = await prepareMajlisAction(env, target, data);
  await env.contracts.parliament.write('executeGovernanceAction', [actionId]);
  return actionId;
}

/** Propose + vote all yes + finalize a Senate governance action (no execute). */
export async function prepareSenateAction(
  env: GovTestEnv & { senators: Address[] },
  target: Address,
  data: `0x${string}`,
): Promise<bigint> {
  const { contracts, testClient, publicClient, senators } = env;

  const descHash = keccak256(toHex('senate governance action'));
  await writeAs(contracts.parliament, publicClient, senators[0], testClient,
    'proposeGovernanceAction', [target, data, 1, 50, descHash]);

  const actionCount = (await contracts.parliament.read('governanceActionCount')) as bigint;
  const actionId = actionCount - 1n;

  for (const senator of senators) {
    await writeAs(contracts.parliament, publicClient, senator, testClient,
      'voteOnGovernanceAction', [actionId, true]);
  }

  await warpForward(testClient, DAYS(3));
  env.currentTime += DAYS(3);
  await contracts.parliament.write('finalizeGovernanceAction', [actionId]);

  return actionId;
}

/** Execute a Senate governance action. */
export async function executeSenateAction(
  env: GovTestEnv & { senators: Address[] },
  target: Address,
  data: `0x${string}`,
): Promise<bigint> {
  const actionId = await prepareSenateAction(env, target, data);
  await env.contracts.parliament.write('executeGovernanceAction', [actionId]);
  return actionId;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MixinMajlis — seats 5 Majlis members (citizen1-5) for province 1
// ═══════════════════════════════════════════════════════════════════════════════

export async function setupMajlis(env: GovTestEnv): Promise<void> {
  const { contracts, actors, addresses, testClient, publicClient } = env;
  const candidates = [actors.citizen1, actors.citizen2, actors.citizen3, actors.citizen4, actors.citizen5];

  // Start province-1 Majlis election (bootstrapping prank)
  await asAccount(testClient, addresses.parliament, async () => {
    const parlElection = contractAs(contracts.election, publicClient, walletForAddress(addresses.parliament));
    await parlElection.write('startMajlisElection', [1], addresses.parliament);
  });

  const electionCount = (await contracts.election.read('electionCount')) as bigint;
  const electionId = electionCount - 1n;

  // Register candidates
  for (let i = 0; i < candidates.length; i++) {
    const partyHash = keccak256(encodePacked(['string', 'uint256'], ['Party', BigInt(i)]));
    await writeAs(contracts.election, publicClient, candidates[i], testClient,
      'registerCandidate', [electionId, partyHash]);
  }

  // Warp past registration period
  const regPeriodKey = await contracts.constitution.read('PARAM_ELECTION_REG_PERIOD');
  const regPeriod = (await contracts.constitution.read('getParameter', [regPeriodKey])) as bigint;
  await warpForward(testClient, regPeriod);
  env.currentTime += regPeriod;

  await contracts.election.write('openVoting', [electionId]);

  // Cast ballots (all province 1)
  for (let i = 0; i < candidates.length; i++) {
    await castBallot(env, candidates[i], electionId, BigInt(i), 1);
  }

  // Warp past voting period
  const votePeriodKey = await contracts.constitution.read('PARAM_ELECTION_VOTE_PERIOD');
  const votePeriod = (await contracts.constitution.read('getParameter', [votePeriodKey])) as bigint;
  await warpForward(testClient, votePeriod);
  env.currentTime += votePeriod;

  await contracts.election.write('tallyVotes', [electionId]);

  // Seat winners via Crown ministerial act
  const seatData = contracts.election.encode('seatMembers', [electionId]);
  await writeAs(contracts.crown, publicClient, actors.monarchAddr, testClient,
    'executeMinisterialAct', [addresses.election, seatData]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MixinGovernment — full PM formation cycle (requires setupMajlis first)
// ═══════════════════════════════════════════════════════════════════════════════

export async function setupGovernment(env: GovTestEnv): Promise<void> {
  const { contracts, actors, addresses, testClient, publicClient } = env;

  // Start formation via Majlis governance action
  const startData = contracts.executive.encode('startFormation', []);
  await executeMajlisAction(env, addresses.executive, startData);

  // Crown nominates PM
  await writeAs(contracts.crown, publicClient, actors.monarchAddr, testClient,
    'nominatePrimeMinister', [actors.pmCandidate]);

  // Nominee presents government program
  const programHash = keccak256(toHex('government program'));
  await writeAs(contracts.executive, publicClient, actors.pmCandidate, testClient,
    'presentGovernment', [programHash]);

  // 3 of 5 Majlis members vote confidence
  for (const voter of [actors.citizen1, actors.citizen2, actors.citizen3]) {
    await writeAs(contracts.executive, publicClient, voter, testClient,
      'voteConfidence', [true]);
  }

  // Warp past MIN_VOTING_PERIOD (3 days), finalize
  await warpForward(testClient, DAYS(3));
  env.currentTime += DAYS(3);
  await contracts.executive.write('finalizeConfidenceVote', []);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MixinSenate — seats 3 senators via two-tier pipeline
// ═══════════════════════════════════════════════════════════════════════════════

export interface SenateEnv extends GovTestEnv {
  senators: Address[];
}

export async function setupSenate(env: GovTestEnv): Promise<SenateEnv> {
  const { contracts, actors, addresses, testClient, publicClient } = env;
  const senators = [actors.citizen6, actors.citizen7, actors.pmCandidate2];

  // PHASE 1: Provincial Council Elections (Province 2 + Province 3)
  for (const provId of [2, 3]) {
    const startElData = contracts.election.encode('startProvincialElection', [provId]);
    await writeAs(contracts.crown, publicClient, actors.monarchAddr, testClient,
      'executeMinisterialAct', [addresses.election, startElData]);
  }

  const elCount1 = (await contracts.election.read('electionCount')) as bigint;
  const prov3ElectionId = elCount1 - 1n;
  const prov2ElectionId = prov3ElectionId - 1n;

  // Register candidates
  await writeAs(contracts.election, publicClient, actors.citizen6, testClient,
    'registerCandidate', [prov2ElectionId, keccak256(toHex('Isfahan-A'))]);
  await writeAs(contracts.election, publicClient, actors.citizen7, testClient,
    'registerCandidate', [prov2ElectionId, keccak256(toHex('Isfahan-B'))]);
  await writeAs(contracts.election, publicClient, actors.pmCandidate2, testClient,
    'registerCandidate', [prov3ElectionId, keccak256(toHex('Fars-A'))]);

  // Warp past registration period
  const regPeriodKey = await contracts.constitution.read('PARAM_ELECTION_REG_PERIOD');
  const regPeriod = (await contracts.constitution.read('getParameter', [regPeriodKey])) as bigint;
  await warpForward(testClient, regPeriod);
  env.currentTime += regPeriod;

  await contracts.election.write('openVoting', [prov2ElectionId]);
  await contracts.election.write('openVoting', [prov3ElectionId]);

  // Cast ballots
  await castBallot(env, actors.citizen6, prov2ElectionId, 0n, 2);
  await castBallot(env, actors.citizen7, prov2ElectionId, 1n, 2);
  await castBallot(env, actors.pmCandidate, prov3ElectionId, 0n, 3);

  // Warp past voting period
  const votePeriodKey = await contracts.constitution.read('PARAM_ELECTION_VOTE_PERIOD');
  const votePeriod = (await contracts.constitution.read('getParameter', [votePeriodKey])) as bigint;
  await warpForward(testClient, votePeriod);
  env.currentTime += votePeriod;

  await contracts.election.write('tallyVotes', [prov2ElectionId]);
  await contracts.election.write('tallyVotes', [prov3ElectionId]);

  // Seat council winners
  for (const elId of [prov2ElectionId, prov3ElectionId]) {
    const seatData = contracts.election.encode('seatMembers', [elId]);
    await writeAs(contracts.crown, publicClient, actors.monarchAddr, testClient,
      'executeMinisterialAct', [addresses.election, seatData]);
  }

  // PHASE 2: Senate Selections (Province 2 + Province 3)
  for (const provId of [2, 3]) {
    const selData = contracts.pc.encode('startSenateSelection', [provId]);
    await writeAs(contracts.crown, publicClient, actors.monarchAddr, testClient,
      'executeMinisterialAct', [addresses.pc, selData]);
  }

  const selCount = (await contracts.pc.read('selectionCount')) as bigint;
  const sel3Id = selCount - 1n;
  const sel2Id = sel3Id - 1n;

  await writeAs(contracts.pc, publicClient, actors.citizen6, testClient,
    'registerSenateCandidate', [sel2Id]);
  await writeAs(contracts.pc, publicClient, actors.citizen7, testClient,
    'registerSenateCandidate', [sel2Id]);
  await writeAs(contracts.pc, publicClient, actors.pmCandidate2, testClient,
    'registerSenateCandidate', [sel3Id]);

  // Warp past senate selection registration period
  const selRegKey = await contracts.constitution.read('PARAM_SENATE_SELECTION_REG_PERIOD');
  const selRegPeriod = (await contracts.constitution.read('getParameter', [selRegKey])) as bigint;
  await warpForward(testClient, selRegPeriod);
  env.currentTime += selRegPeriod;

  // Council members vote
  await writeAs(contracts.pc, publicClient, actors.citizen6, testClient,
    'castSenateVote', [sel2Id, 1]);
  await writeAs(contracts.pc, publicClient, actors.citizen7, testClient,
    'castSenateVote', [sel2Id, 0]);
  await writeAs(contracts.pc, publicClient, actors.pmCandidate2, testClient,
    'castSenateVote', [sel3Id, 0]);

  // Warp past senate selection voting period
  const selVoteKey = await contracts.constitution.read('PARAM_SENATE_SELECTION_VOTE_PERIOD');
  const selVotePeriod = (await contracts.constitution.read('getParameter', [selVoteKey])) as bigint;
  await warpForward(testClient, selVotePeriod);
  env.currentTime += selVotePeriod;

  await contracts.pc.write('tallySenateSelection', [sel2Id]);
  await contracts.pc.write('tallySenateSelection', [sel3Id]);

  // Seat selected senators
  for (const selId of [sel2Id, sel3Id]) {
    const seatData = contracts.pc.encode('seatSelectedSenators', [selId]);
    await writeAs(contracts.crown, publicClient, actors.monarchAddr, testClient,
      'executeMinisterialAct', [addresses.pc, seatData]);
  }

  return { ...env, senators };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MixinJustices — appoints 7 justices (requires setupSenate first)
// ═══════════════════════════════════════════════════════════════════════════════

export interface JusticesEnv extends SenateEnv {
  justices: Address[];
}

export async function setupJustices(env: SenateEnv): Promise<JusticesEnv> {
  const { contracts, addresses, actors, testClient, publicClient } = env;

  const justices: Address[] = [];
  for (let i = 0; i < 7; i++) {
    justices.push(`0x${(2000 + i).toString(16).padStart(40, '0')}` as Address);
  }

  for (let i = 0; i < 7; i++) {
    await writeAs(contracts.crown, publicClient, actors.monarchAddr, testClient,
      'nominateJustice', [justices[i], i]);

    const confirmData = contracts.court.encode('confirmNominee', [i]);
    await executeSenateAction(env, addresses.court, confirmData);
  }

  return { ...env, justices };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MixinCaretaker — starts formation (requires setupMajlis first)
// ═══════════════════════════════════════════════════════════════════════════════

export async function setupCaretaker(env: GovTestEnv): Promise<void> {
  const { contracts, addresses } = env;
  const startData = contracts.executive.encode('startFormation', []);
  await executeMajlisAction(env, addresses.executive, startData);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MixinDeputy — PM designates citizen1 as Deputy PM (requires government)
// ═══════════════════════════════════════════════════════════════════════════════

export async function setupDeputy(env: GovTestEnv): Promise<void> {
  const { contracts, actors, testClient, publicClient } = env;
  await writeAs(contracts.executive, publicClient, actors.pmCandidate, testClient,
    'designateDeputyPM', [actors.citizen1]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MixinCrownSuspension — Crown suspended (requires setupJustices first)
// ═══════════════════════════════════════════════════════════════════════════════

export async function setupCrownSuspension(env: JusticesEnv): Promise<void> {
  const { contracts, actors } = env;

  const vacancyHash = keccak256(encodePacked(['string', 'address'], ['MONARCH_VACANCY', actors.monarchAddr]));
  await certifyFact(env, vacancyHash);

  await contracts.crown.write('claimSuccessionExhausted', []);
}

/** Certify a fact: all 7 justices vote yes, warp past FACT_CERT_PERIOD, finalize. */
export async function certifyFact(env: JusticesEnv, factHash: `0x${string}`): Promise<void> {
  const { contracts, testClient, publicClient } = env;

  for (const justice of env.justices) {
    await asAccount(testClient, justice, async () => {
      const jCourt = contractAs(contracts.court, publicClient, walletForAddress(justice));
      await jCourt.write('voteOnFact', [factHash, true], justice);
    });
  }

  const factCertKey = await contracts.constitution.read('PARAM_FACT_CERT_PERIOD');
  const factCertPeriod = (await contracts.constitution.read('getParameter', [factCertKey])) as bigint;
  await warpForward(testClient, factCertPeriod);
  env.currentTime += factCertPeriod;

  await contracts.court.write('finalizeFactCertification', [factHash]);
}
