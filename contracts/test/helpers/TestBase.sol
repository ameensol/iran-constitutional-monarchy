// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/Constitution.sol";
import "../../src/CitizenRegistry.sol";
import "../../src/Crown.sol";
import "../../src/Parliament.sol";
import "../../src/Executive.sol";
import "../../src/SupremeCourt.sol";
import "../../src/Election.sol";
import "../../src/Referendum.sol";
import "../../src/Budget.sol";
import "../../src/ProvincialCouncil.sol";
import "../../src/verifiers/MockBallotVerifier.sol";
import "./ProofHelper.sol";

/// @title TestBase (Level 0)
/// @notice Deploys all 11 contracts, coronation, citizens, provinces, CSCA key.
///         All higher-level test bases inherit from this.
abstract contract GovTestBase is Test, ProofHelper {
    // ─── Contracts ──────────────────────────────────────────────────────

    Constitution internal constitution;
    CitizenRegistry internal registry;
    Crown internal crown;
    Parliament internal parliament;
    Executive internal executive;
    SupremeCourt internal court;
    Election internal election;
    Referendum internal referendum;
    Budget internal budgetContract;
    ProvincialCouncil internal pc;
    MockBallotVerifier internal mockVerifier;

    // ─── Cached keys ────────────────────────────────────────────────────

    bytes32 internal ROLE_MONARCH;
    bytes32 internal ROLE_PM;
    bytes32 internal ROLE_AUDIT_HEAD;

    // ─── Actors ─────────────────────────────────────────────────────────

    address internal deployer = makeAddr("deployer");
    address internal authorityKey = makeAddr("authorityKey");
    address internal monarchAddr = makeAddr("monarch");
    address internal auditHead = makeAddr("auditHead");

    address internal citizen1 = makeAddr("citizen1");
    address internal citizen2 = makeAddr("citizen2");
    address internal citizen3 = makeAddr("citizen3");
    address internal citizen4 = makeAddr("citizen4");
    address internal citizen5 = makeAddr("citizen5");
    address internal citizen6 = makeAddr("citizen6");
    address internal citizen7 = makeAddr("citizen7");

    address internal pmCandidate = makeAddr("pmCandidate");
    address internal pmCandidate2 = makeAddr("pmCandidate2");

    // ─── Timing ─────────────────────────────────────────────────────────

    uint256 internal currentTime;

    function setUp() public virtual {
        // Deploy all contracts
        vm.prank(deployer);
        constitution = new Constitution();

        ROLE_MONARCH = constitution.ROLE_MONARCH();
        ROLE_PM = constitution.ROLE_PRIME_MINISTER();
        ROLE_AUDIT_HEAD = constitution.ROLE_AUDIT_HEAD();

        registry = new CitizenRegistry(authorityKey);
        crown = new Crown(address(constitution));
        parliament = new Parliament(address(constitution));
        executive = new Executive(address(constitution));
        court = new SupremeCourt(address(constitution));
        election = new Election(address(constitution));
        referendum = new Referendum(address(constitution));
        budgetContract = new Budget(address(constitution));
        pc = new ProvincialCouncil(address(constitution));
        mockVerifier = new MockBallotVerifier();

        // Initialize Constitution with all contract addresses
        bytes32[] memory names = new bytes32[](10);
        address[] memory addrs = new address[](10);
        names[0] = constitution.CONTRACT_CITIZEN_REGISTRY();
        addrs[0] = address(registry);
        names[1] = constitution.CONTRACT_CROWN();
        addrs[1] = address(crown);
        names[2] = constitution.CONTRACT_PARLIAMENT();
        addrs[2] = address(parliament);
        names[3] = constitution.CONTRACT_EXECUTIVE();
        addrs[3] = address(executive);
        names[4] = constitution.CONTRACT_SUPREME_COURT();
        addrs[4] = address(court);
        names[5] = constitution.CONTRACT_ELECTION();
        addrs[5] = address(election);
        names[6] = constitution.CONTRACT_REFERENDUM();
        addrs[6] = address(referendum);
        names[7] = constitution.CONTRACT_BUDGET();
        addrs[7] = address(budgetContract);
        names[8] = constitution.CONTRACT_PROVINCIAL_COUNCIL();
        addrs[8] = address(pc);
        names[9] = constitution.CONTRACT_BALLOT_VERIFIER();
        addrs[9] = address(mockVerifier);

        vm.prank(deployer);
        constitution.initialize(names, addrs);

        // Coronation
        vm.prank(deployer);
        crown.coronation(monarchAddr);

        // Set trusted CSCA key
        vm.prank(authorityKey);
        registry.setCscaKey(0, 0, MOCK_CSCA_KEY_HASH);

        // Warp to 2026-02-17 00:00 UTC
        currentTime = 1771286400;
        vm.warp(currentTime);

        // Register 9 citizens (all initially province 1)
        address[9] memory allCitizens = [
            citizen1, citizen2, citizen3, citizen4, citizen5,
            citizen6, citizen7, pmCandidate, pmCandidate2
        ];
        for (uint256 i = 0; i < allCitizens.length; i++) {
            vm.prank(authorityKey);
            registry.registerCitizen(allCitizens[i], keccak256(abi.encodePacked(allCitizens[i])), 1);
        }

        // Province initialization + assignments + audit head
        _postDeploy();
    }

    /// @dev Override to skip province initialization (e.g., for tests that test init itself).
    function _postDeploy() internal virtual {
        // Initialize 3 provinces
        ProvincialCouncil.ProvinceInit[] memory inits = new ProvincialCouncil.ProvinceInit[](3);
        inits[0] = ProvincialCouncil.ProvinceInit(1, bytes32("TEHRAN"),  5, 3, 200, 0);
        inits[1] = ProvincialCouncil.ProvinceInit(2, bytes32("ISFAHAN"), 5, 2, 60,  1);
        inits[2] = ProvincialCouncil.ProvinceInit(3, bytes32("FARS"),    5, 2, 30,  2);

        vm.prank(monarchAddr);
        crown.initializeProvincialCouncils(inits);

        // Assign provinces: citizen1-5→prov1, citizen6-7→prov2, pmCandidate+pmCandidate2→prov3
        vm.startPrank(authorityKey);
        registry.assignProvince(citizen6, 2);
        registry.assignProvince(citizen7, 2);
        registry.assignProvince(pmCandidate, 3);
        registry.assignProvince(pmCandidate2, 3);
        vm.stopPrank();

        // Appoint audit head (Art. IX.4)
        vm.prank(address(parliament));
        budgetContract.appointAuditHead(auditHead);
    }

    // ─── Time helpers ───────────────────────────────────────────────────

    function _warpForward(uint256 duration) internal {
        currentTime += duration;
        vm.warp(currentTime);
    }

    // ─── ZK proof helpers ───────────────────────────────────────────────

    function _castBallot(address voter, uint256 electionId, uint256 candidateIndex) internal {
        (Election.ProofPoints memory proof, uint256[23] memory signals) =
            _mockBallotProof(_identityHash(voter), electionId, candidateIndex, 1);
        election.castBallot(electionId, candidateIndex, proof, signals);
    }

    function _castBallotWithProvince(
        address voter, uint256 electionId, uint256 candidateIndex, uint8 province
    ) internal {
        (Election.ProofPoints memory proof, uint256[23] memory signals) =
            _mockBallotProof(_identityHash(voter), electionId, candidateIndex, province);
        election.castBallot(electionId, candidateIndex, proof, signals);
    }

    function _castReferendumVote(address voter, uint256 amendmentId, bool support) internal {
        (Referendum.ProofPoints memory proof, uint256[23] memory signals) =
            _mockReferendumProof(_identityHash(voter), amendmentId);
        referendum.castReferendumVote(amendmentId, support, proof, signals);
    }
}
