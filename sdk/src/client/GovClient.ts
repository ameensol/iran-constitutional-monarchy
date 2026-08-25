/**
 * GovClient — deploys all 10 governance contracts and provides typed wrappers.
 *
 * Mirrors the deployment sequence from TestBase.sol:
 * 1. Deploy Constitution
 * 2. Deploy all other contracts (passing constitution address)
 * 3. Initialize Constitution with contract addresses
 * 4. Coronation
 */

import {
  type Address,
  type PublicClient,
  type WalletClient,
  type TestClient,
  encodeFunctionData,
  keccak256,
  toHex,
} from 'viem';
import {
  type Artifact,
  ConstitutionArtifact,
  CitizenRegistryArtifact,
  CrownArtifact,
  ParliamentArtifact,
  ExecutiveArtifact,
  SupremeCourtArtifact,
  ElectionArtifact,
  ReferendumArtifact,
  BudgetArtifact,
  ProvincialCouncilArtifact,
  MockBallotVerifierArtifact,
} from '../abi/index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Addresses of all deployed contracts */
export interface GovAddresses {
  constitution: Address;
  registry: Address;
  crown: Address;
  parliament: Address;
  executive: Address;
  court: Address;
  election: Address;
  referendum: Address;
  budget: Address;
  pc: Address;
  mockVerifier: Address;
}

/**
 * Thin typed wrapper around a deployed contract.
 * Provides read/write/encode helpers using the contract's ABI.
 */
export class Contract {
  constructor(
    public readonly address: Address,
    public readonly artifact: Artifact,
    private readonly publicClient: PublicClient,
    private readonly walletClient: WalletClient,
  ) {}

  /** Read a view/pure function */
  async read(functionName: string, args: unknown[] = []): Promise<unknown> {
    return this.publicClient.readContract({
      address: this.address,
      abi: this.artifact.abi as any,
      functionName,
      args,
    });
  }

  /** Write a state-changing function (from the wallet client's account) */
  async write(functionName: string, args: unknown[] = [], _account?: Address): Promise<`0x${string}`> {
    // Simulate first to catch reverts with proper error messages.
    // viem skips simulation for json-rpc accounts (impersonated addresses),
    // so we do it explicitly via eth_call.
    await this.publicClient.simulateContract({
      address: this.address,
      abi: this.artifact.abi as any,
      functionName,
      args,
      account: this.walletClient.account!.address as Address,
    });

    // Estimate with headroom instead of letting viem send the bare estimate.
    // Estimation runs against a different block than execution, so a function
    // whose cost depends on block-level values can be more expensive when mined.
    // Parliament.initializeSenateStagger picks a branch per senator from
    // block.prevrandao, which differs between the two, and without headroom the
    // inner call runs out of gas and the transaction reverts with empty data.
    const gas = await this.publicClient.estimateContractGas({
      address: this.address,
      abi: this.artifact.abi as any,
      functionName,
      args,
      account: this.walletClient.account!.address as Address,
    });

    const hash = await this.walletClient.writeContract({
      address: this.address,
      abi: this.artifact.abi as any,
      functionName,
      args,
      account: this.walletClient.account!,
      chain: this.walletClient.chain,
      gas: gas + gas / 4n,
    });

    // A transaction can simulate cleanly and still revert when mined. Without
    // this check the failure is silent: state never changes, no error is
    // raised, and the test fails later somewhere unrelated.
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') {
      throw new Error(
        `Transaction reverted when mined: ${functionName} on ${this.address} (tx ${hash})`,
      );
    }
    return hash;
  }

  /** Encode function calldata (for governance actions, ministerial acts) */
  encode(functionName: string, args: unknown[] = []): `0x${string}` {
    return encodeFunctionData({
      abi: this.artifact.abi as any,
      functionName,
      args,
    });
  }
}

/** All deployed governance contracts */
export interface GovContracts {
  constitution: Contract;
  registry: Contract;
  crown: Contract;
  parliament: Contract;
  executive: Contract;
  court: Contract;
  election: Contract;
  referendum: Contract;
  budget: Contract;
  pc: Contract;
  mockVerifier: Contract;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Deployment
// ═══════════════════════════════════════════════════════════════════════════════

async function deployContract(
  walletClient: WalletClient,
  publicClient: PublicClient,
  artifact: Artifact,
  args: unknown[] = [],
): Promise<Address> {
  const account = walletClient.account;
  if (!account) {
    throw new Error('WalletClient has no account configured');
  }
  const hash = await walletClient.deployContract({
    abi: artifact.abi as any,
    bytecode: artifact.bytecode,
    args,
    account: account.address,
    chain: walletClient.chain,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) {
    throw new Error(
      `Deployment failed (status: ${receipt.status}, gasUsed: ${receipt.gasUsed}). ` +
      `Contract bytecode may exceed EIP-170 size limit — start Anvil with --code-size-limit 100000`,
    );
  }
  return receipt.contractAddress;
}

/**
 * Deploy all governance contracts and initialize them.
 * Mirrors TestBase.sol setUp() exactly.
 *
 * @param publicClient - viem public client
 * @param walletClient - viem wallet client (deployer account)
 * @param authorityKey - Passport authority address (defaults to deployer)
 */
export async function deployGov(
  publicClient: PublicClient,
  walletClient: WalletClient,
  authorityKey?: Address,
): Promise<{ contracts: GovContracts; addresses: GovAddresses }> {
  const deployer = walletClient.account!.address;
  const authority = authorityKey ?? deployer;

  // 1. Deploy Constitution
  const constitutionAddr = await deployContract(walletClient, publicClient, ConstitutionArtifact);

  // 2. Deploy all other contracts
  const registryAddr = await deployContract(walletClient, publicClient, CitizenRegistryArtifact, [authority]);
  const crownAddr = await deployContract(walletClient, publicClient, CrownArtifact, [constitutionAddr]);
  const parliamentAddr = await deployContract(walletClient, publicClient, ParliamentArtifact, [constitutionAddr]);
  const executiveAddr = await deployContract(walletClient, publicClient, ExecutiveArtifact, [constitutionAddr]);
  const courtAddr = await deployContract(walletClient, publicClient, SupremeCourtArtifact, [constitutionAddr]);
  const electionAddr = await deployContract(walletClient, publicClient, ElectionArtifact, [constitutionAddr]);
  const referendumAddr = await deployContract(walletClient, publicClient, ReferendumArtifact, [constitutionAddr]);
  const budgetAddr = await deployContract(walletClient, publicClient, BudgetArtifact, [constitutionAddr]);
  const pcAddr = await deployContract(walletClient, publicClient, ProvincialCouncilArtifact, [constitutionAddr]);
  const mockVerifierAddr = await deployContract(walletClient, publicClient, MockBallotVerifierArtifact);

  // 3. Build Contract instances
  const mk = (addr: Address, art: Artifact) => new Contract(addr, art, publicClient, walletClient);

  const contracts: GovContracts = {
    constitution: mk(constitutionAddr, ConstitutionArtifact),
    registry: mk(registryAddr, CitizenRegistryArtifact),
    crown: mk(crownAddr, CrownArtifact),
    parliament: mk(parliamentAddr, ParliamentArtifact),
    executive: mk(executiveAddr, ExecutiveArtifact),
    court: mk(courtAddr, SupremeCourtArtifact),
    election: mk(electionAddr, ElectionArtifact),
    referendum: mk(referendumAddr, ReferendumArtifact),
    budget: mk(budgetAddr, BudgetArtifact),
    pc: mk(pcAddr, ProvincialCouncilArtifact),
    mockVerifier: mk(mockVerifierAddr, MockBallotVerifierArtifact),
  };

  // 4. Read contract name keys from Constitution
  const contractKeys = await Promise.all([
    contracts.constitution.read('CONTRACT_CITIZEN_REGISTRY'),
    contracts.constitution.read('CONTRACT_CROWN'),
    contracts.constitution.read('CONTRACT_PARLIAMENT'),
    contracts.constitution.read('CONTRACT_EXECUTIVE'),
    contracts.constitution.read('CONTRACT_SUPREME_COURT'),
    contracts.constitution.read('CONTRACT_ELECTION'),
    contracts.constitution.read('CONTRACT_REFERENDUM'),
    contracts.constitution.read('CONTRACT_BUDGET'),
    contracts.constitution.read('CONTRACT_PROVINCIAL_COUNCIL'),
    contracts.constitution.read('CONTRACT_BALLOT_VERIFIER'),
  ]) as `0x${string}`[];

  const contractAddrs: Address[] = [
    registryAddr, crownAddr, parliamentAddr, executiveAddr,
    courtAddr, electionAddr, referendumAddr, budgetAddr,
    pcAddr, mockVerifierAddr,
  ];

  // 5. Initialize Constitution
  await contracts.constitution.write('initialize', [contractKeys, contractAddrs], deployer);

  const addresses: GovAddresses = {
    constitution: constitutionAddr,
    registry: registryAddr,
    crown: crownAddr,
    parliament: parliamentAddr,
    executive: executiveAddr,
    court: courtAddr,
    election: electionAddr,
    referendum: referendumAddr,
    budget: budgetAddr,
    pc: pcAddr,
    mockVerifier: mockVerifierAddr,
  };

  return { contracts, addresses };
}
