// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Constitution.sol";
import "../src/CitizenRegistry.sol";
import "../src/Crown.sol";
import "../src/Parliament.sol";
import "../src/Executive.sol";
import "../src/SupremeCourt.sol";
import "../src/Election.sol";
import "../src/Referendum.sol";
import "../src/Budget.sol";
import "../src/ProvincialCouncil.sol";
import "../src/verifiers/MockBallotVerifier.sol";
import "./helpers/ProofHelper.sol";

/// @title IntegrationTest
/// @notice End-to-end governance lifecycle tests exercising the full contract system.
///
/// Scenarios:
///   1. Bootstrap → Election → PM Formation
///   2. Full Legislative Cycle
///   3. No-Confidence → New PM
///   4. Constitutional Amendment via Referendum
///   5. Budget Cycle
///   6. Crown Rejection → Override
///   7. Judicial Appointment + Constitutional Review
///   8. Dissolution Cascade
contract IntegrationTest is Test, ProofHelper {
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
    bytes32 internal PARAM_MAJLIS_TERM;

    // ─── Actors ─────────────────────────────────────────────────────────

    address internal deployer = makeAddr("deployer");
    address internal authorityKey = makeAddr("authorityKey");
    address internal monarchAddr = makeAddr("monarch");
    address internal auditHead = makeAddr("auditHead");

    // Citizens (also candidates and Majlis members)
    address internal citizen1 = makeAddr("citizen1");
    address internal citizen2 = makeAddr("citizen2");
    address internal citizen3 = makeAddr("citizen3");
    address internal citizen4 = makeAddr("citizen4");
    address internal citizen5 = makeAddr("citizen5");
    address internal citizen6 = makeAddr("citizen6");
    address internal citizen7 = makeAddr("citizen7");

    address internal pmCandidate = makeAddr("pmCandidate");
    address internal pmCandidate2 = makeAddr("pmCandidate2");

    // Dedicated senators for tests that don't otherwise seat senators
    address internal integSenator1 = makeAddr("integSenator1");
    address internal integSenator2 = makeAddr("integSenator2");
    address internal integSenator3 = makeAddr("integSenator3");

    function setUp() public {
        // Deploy all contracts
        vm.prank(deployer);
        constitution = new Constitution();

        ROLE_MONARCH = constitution.ROLE_MONARCH();
        ROLE_PM = constitution.ROLE_PRIME_MINISTER();
        ROLE_AUDIT_HEAD = constitution.ROLE_AUDIT_HEAD();
        PARAM_MAJLIS_TERM = constitution.PARAM_MAJLIS_TERM();

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

        // Set trusted CSCA key (mock hash must match ProofHelper.MOCK_CSCA_KEY_HASH)
        vm.prank(authorityKey);
        registry.setCscaKey(0, 0, MOCK_CSCA_KEY_HASH);

        // Warp to 2026-02-17 00:00 UTC so MOCK_CURRENT_DATE (20260217) passes freshness check
        vm.warp(1771286400);

        // Register citizens
        address[7] memory citizens = [citizen1, citizen2, citizen3, citizen4, citizen5, citizen6, citizen7];
        for (uint256 i = 0; i < citizens.length; i++) {
            vm.prank(authorityKey);
            registry.registerCitizen(citizens[i], keccak256(abi.encodePacked(citizens[i])), 1);
        }
        vm.prank(authorityKey);
        registry.registerCitizen(pmCandidate, keccak256(abi.encodePacked(pmCandidate)), 1);
        vm.prank(authorityKey);
        registry.registerCitizen(pmCandidate2, keccak256(abi.encodePacked(pmCandidate2)), 1);

        // Register dedicated senators
        vm.prank(authorityKey);
        registry.registerCitizen(integSenator1, keccak256(abi.encodePacked(integSenator1)), 1);
        vm.prank(authorityKey);
        registry.registerCitizen(integSenator2, keccak256(abi.encodePacked(integSenator2)), 1);
        vm.prank(authorityKey);
        registry.registerCitizen(integSenator3, keccak256(abi.encodePacked(integSenator3)), 1);

        // Coronation (auto-finalizes deployer)
        vm.prank(deployer);
        crown.coronation(monarchAddr);

        // Appoint audit head (Art. IX.4: Parliament appoints via Budget.sol)
        vm.prank(address(parliament));
        budgetContract.appointAuditHead(auditHead);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ZK PROOF HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    /// @dev Cast a ballot using mock ZK proof.
    function _castBallot(address voter, uint256 electionId, uint256 candidateIndex) internal {
        (Election.ProofPoints memory proof, uint256[23] memory signals) =
            _mockBallotProof(_identityHash(voter), electionId, candidateIndex, 1);
        election.castBallot(electionId, candidateIndex, proof, signals);
    }

    /// @dev Cast a ballot with explicit province.
    function _castBallotWithProvince(address voter, uint256 electionId, uint256 candidateIndex, uint8 province) internal {
        (Election.ProofPoints memory proof, uint256[23] memory signals) =
            _mockBallotProof(_identityHash(voter), electionId, candidateIndex, province);
        election.castBallot(electionId, candidateIndex, proof, signals);
    }

    /// @dev Cast a referendum vote using mock ZK proof.
    function _castReferendumVote(address voter, uint256 amendmentId, bool support) internal {
        (Referendum.ProofPoints memory proof, uint256[23] memory signals) =
            _mockReferendumProof(_identityHash(voter), amendmentId);
        referendum.castReferendumVote(amendmentId, support, proof, signals);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    /// @dev Seat 3 dedicated senators for tests that need Senate governance actions.
    function _seatTestSenators() internal {
        vm.prank(address(election));
        parliament.seatMember(integSenator1, Parliament.Chamber.Senate);
        vm.prank(address(election));
        parliament.seatMember(integSenator2, Parliament.Chamber.Senate);
        vm.prank(address(election));
        parliament.seatMember(integSenator3, Parliament.Chamber.Senate);
    }

    /// @dev Confirm a justice nominee via Senate governance action using dedicated senators.
    function _confirmNomineeBySenate(uint256 seatIndex) internal {
        _confirmNomineeBySenateWith(seatIndex, integSenator1, integSenator2, integSenator3);
    }

    /// @dev Confirm a justice nominee via Senate governance action using specified senators.
    function _confirmNomineeBySenateWith(uint256 seatIndex, address s1, address s2, address s3) internal {
        bytes memory callData = abi.encodeCall(SupremeCourt.confirmNominee, (seatIndex));
        vm.prank(s1);
        uint256 actionId = parliament.proposeGovernanceAction(
            address(court), callData, Parliament.Chamber.Senate, 50, keccak256("confirm justice")
        );
        vm.prank(s1);
        parliament.voteOnGovernanceAction(actionId, true);
        vm.prank(s2);
        parliament.voteOnGovernanceAction(actionId, true);
        vm.prank(s3);
        parliament.voteOnGovernanceAction(actionId, true);
        skip(3 days);
        parliament.finalizeGovernanceAction(actionId);
        parliament.executeGovernanceAction(actionId);
    }

    function _runElectionAndSeatMajlis() internal {
        // Initialize provinces if not yet done (seatMembers needs _lookupSeatCount)
        if (!pc.provincesInitialized()) {
            ProvincialCouncil.ProvinceInit[] memory inits = new ProvincialCouncil.ProvinceInit[](3);
            inits[0] = ProvincialCouncil.ProvinceInit(1, bytes32("TEHRAN"),  5, 3, 200, 0);
            inits[1] = ProvincialCouncil.ProvinceInit(2, bytes32("ISFAHAN"), 5, 2, 60,  1);
            inits[2] = ProvincialCouncil.ProvinceInit(3, bytes32("FARS"),    5, 2, 30,  2);
            vm.prank(monarchAddr);
            crown.initializeProvincialCouncils(inits);
        }

        // Start province-scoped Majlis election (province 1 — all test citizens are province 1)
        vm.prank(address(parliament));
        uint256 electionId = election.startMajlisElection(1);

        // Register 5 candidates
        address[5] memory candidates = [citizen1, citizen2, citizen3, citizen4, citizen5];
        for (uint256 i = 0; i < candidates.length; i++) {
            vm.prank(candidates[i]);
            election.registerCandidate(electionId, keccak256(abi.encodePacked("Party", i)));
        }

        // Advance to voting
        uint256 regPeriod = constitution.getParameter(constitution.PARAM_ELECTION_REG_PERIOD());
        vm.warp(block.timestamp + regPeriod);
        election.openVoting(electionId);

        // All 7 citizens vote (some for same candidates)
        _castBallot(citizen1, electionId, 0);
        _castBallot(citizen2, electionId, 1);
        _castBallot(citizen3, electionId, 2);
        _castBallot(citizen4, electionId, 3);
        _castBallot(citizen5, electionId, 4);
        _castBallot(citizen6, electionId, 0);
        _castBallot(citizen7, electionId, 1);

        // Advance past voting end
        uint256 votePeriod = constitution.getParameter(constitution.PARAM_ELECTION_VOTE_PERIOD());
        vm.warp(block.timestamp + votePeriod);

        // Tally
        election.tallyVotes(electionId);

        // Seat winners (determined by vote tally, onlyCrown)
        vm.prank(address(crown));
        election.seatMembers(electionId);
    }

    function _formGovernment(address pm) internal {
        // Parliament starts formation (Executive.startFormation requires onlyParliament)
        vm.prank(address(parliament));
        executive.startFormation();

        // Crown nominates PM
        vm.prank(address(crown));
        executive.nominatePM(pm);

        // Nominee presents government program
        vm.prank(pm);
        executive.presentGovernment(keccak256("government program"));

        // 3 of 5 Majlis members vote confidence
        vm.prank(citizen1); executive.voteConfidence(true);
        vm.prank(citizen2); executive.voteConfidence(true);
        vm.prank(citizen3); executive.voteConfidence(true);

        skip(3 days); // MIN_VOTING_PERIOD
        executive.finalizeConfidenceVote();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 1. BOOTSTRAP → ELECTION → PM FORMATION
    // ═══════════════════════════════════════════════════════════════════════

    function test_integration_bootstrapToGovernment() public {
        // Step 1: Run election and seat Majlis
        _runElectionAndSeatMajlis();
        assertEq(parliament.majlisMemberCount(), 5);

        // Step 2: Crown nominates PM, Majlis grants confidence
        _formGovernment(pmCandidate);

        // Verify: PM is set, not in caretaker mode
        assertEq(constitution.getRole(ROLE_PM), pmCandidate);
        assertFalse(executive.caretaker());
        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.Idle));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2. FULL LEGISLATIVE CYCLE
    // ═══════════════════════════════════════════════════════════════════════

    function test_integration_legislativeCycle() public {
        _runElectionAndSeatMajlis();
        _formGovernment(pmCandidate);

        // Seat 3 senators
        vm.prank(address(election));
        parliament.seatMember(citizen6, Parliament.Chamber.Senate);
        vm.prank(address(election));
        parliament.seatMember(citizen7, Parliament.Chamber.Senate);
        vm.prank(address(election));
        parliament.seatMember(pmCandidate2, Parliament.Chamber.Senate);

        // Step 1: Majlis member submits bill
        vm.prank(citizen1);
        uint256 billId = parliament.submitBill(keccak256("Education Reform Act"), "Expand public education");

        // Step 2: Majlis votes (3 yes out of 5 = majority)
        vm.prank(citizen1); parliament.voteMajlis(billId, true);
        vm.prank(citizen2); parliament.voteMajlis(billId, true);
        vm.prank(citizen3); parliament.voteMajlis(billId, true);
        vm.prank(citizen4); parliament.voteMajlis(billId, false);
        vm.prank(citizen5); parliament.voteMajlis(billId, false);
        skip(3 days);
        parliament.finalizeMajlisVote(billId);

        // Step 3: Senate approves
        vm.prank(citizen6); parliament.voteSenate(billId, true);
        vm.prank(citizen7); parliament.voteSenate(billId, true);
        vm.prank(pmCandidate2); parliament.voteSenate(billId, true);
        skip(3 days);
        parliament.finalizeSenateVote(billId);

        // Step 4: Crown enacts (calls Parliament.markEnacted internally)
        vm.prank(monarchAddr);
        crown.enactLaw(billId);

        // Verify: bill is enacted
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.Enacted));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 3. NO-CONFIDENCE → NEW PM
    // ═══════════════════════════════════════════════════════════════════════

    function test_integration_noConfidenceNewPM() public {
        _runElectionAndSeatMajlis();
        _formGovernment(pmCandidate);

        // Warp past honeymoon (90 days)
        vm.warp(block.timestamp + 91 days);

        // File no-confidence
        vm.prank(citizen1);
        executive.fileNoConfidence();

        // Simple majority (3 of 5)
        vm.prank(citizen1); executive.voteNoConfidence(true);
        vm.prank(citizen2); executive.voteNoConfidence(true);
        vm.prank(citizen3); executive.voteNoConfidence(true);
        executive.finalizeNoConfidence();

        // PM removed, caretaker mode
        assertEq(constitution.getRole(ROLE_PM), address(0));
        assertTrue(executive.caretaker());

        // New PM formation
        vm.prank(address(crown));
        executive.nominatePM(pmCandidate2);

        vm.prank(pmCandidate2);
        executive.presentGovernment(keccak256("new government program"));

        vm.prank(citizen1); executive.voteConfidence(true);
        vm.prank(citizen2); executive.voteConfidence(true);
        vm.prank(citizen3); executive.voteConfidence(true);
        skip(3 days); // MIN_VOTING_PERIOD
        executive.finalizeConfidenceVote();

        // New PM in place
        assertEq(constitution.getRole(ROLE_PM), pmCandidate2);
        assertFalse(executive.caretaker());
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. CONSTITUTIONAL AMENDMENT VIA REFERENDUM
    // ═══════════════════════════════════════════════════════════════════════

    function test_integration_constitutionalAmendment() public {
        // Get original Majlis term
        uint256 originalTerm = constitution.getParameter(PARAM_MAJLIS_TERM);
        assertEq(originalTerm, 4 * 365 days);

        // Step 1: Parliament proposes amendment (2/3 adoption assumed off-chain)
        vm.prank(address(parliament));
        uint256 amendId = referendum.proposeAmendment(
            keccak256("Extend Majlis term to 5 years"),
            PARAM_MAJLIS_TERM,
            5 * 365 days
        );

        // Step 2: Start referendum
        vm.prank(address(parliament));
        referendum.startReferendum(amendId, 14 days);

        // Step 3: Citizens vote (4 yes, 3 no)
        _castReferendumVote(citizen1, amendId, true);
        _castReferendumVote(citizen2, amendId, true);
        _castReferendumVote(citizen3, amendId, true);
        _castReferendumVote(citizen4, amendId, true);
        _castReferendumVote(citizen5, amendId, false);
        _castReferendumVote(citizen6, amendId, false);
        _castReferendumVote(citizen7, amendId, false);

        // Step 4: Finalize after voting period
        vm.warp(block.timestamp + 14 days);
        referendum.finalizeReferendum(amendId);

        // Step 5: Enact the amendment
        referendum.enactAmendment(amendId);

        // Verify: Constitution parameter updated
        assertEq(constitution.getParameter(PARAM_MAJLIS_TERM), 5 * 365 days);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 5. BUDGET CYCLE
    // ═══════════════════════════════════════════════════════════════════════

    function test_integration_budgetCycle() public {
        _runElectionAndSeatMajlis();
        _formGovernment(pmCandidate);

        // Step 1: PM proposes budget
        vm.prank(address(executive));
        uint256 budgetId = budgetContract.proposeBudget(
            keccak256("FY2025 Budget"),
            2025,
            10_000_000 ether
        );

        // Step 2: Parliament approves
        vm.prank(address(parliament));
        budgetContract.approveBudget(budgetId);

        // Step 3: Activate (Budget.activateBudget requires onlyExecutive)
        vm.prank(address(executive));
        budgetContract.activateBudget(budgetId);

        // Step 4: Executive allocates funds
        vm.prank(address(executive));
        budgetContract.allocateFunds(budgetId, keccak256("Education"), 2_000_000 ether);
        vm.prank(address(executive));
        budgetContract.allocateFunds(budgetId, keccak256("Defense"), 3_000_000 ether);
        vm.prank(address(executive));
        budgetContract.allocateFunds(budgetId, keccak256("Health"), 1_000_000 ether);

        assertEq(budgetContract.getRemainingBudget(budgetId), 4_000_000 ether);

        // Step 5: Audit Office submits report
        vm.prank(auditHead);
        budgetContract.submitAuditReport(2025, keccak256("FY2025 audit - compliant"));

        assertTrue(budgetContract.hasAuditReport(2025));

        // Step 6: No new budget for 2026 → continue prior year (Budget.continuePriorBudget requires onlyParliament)
        vm.prank(address(parliament));
        uint256 newBudgetId = budgetContract.continuePriorBudget(2025, 2026);

        assertTrue(budgetContract.hasActiveBudget(2026));
        assertEq(budgetContract.getRemainingBudget(newBudgetId), 10_000_000 ether);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 6. CROWN REJECTION → MAJLIS OVERRIDE
    // ═══════════════════════════════════════════════════════════════════════

    function test_integration_crownReturnAndOverride() public {
        _runElectionAndSeatMajlis();
        _formGovernment(pmCandidate);

        // Seat senators
        vm.prank(address(election));
        parliament.seatMember(citizen6, Parliament.Chamber.Senate);
        vm.prank(address(election));
        parliament.seatMember(citizen7, Parliament.Chamber.Senate);
        vm.prank(address(election));
        parliament.seatMember(pmCandidate2, Parliament.Chamber.Senate);

        // Submit and pass bill through Majlis and Senate
        vm.prank(citizen1);
        uint256 billId = parliament.submitBill(keccak256("Controversial Law"), "Controversial legislation");

        vm.prank(citizen1); parliament.voteMajlis(billId, true);
        vm.prank(citizen2); parliament.voteMajlis(billId, true);
        vm.prank(citizen3); parliament.voteMajlis(billId, true);
        skip(3 days);
        parliament.finalizeMajlisVote(billId);

        vm.prank(citizen6); parliament.voteSenate(billId, true);
        vm.prank(citizen7); parliament.voteSenate(billId, true);
        skip(3 days);
        parliament.finalizeSenateVote(billId);

        // Crown returns the bill (calls Parliament.markReturned internally)
        vm.prank(monarchAddr);
        crown.returnLaw(billId);

        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.Returned));

        // Majlis re-adopts with simple majority (voteMajlis works on Returned bills)
        vm.prank(citizen1); parliament.voteMajlis(billId, true);
        vm.prank(citizen2); parliament.voteMajlis(billId, true);
        vm.prank(citizen3); parliament.voteMajlis(billId, true);
        skip(3 days);
        parliament.finalizeMajlisVote(billId);

        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.CrownAction));

        // Crown must now enact (calls Parliament.markEnacted internally)
        vm.prank(monarchAddr);
        crown.enactLaw(billId);

        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.Enacted));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 7. JUDICIAL APPOINTMENT + CONSTITUTIONAL REVIEW
    // ═══════════════════════════════════════════════════════════════════════

    function test_integration_judicialAppointmentAndReview() public {
        _runElectionAndSeatMajlis();
        _formGovernment(pmCandidate);
        _seatTestSenators();

        // Appoint 7 justices via real Crown + Senate governance
        address[7] memory justices;
        for (uint256 i = 0; i < 7; i++) {
            justices[i] = address(uint160(2000 + i));
            vm.prank(monarchAddr);
            crown.nominateJustice(justices[i], i);
            _confirmNomineeBySenate(i);
        }

        assertEq(court.activeJusticeCount(), 7);

        // PM files a constitutional review
        vm.prank(pmCandidate);
        uint256 reviewId = court.fileConstitutionalReview(42, keccak256("petition for review"));

        // 5 justices find it constitutional, 2 find it unconstitutional
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(justices[i]);
            court.voteOnReview(reviewId, true);
        }
        for (uint256 i = 5; i < 7; i++) {
            vm.prank(justices[i]);
            court.voteOnReview(reviewId, false);
        }

        court.finalizeReview(reviewId);

        assertEq(uint256(court.getReviewStatus(reviewId)), uint256(SupremeCourt.ReviewStatus.Constitutional));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 7b. COURT REVIEW → BILL STATUS UPDATE (Referred → Enacted/Vetoed)
    // ═══════════════════════════════════════════════════════════════════════

    function test_integration_courtReviewEnactsBill() public {
        _runElectionAndSeatMajlis();
        _formGovernment(pmCandidate);

        // Seat senators
        vm.prank(address(election));
        parliament.seatMember(citizen6, Parliament.Chamber.Senate);
        vm.prank(address(election));
        parliament.seatMember(citizen7, Parliament.Chamber.Senate);
        vm.prank(address(election));
        parliament.seatMember(pmCandidate2, Parliament.Chamber.Senate);

        // Pass bill through Majlis
        vm.prank(citizen1);
        uint256 billId = parliament.submitBill(keccak256("Controversial Law"), "Needs Court review");
        vm.prank(citizen1); parliament.voteMajlis(billId, true);
        vm.prank(citizen2); parliament.voteMajlis(billId, true);
        vm.prank(citizen3); parliament.voteMajlis(billId, true);
        skip(3 days);
        parliament.finalizeMajlisVote(billId);

        // Pass through Senate
        vm.prank(citizen6); parliament.voteSenate(billId, true);
        vm.prank(citizen7); parliament.voteSenate(billId, true);
        skip(3 days);
        parliament.finalizeSenateVote(billId);

        // Crown returns bill (Art. II.5.3 — referral requires prior return)
        vm.prank(monarchAddr);
        crown.returnLaw(billId);

        // Majlis re-adopts
        vm.prank(citizen1); parliament.voteMajlis(billId, true);
        vm.prank(citizen2); parliament.voteMajlis(billId, true);
        vm.prank(citizen3); parliament.voteMajlis(billId, true);
        skip(3 days);
        parliament.finalizeMajlisVote(billId);

        // Crown refers re-adopted bill to Court
        vm.prank(monarchAddr);
        crown.referToSupremeCourt(billId);
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.Referred));

        // Appoint 7 justices via real Crown + Senate governance
        address[7] memory justices;
        for (uint256 i = 0; i < 7; i++) {
            justices[i] = address(uint160(3000 + i));
            vm.prank(monarchAddr);
            crown.nominateJustice(justices[i], i);
            _confirmNomineeBySenateWith(i, citizen6, citizen7, pmCandidate2);
        }

        // File review for this bill
        vm.prank(pmCandidate);
        uint256 reviewId = court.fileConstitutionalReview(billId, keccak256("review petition"));

        // 5 justices find it constitutional
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(justices[i]);
            court.voteOnReview(reviewId, true);
        }
        for (uint256 i = 5; i < 7; i++) {
            vm.prank(justices[i]);
            court.voteOnReview(reviewId, false);
        }
        court.finalizeReview(reviewId);

        // Execute review outcome → bill goes from Referred to Enacted
        court.executeReviewOutcome(reviewId);
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.Enacted));
    }

    function test_integration_courtReviewVetoesBill() public {
        _runElectionAndSeatMajlis();
        _formGovernment(pmCandidate);

        // Seat senators
        vm.prank(address(election));
        parliament.seatMember(citizen6, Parliament.Chamber.Senate);
        vm.prank(address(election));
        parliament.seatMember(citizen7, Parliament.Chamber.Senate);
        vm.prank(address(election));
        parliament.seatMember(pmCandidate2, Parliament.Chamber.Senate);

        // Pass bill through both chambers
        vm.prank(citizen1);
        uint256 billId = parliament.submitBill(keccak256("Bad Law"), "Unconstitutional law");
        vm.prank(citizen1); parliament.voteMajlis(billId, true);
        vm.prank(citizen2); parliament.voteMajlis(billId, true);
        vm.prank(citizen3); parliament.voteMajlis(billId, true);
        skip(3 days);
        parliament.finalizeMajlisVote(billId);

        vm.prank(citizen6); parliament.voteSenate(billId, true);
        vm.prank(citizen7); parliament.voteSenate(billId, true);
        skip(3 days);
        parliament.finalizeSenateVote(billId);

        // Crown returns bill (Art. II.5.3 — referral requires prior return)
        vm.prank(monarchAddr);
        crown.returnLaw(billId);

        // Majlis re-adopts
        vm.prank(citizen1); parliament.voteMajlis(billId, true);
        vm.prank(citizen2); parliament.voteMajlis(billId, true);
        vm.prank(citizen3); parliament.voteMajlis(billId, true);
        skip(3 days);
        parliament.finalizeMajlisVote(billId);

        // Crown refers re-adopted bill to Court
        vm.prank(monarchAddr);
        crown.referToSupremeCourt(billId);

        // Appoint 7 justices via real Crown + Senate governance
        address[7] memory justices;
        for (uint256 i = 0; i < 7; i++) {
            justices[i] = address(uint160(4000 + i));
            vm.prank(monarchAddr);
            crown.nominateJustice(justices[i], i);
            _confirmNomineeBySenateWith(i, citizen6, citizen7, pmCandidate2);
        }

        // File review
        vm.prank(pmCandidate);
        uint256 reviewId = court.fileConstitutionalReview(billId, keccak256("review petition"));

        // 3 constitutional, 4 unconstitutional → vetoed
        for (uint256 i = 0; i < 3; i++) {
            vm.prank(justices[i]);
            court.voteOnReview(reviewId, true);
        }
        for (uint256 i = 3; i < 7; i++) {
            vm.prank(justices[i]);
            court.voteOnReview(reviewId, false);
        }
        court.finalizeReview(reviewId);

        // Execute review outcome → bill goes from Referred to Vetoed
        court.executeReviewOutcome(reviewId);
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.Vetoed));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 8. DISSOLUTION CASCADE
    // ═══════════════════════════════════════════════════════════════════════

    function test_integration_dissolutionCascade() public {
        _runElectionAndSeatMajlis();

        // Start formation (Executive.startFormation requires onlyParliament)
        vm.prank(address(parliament));
        executive.startFormation();

        // Crown nom 1 fails
        vm.prank(address(crown));
        executive.nominatePM(pmCandidate);

        vm.prank(pmCandidate);
        executive.presentGovernment(keccak256("program 1"));

        vm.prank(citizen1); executive.voteConfidence(false);
        vm.prank(citizen2); executive.voteConfidence(false);
        vm.prank(citizen3); executive.voteConfidence(false);
        vm.prank(citizen4); executive.voteConfidence(false);
        vm.prank(citizen5); executive.voteConfidence(false);
        skip(3 days); // MIN_VOTING_PERIOD
        executive.finalizeConfidenceVote();

        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.CrownNom2));

        // Crown nom 2 fails
        vm.prank(address(crown));
        executive.nominatePM(pmCandidate2);

        vm.prank(pmCandidate2);
        executive.presentGovernment(keccak256("program 2"));

        vm.prank(citizen1); executive.voteConfidence(false);
        vm.prank(citizen2); executive.voteConfidence(false);
        vm.prank(citizen3); executive.voteConfidence(false);
        vm.prank(citizen4); executive.voteConfidence(false);
        vm.prank(citizen5); executive.voteConfidence(false);
        skip(3 days); // MIN_VOTING_PERIOD
        executive.finalizeConfidenceVote();

        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.MajlisList));

        // Majlis fails to propose list → Parliament triggers dissolution
        // triggerDissolution requires onlyParliament and calls Parliament.dissolveMajlis()
        vm.prank(address(parliament));
        executive.triggerDissolution();

        assertEq(uint256(executive.stage()), uint256(Executive.FormationStage.Dissolved));
        assertTrue(parliament.dissolved());

        // Restore after new election: Election.seatMembers calls restoreMajlis
        // Simulate by calling restoreMajlis directly (Election would call this after seating)
        vm.prank(address(election));
        parliament.restoreMajlis();
        assertFalse(parliament.dissolved());
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 9. TWO-TIER SENATE SELECTION PIPELINE
    // ═══════════════════════════════════════════════════════════════════════

    function test_integration_twoTierSenatePipeline() public {
        // ── Step 1: Initialize 3 provinces ───────────────────────────────
        ProvincialCouncil.ProvinceInit[] memory inits = new ProvincialCouncil.ProvinceInit[](3);
        inits[0] = ProvincialCouncil.ProvinceInit(1, bytes32("TEHRAN"),    5, 3, 200, 0);
        inits[1] = ProvincialCouncil.ProvinceInit(2, bytes32("ISFAHAN"),   5, 2, 60,  1);
        inits[2] = ProvincialCouncil.ProvinceInit(3, bytes32("FARS"),      5, 2, 30,  2);

        vm.prank(monarchAddr);
        crown.initializeProvincialCouncils(inits);

        assertTrue(pc.provincesInitialized());
        assertEq(pc.provinceCount(), 3);

        // ── Step 2: Register citizens with provinces ──────────────────────
        // Assign provinces to existing citizens
        vm.startPrank(authorityKey);
        registry.assignProvince(citizen1, 1); // Tehran
        registry.assignProvince(citizen2, 1);
        registry.assignProvince(citizen3, 1);
        registry.assignProvince(citizen4, 1);
        registry.assignProvince(citizen5, 1);
        registry.assignProvince(citizen6, 1);
        registry.assignProvince(citizen7, 1);
        vm.stopPrank();

        // ── Step 3: Run provincial council election (Tehran) ─────────────
        vm.prank(address(crown));
        uint256 provElectionId = election.startProvincialElection(1);

        // 3 candidates from Tehran
        vm.prank(citizen1);
        election.registerCandidate(provElectionId, keccak256("Local Party A"));
        vm.prank(citizen2);
        election.registerCandidate(provElectionId, keccak256("Local Party B"));
        vm.prank(citizen3);
        election.registerCandidate(provElectionId, keccak256("Local Party C"));

        // Advance to voting
        uint256 regPeriod = constitution.getParameter(constitution.PARAM_ELECTION_REG_PERIOD());
        vm.warp(block.timestamp + regPeriod);
        election.openVoting(provElectionId);

        // Citizens vote
        _castBallot(citizen4, provElectionId, 0);
        _castBallot(citizen5, provElectionId, 1);
        _castBallot(citizen6, provElectionId, 0);
        _castBallot(citizen7, provElectionId, 2);

        uint256 votePeriod = constitution.getParameter(constitution.PARAM_ELECTION_VOTE_PERIOD());
        vm.warp(block.timestamp + votePeriod);
        election.tallyVotes(provElectionId);

        // Seat council winners (determined by vote tally, onlyCrown)
        vm.prank(address(crown));
        election.seatMembers(provElectionId);

        assertTrue(pc.isCouncilMember(1, citizen1));
        assertTrue(pc.isCouncilMember(1, citizen2));
        assertTrue(pc.isCouncilMember(1, citizen3));

        // ── Step 4: Council conducts senate selection ─────────────────────
        vm.prank(address(crown));
        uint256 selId = pc.startSenateSelection(1);

        // Any Tehran citizen can run for Senate
        vm.prank(citizen4);
        pc.registerSenateCandidate(selId);
        vm.prank(citizen5);
        pc.registerSenateCandidate(selId);

        // Advance to voting
        uint256 selRegPeriod = constitution.getParameter(constitution.PARAM_SENATE_SELECTION_REG_PERIOD());
        vm.warp(block.timestamp + selRegPeriod);

        // Only council members vote
        vm.prank(citizen1); pc.castSenateVote(selId, 0); // vote for citizen4
        vm.prank(citizen2); pc.castSenateVote(selId, 0); // vote for citizen4
        vm.prank(citizen3); pc.castSenateVote(selId, 1); // vote for citizen5

        uint256 selVotePeriod = constitution.getParameter(constitution.PARAM_SENATE_SELECTION_VOTE_PERIOD());
        vm.warp(block.timestamp + selVotePeriod);
        pc.tallySenateSelection(selId);

        // Seat top senator (determined by vote tally, onlyCrown)
        vm.prank(address(crown));
        pc.seatSelectedSenators(selId);

        // Verify both candidates seated (senateSeatCount=3, 2 candidates → seats 2)
        assertTrue(parliament.isSenateMember(citizen4));
        assertTrue(parliament.isSenateMember(citizen5));
        assertEq(parliament.senatorProvince(citizen4), 1);
        assertEq(parliament.senateMemberCount(), 2);

        // ── Step 5: Crown appoints additional senators (10% cap) ─────────
        // Need more elected senators — seat more via direct seatMember to reach 10
        address[] memory moreSenators = new address[](8);
        for (uint256 i = 0; i < 8; i++) {
            moreSenators[i] = address(uint160(5000 + i));
            vm.prank(authorityKey);
            registry.registerCitizen(moreSenators[i], keccak256(abi.encodePacked("sen", i)), 1);
            vm.prank(address(election));
            parliament.seatMember(moreSenators[i], Parliament.Chamber.Senate);
        }

        // Now 10 senators. Crown can appoint 1 (11 * 10 / 100 = 1)
        address crownSenator = address(uint160(9999));
        vm.prank(authorityKey);
        registry.registerCitizen(crownSenator, keccak256("crown-senator"), 1);

        address[] memory crownSenators = new address[](1);
        crownSenators[0] = crownSenator;
        vm.prank(monarchAddr);
        crown.appointSenators(crownSenators);

        assertTrue(parliament.isSenateMember(crownSenator));
        assertTrue(parliament.isCrownSenator(crownSenator));
        assertEq(parliament.crownSenatorCount(), 1);
        assertEq(parliament.senateMemberCount(), 11);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 10. PROVINCE-SCOPED MAJLIS ELECTION
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Helper: initialize 3 provinces and assign citizens to them.
    function _initProvincesAndAssign() internal {
        ProvincialCouncil.ProvinceInit[] memory inits = new ProvincialCouncil.ProvinceInit[](3);
        inits[0] = ProvincialCouncil.ProvinceInit(1, bytes32("TEHRAN"),    5, 3, 200, 0);
        inits[1] = ProvincialCouncil.ProvinceInit(2, bytes32("ISFAHAN"),   5, 2, 60,  1);
        inits[2] = ProvincialCouncil.ProvinceInit(3, bytes32("FARS"),      5, 2, 30,  2);

        vm.prank(monarchAddr);
        crown.initializeProvincialCouncils(inits);

        // Assign citizens: 1-5 Tehran, 6-7 Isfahan, pmCandidate+pmCandidate2 Fars
        vm.startPrank(authorityKey);
        registry.assignProvince(citizen1, 1);
        registry.assignProvince(citizen2, 1);
        registry.assignProvince(citizen3, 1);
        registry.assignProvince(citizen4, 1);
        registry.assignProvince(citizen5, 1);
        registry.assignProvince(citizen6, 2);
        registry.assignProvince(citizen7, 2);
        registry.assignProvince(pmCandidate, 3);
        registry.assignProvince(pmCandidate2, 3);
        vm.stopPrank();
    }

    /// @notice Helper: run a province-scoped Majlis election and seat winners.
    /// @param provinceId The province to run the election for.
    /// @param candidateAddrs Candidates to register and seat.
    /// @param voterAddrs Voters (must be from same province).
    function _runProvinceMajlisElection(
        uint8 provinceId,
        address[] memory candidateAddrs,
        address[] memory voterAddrs
    ) internal {
        vm.prank(address(parliament));
        uint256 electionId = election.startMajlisElection(provinceId);

        for (uint256 i = 0; i < candidateAddrs.length; i++) {
            vm.prank(candidateAddrs[i]);
            election.registerCandidate(electionId, keccak256(abi.encodePacked("Party", i)));
        }

        uint256 regPeriod = constitution.getParameter(constitution.PARAM_ELECTION_REG_PERIOD());
        vm.warp(block.timestamp + regPeriod);
        election.openVoting(electionId);

        for (uint256 i = 0; i < voterAddrs.length; i++) {
            _castBallotWithProvince(voterAddrs[i], electionId, i % candidateAddrs.length, provinceId);
        }

        uint256 votePeriod = constitution.getParameter(constitution.PARAM_ELECTION_VOTE_PERIOD());
        vm.warp(block.timestamp + votePeriod);
        election.tallyVotes(electionId);

        vm.prank(address(crown));
        election.seatMembers(electionId);
    }

    function test_integration_provinceScoped_majlisElection() public {
        _initProvincesAndAssign();

        // Run elections in all 3 provinces
        address[] memory tehranCandidates = new address[](3);
        tehranCandidates[0] = citizen1; tehranCandidates[1] = citizen2; tehranCandidates[2] = citizen3;
        address[] memory tehranVoters = new address[](2);
        tehranVoters[0] = citizen4; tehranVoters[1] = citizen5;
        _runProvinceMajlisElection(1, tehranCandidates, tehranVoters);

        address[] memory isfahanCandidates = new address[](1);
        isfahanCandidates[0] = citizen6;
        address[] memory isfahanVoters = new address[](1);
        isfahanVoters[0] = citizen7;
        _runProvinceMajlisElection(2, isfahanCandidates, isfahanVoters);

        address[] memory farsCandidates = new address[](1);
        farsCandidates[0] = pmCandidate;
        address[] memory farsVoters = new address[](1);
        farsVoters[0] = pmCandidate2;
        _runProvinceMajlisElection(3, farsCandidates, farsVoters);

        // Verify: all members seated with correct provinces
        assertEq(parliament.majlisMemberCount(), 5);
        assertTrue(parliament.isMajlisMember(citizen1));
        assertTrue(parliament.isMajlisMember(citizen6));
        assertTrue(parliament.isMajlisMember(pmCandidate));
        assertEq(parliament.majlisMemberProvince(citizen1), 1);
        assertEq(parliament.majlisMemberProvince(citizen2), 1);
        assertEq(parliament.majlisMemberProvince(citizen3), 1);
        assertEq(parliament.majlisMemberProvince(citizen6), 2);
        assertEq(parliament.majlisMemberProvince(pmCandidate), 3);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 11. PROVINCE ENFORCEMENT — CROSS-PROVINCE REVERTS
    // ═══════════════════════════════════════════════════════════════════════

    function test_integration_provinceEnforcement_crossProvinceReverts() public {
        _initProvincesAndAssign();

        // Start Majlis election for Tehran (province 1)
        vm.prank(address(parliament));
        uint256 electionId = election.startMajlisElection(1);

        // Isfahan citizen (province 2) tries to register in Tehran election → revert
        vm.prank(citizen6);
        vm.expectRevert(Election.WrongProvince.selector);
        election.registerCandidate(electionId, keccak256("party"));

        // Register a valid Tehran candidate
        vm.prank(citizen1);
        election.registerCandidate(electionId, keccak256("party"));

        // Advance to voting
        uint256 regPeriod = constitution.getParameter(constitution.PARAM_ELECTION_REG_PERIOD());
        vm.warp(block.timestamp + regPeriod);
        election.openVoting(electionId);

        // Isfahan citizen tries to vote in Tehran election → revert (wrong province in proof)
        (Election.ProofPoints memory proof, uint256[23] memory signals) =
            _mockBallotProof(_identityHash(citizen6), electionId, 0, 2);
        vm.expectRevert(Election.WrongProvince.selector);
        election.castBallot(electionId, 0, proof, signals);

        // Tehran citizen votes successfully
        _castBallotWithProvince(citizen2, electionId, 0, 1);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 12. MULTI-PROVINCE DISSOLUTION
    // ═══════════════════════════════════════════════════════════════════════

    function test_integration_multiProvinceDissolution() public {
        _initProvincesAndAssign();

        // Seat Majlis members from province 1 first (need Majlis for formation)
        address[] memory tehranCandidates = new address[](3);
        tehranCandidates[0] = citizen1; tehranCandidates[1] = citizen2; tehranCandidates[2] = citizen3;
        address[] memory tehranVoters = new address[](2);
        tehranVoters[0] = citizen4; tehranVoters[1] = citizen5;
        _runProvinceMajlisElection(1, tehranCandidates, tehranVoters);

        assertEq(parliament.majlisMemberCount(), 3);

        // Dissolve Majlis (via Parliament direct call for simplicity)
        vm.prank(address(executive));
        parliament.dissolveMajlis();
        assertTrue(parliament.dissolved());

        // Wait past dissolution election deadline (60 days)
        uint256 deadline = constitution.getParameter(constitution.PARAM_DISSOLUTION_ELECTION_DEADLINE());
        vm.warp(block.timestamp + deadline + 1);

        // Anyone triggers dissolution election timeout
        parliament.claimDissolutionElectionTimeout();

        // Verify: 3 elections created (one per province), pendingMajlisElections = 3
        assertEq(parliament.pendingMajlisElections(), 3);
        assertTrue(parliament.dissolved()); // still dissolved

        // Seat province 1 election (elections[0] was created by claimDissolutionElectionTimeout)
        // Elections were started at IDs after existing ones. Let's find them.
        uint256 totalElections = election.electionCount();
        // The last 3 elections are the dissolution elections (provinces 1, 2, 3)
        uint256 prov1ElectionId = totalElections - 3;
        uint256 prov2ElectionId = totalElections - 2;
        uint256 prov3ElectionId = totalElections - 1;

        // Register new candidates (not already-seated members) for each province
        // Province 1 (Tehran) — citizen4 and citizen5 are Tehran citizens, not seated
        vm.prank(citizen4);
        election.registerCandidate(prov1ElectionId, keccak256("party1"));
        vm.prank(citizen5);
        election.registerCandidate(prov1ElectionId, keccak256("party2"));

        // Province 2 (Isfahan) — citizen6 was never seated
        vm.prank(citizen6);
        election.registerCandidate(prov2ElectionId, keccak256("party1"));

        // Province 3 (Fars) — pmCandidate was never seated
        vm.prank(pmCandidate);
        election.registerCandidate(prov3ElectionId, keccak256("party1"));

        // Advance to voting for all 3
        uint256 regPeriod = constitution.getParameter(constitution.PARAM_ELECTION_REG_PERIOD());
        vm.warp(block.timestamp + regPeriod);
        election.openVoting(prov1ElectionId);
        election.openVoting(prov2ElectionId);
        election.openVoting(prov3ElectionId);

        // Vote in all 3 (existing members can still vote as citizens)
        _castBallotWithProvince(citizen1, prov1ElectionId, 0, 1);
        _castBallotWithProvince(citizen2, prov1ElectionId, 1, 1);
        _castBallotWithProvince(citizen7, prov2ElectionId, 0, 2);
        _castBallotWithProvince(pmCandidate2, prov3ElectionId, 0, 3);

        // Advance past voting
        uint256 votePeriod = constitution.getParameter(constitution.PARAM_ELECTION_VOTE_PERIOD());
        vm.warp(block.timestamp + votePeriod);

        // Tally all 3
        election.tallyVotes(prov1ElectionId);
        election.tallyVotes(prov2ElectionId);
        election.tallyVotes(prov3ElectionId);

        // Seat province 1 — Majlis NOT yet restored
        vm.prank(address(crown));
        election.seatMembers(prov1ElectionId);
        assertEq(parliament.pendingMajlisElections(), 2);
        assertTrue(parliament.dissolved()); // still dissolved

        // Seat province 2
        vm.prank(address(crown));
        election.seatMembers(prov2ElectionId);
        assertEq(parliament.pendingMajlisElections(), 1);
        assertTrue(parliament.dissolved()); // still dissolved

        // Seat province 3 — this should restore the Majlis
        vm.prank(address(crown));
        election.seatMembers(prov3ElectionId);
        assertEq(parliament.pendingMajlisElections(), 0);
        assertFalse(parliament.dissolved()); // RESTORED

        // Verify new members seated with correct provinces
        assertTrue(parliament.isMajlisMember(citizen4));
        assertTrue(parliament.isMajlisMember(citizen5));
        assertTrue(parliament.isMajlisMember(citizen6));
        assertTrue(parliament.isMajlisMember(pmCandidate));
        assertEq(parliament.majlisMemberProvince(citizen4), 1);
        assertEq(parliament.majlisMemberProvince(citizen5), 1);
        assertEq(parliament.majlisMemberProvince(citizen6), 2);
        assertEq(parliament.majlisMemberProvince(pmCandidate), 3);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 13. PROVINCE-SCOPED BY-ELECTION
    // ═══════════════════════════════════════════════════════════════════════

    function test_integration_provinceScopedByElection() public {
        _initProvincesAndAssign();

        // Seat Majlis members from two provinces
        address[] memory tehranCandidates = new address[](3);
        tehranCandidates[0] = citizen1; tehranCandidates[1] = citizen2; tehranCandidates[2] = citizen3;
        address[] memory tehranVoters = new address[](2);
        tehranVoters[0] = citizen4; tehranVoters[1] = citizen5;
        _runProvinceMajlisElection(1, tehranCandidates, tehranVoters);

        address[] memory isfahanCandidates = new address[](1);
        isfahanCandidates[0] = citizen6;
        address[] memory isfahanVoters = new address[](1);
        isfahanVoters[0] = citizen7;
        _runProvinceMajlisElection(2, isfahanCandidates, isfahanVoters);

        assertEq(parliament.majlisMemberCount(), 4);

        // Seat senators and appoint justices (needed for removeMember)
        _seatTestSenators();
        address[7] memory justices;
        for (uint256 i = 0; i < 7; i++) {
            justices[i] = address(uint160(6000 + i));
            vm.prank(monarchAddr);
            crown.nominateJustice(justices[i], i);
            _confirmNomineeBySenate(i);
        }

        // Remove citizen1 (Tehran, province 1) via Supreme Court
        vm.prank(address(court));
        parliament.removeMember(citizen1, Parliament.Chamber.Majlis);

        // Verify vacancy tracked for province 1 only
        assertEq(parliament.majlisVacancyCount(), 1);
        assertEq(parliament.provinceMajlisVacancies(1), 1);
        assertEq(parliament.provinceMajlisVacancies(2), 0);

        // Wait past by-election deadline (90 days)
        uint256 deadline = constitution.getParameter(constitution.PARAM_BY_ELECTION_DEADLINE());
        vm.warp(block.timestamp + deadline + 1);

        // Trigger by-election
        parliament.claimByElectionTimeout(Parliament.Chamber.Majlis);

        // Verify: only province 1 got an election, not province 2
        assertEq(parliament.pendingMajlisElections(), 1);
        assertTrue(parliament.byElectionTriggeredForProvince(1));
        assertFalse(parliament.byElectionTriggeredForProvince(2));

        // Run the by-election for province 1
        uint256 byElectionId = election.electionCount() - 1;

        // citizen4 runs (Tehran citizen not currently seated)
        vm.prank(citizen4);
        election.registerCandidate(byElectionId, keccak256("replacement"));

        // Isfahan citizen tries to register in Tehran by-election → revert
        vm.prank(citizen7);
        vm.expectRevert(Election.WrongProvince.selector);
        election.registerCandidate(byElectionId, keccak256("wrong province"));

        uint256 regPeriod = constitution.getParameter(constitution.PARAM_ELECTION_REG_PERIOD());
        vm.warp(block.timestamp + regPeriod);
        election.openVoting(byElectionId);

        _castBallotWithProvince(citizen5, byElectionId, 0, 1);

        uint256 votePeriod = constitution.getParameter(constitution.PARAM_ELECTION_VOTE_PERIOD());
        vm.warp(block.timestamp + votePeriod);
        election.tallyVotes(byElectionId);

        vm.prank(address(crown));
        election.seatMembers(byElectionId);

        // Verify: citizen4 seated in province 1, vacancy cleared
        assertTrue(parliament.isMajlisMember(citizen4));
        assertEq(parliament.majlisMemberProvince(citizen4), 1);
        assertEq(parliament.provinceMajlisVacancies(1), 0);
        assertEq(parliament.pendingMajlisElections(), 0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 14. REAPPORTIONMENT
    // ═══════════════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════════════
    // 13b. BY-ELECTION FAILURE PATHS
    // ═══════════════════════════════════════════════════════════════════════

    function test_integration_byElection_revertNoVacancies() public {
        _initProvincesAndAssign();

        // Seat Majlis members
        address[] memory tehranCandidates = new address[](3);
        tehranCandidates[0] = citizen1; tehranCandidates[1] = citizen2; tehranCandidates[2] = citizen3;
        address[] memory tehranVoters = new address[](2);
        tehranVoters[0] = citizen4; tehranVoters[1] = citizen5;
        _runProvinceMajlisElection(1, tehranCandidates, tehranVoters);

        // No vacancies exist — by-election should revert
        vm.expectRevert(Parliament.NoVacancies.selector);
        parliament.claimByElectionTimeout(Parliament.Chamber.Majlis);
    }

    function test_integration_byElection_revertBeforeDeadline() public {
        _initProvincesAndAssign();

        // Seat and then remove to create vacancy
        address[] memory tehranCandidates = new address[](3);
        tehranCandidates[0] = citizen1; tehranCandidates[1] = citizen2; tehranCandidates[2] = citizen3;
        address[] memory tehranVoters = new address[](2);
        tehranVoters[0] = citizen4; tehranVoters[1] = citizen5;
        _runProvinceMajlisElection(1, tehranCandidates, tehranVoters);

        // Appoint justices for removeMember
        _seatTestSenators();
        for (uint256 i = 0; i < 7; i++) {
            address j = address(uint160(7000 + i));
            vm.prank(monarchAddr);
            crown.nominateJustice(j, i);
            _confirmNomineeBySenate(i);
        }

        vm.prank(address(court));
        parliament.removeMember(citizen1, Parliament.Chamber.Majlis);

        // Try to claim by-election before deadline → revert
        vm.expectRevert(Parliament.ByElectionDeadlineNotReached.selector);
        parliament.claimByElectionTimeout(Parliament.Chamber.Majlis);
    }

    function test_integration_byElection_revertDoubleTriggered() public {
        _initProvincesAndAssign();

        address[] memory tehranCandidates = new address[](3);
        tehranCandidates[0] = citizen1; tehranCandidates[1] = citizen2; tehranCandidates[2] = citizen3;
        address[] memory tehranVoters = new address[](2);
        tehranVoters[0] = citizen4; tehranVoters[1] = citizen5;
        _runProvinceMajlisElection(1, tehranCandidates, tehranVoters);

        _seatTestSenators();
        for (uint256 i = 0; i < 7; i++) {
            address j = address(uint160(7100 + i));
            vm.prank(monarchAddr);
            crown.nominateJustice(j, i);
            _confirmNomineeBySenate(i);
        }

        vm.prank(address(court));
        parliament.removeMember(citizen1, Parliament.Chamber.Majlis);

        uint256 deadline = constitution.getParameter(constitution.PARAM_BY_ELECTION_DEADLINE());
        vm.warp(block.timestamp + deadline + 1);

        // First trigger succeeds
        parliament.claimByElectionTimeout(Parliament.Chamber.Majlis);

        // Second trigger reverts
        vm.expectRevert(Parliament.ByElectionAlreadyTriggered.selector);
        parliament.claimByElectionTimeout(Parliament.Chamber.Majlis);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 12b. DISSOLUTION FAILURE PATHS
    // ═══════════════════════════════════════════════════════════════════════

    function test_integration_dissolution_revertNotDissolved() public {
        _initProvincesAndAssign();

        // Not dissolved — should revert
        vm.expectRevert(Parliament.NotDissolved.selector);
        parliament.claimDissolutionElectionTimeout();
    }

    function test_integration_dissolution_revertBeforeDeadline() public {
        _initProvincesAndAssign();

        address[] memory tehranCandidates = new address[](3);
        tehranCandidates[0] = citizen1; tehranCandidates[1] = citizen2; tehranCandidates[2] = citizen3;
        address[] memory tehranVoters = new address[](2);
        tehranVoters[0] = citizen4; tehranVoters[1] = citizen5;
        _runProvinceMajlisElection(1, tehranCandidates, tehranVoters);

        vm.prank(address(executive));
        parliament.dissolveMajlis();

        // Try before deadline → revert
        vm.expectRevert(Parliament.DissolutionElectionDeadlineNotReached.selector);
        parliament.claimDissolutionElectionTimeout();
    }

    function test_integration_dissolution_revertDoubleTriggered() public {
        _initProvincesAndAssign();

        address[] memory tehranCandidates = new address[](3);
        tehranCandidates[0] = citizen1; tehranCandidates[1] = citizen2; tehranCandidates[2] = citizen3;
        address[] memory tehranVoters = new address[](2);
        tehranVoters[0] = citizen4; tehranVoters[1] = citizen5;
        _runProvinceMajlisElection(1, tehranCandidates, tehranVoters);

        vm.prank(address(executive));
        parliament.dissolveMajlis();

        uint256 deadline = constitution.getParameter(constitution.PARAM_DISSOLUTION_ELECTION_DEADLINE());
        vm.warp(block.timestamp + deadline + 1);

        // First trigger succeeds
        parliament.claimDissolutionElectionTimeout();

        // Second trigger reverts
        vm.expectRevert(Parliament.DissolutionElectionAlreadyTriggered.selector);
        parliament.claimDissolutionElectionTimeout();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 10b. MAJLIS ELECTION FAILURE PATHS
    // ═══════════════════════════════════════════════════════════════════════

    function test_integration_startElection_rejectsMajlis() public {
        // startElection(Majlis) must revert — all Majlis elections use startMajlisElection
        vm.prank(address(parliament));
        vm.expectRevert(Election.MajlisElectionMustUseProvince.selector);
        election.startElection(Election.ElectionType.Majlis);
    }

    function test_integration_startMajlisElection_revertInvalidProvince() public {
        // Province 0 is invalid
        vm.prank(address(parliament));
        vm.expectRevert(Election.InvalidProvince.selector);
        election.startMajlisElection(0);

        // Province 32 is invalid (max 31)
        vm.prank(address(parliament));
        vm.expectRevert(Election.InvalidProvince.selector);
        election.startMajlisElection(32);
    }

    function test_integration_startMajlisElection_revertNotParliament() public {
        // Monarch tries to start Majlis election → revert
        vm.prank(monarchAddr);
        vm.expectRevert(Election.NotAuthorized.selector);
        election.startMajlisElection(1);

        // Random citizen tries → revert
        vm.prank(citizen1);
        vm.expectRevert(Election.NotAuthorized.selector);
        election.startMajlisElection(1);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 14. REAPPORTIONMENT
    // ═══════════════════════════════════════════════════════════════════════

    function test_integration_reapportionment() public {
        _initProvincesAndAssign();

        // Verify initial allocation
        assertEq(pc.getMajlisSeatCount(1), 200); // Tehran
        assertEq(pc.getMajlisSeatCount(2), 60);  // Isfahan
        assertEq(pc.getMajlisSeatCount(3), 30);  // Fars

        // Parliament reapportions (shift seats from Tehran to Isfahan and Fars)
        uint8[] memory reapIds = new uint8[](3);
        uint256[] memory newCounts = new uint256[](3);
        reapIds[0] = 1; newCounts[0] = 180;  // Tehran loses 20
        reapIds[1] = 2; newCounts[1] = 70;   // Isfahan gains 10
        reapIds[2] = 3; newCounts[2] = 40;   // Fars gains 10
        // Total = 180 + 70 + 40 = 290 (matches PARAM_TOTAL_MAJLIS_SEATS)

        vm.prank(address(parliament));
        pc.updateMajlisSeatAllocation(reapIds, newCounts);

        assertEq(pc.getMajlisSeatCount(1), 180);
        assertEq(pc.getMajlisSeatCount(2), 70);
        assertEq(pc.getMajlisSeatCount(3), 40);

        // Attempt reapportionment with wrong total → revert
        uint256[] memory badCounts = new uint256[](3);
        badCounts[0] = 180; badCounts[1] = 70; badCounts[2] = 50; // Total 300 != 290

        vm.prank(address(parliament));
        vm.expectRevert(ProvincialCouncil.TotalSeatsMismatch.selector);
        pc.updateMajlisSeatAllocation(reapIds, badCounts);

        // Non-Parliament caller → revert
        vm.prank(monarchAddr);
        vm.expectRevert(ProvincialCouncil.NotAuthorized.selector);
        pc.updateMajlisSeatAllocation(reapIds, newCounts);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 15. REAPPORTIONMENT CHECKS & BALANCES — CROWN REFERRAL + COURT VETO
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Full checks-and-balances lifecycle for reapportionment:
    ///         Parliament passes bill → Crown returns (suspects gerrymandering) →
    ///         Majlis re-adopts → Crown refers to Court → Court finds unconstitutional →
    ///         bill vetoed → allocations unchanged.
    function test_integration_reapportionment_courtFindsUnconstitutional() public {
        _initProvincesAndAssign();

        // Seat Majlis from Tehran + senators for full legislative cycle
        address[] memory tehranCandidates = new address[](3);
        tehranCandidates[0] = citizen1; tehranCandidates[1] = citizen2; tehranCandidates[2] = citizen3;
        address[] memory tehranVoters = new address[](2);
        tehranVoters[0] = citizen4; tehranVoters[1] = citizen5;
        _runProvinceMajlisElection(1, tehranCandidates, tehranVoters);

        _formGovernment(pmCandidate);

        // Seat 3 senators
        vm.prank(address(election));
        parliament.seatMember(citizen6, Parliament.Chamber.Senate);
        vm.prank(address(election));
        parliament.seatMember(citizen7, Parliament.Chamber.Senate);
        vm.prank(address(election));
        parliament.seatMember(pmCandidate2, Parliament.Chamber.Senate);

        // Appoint 7 justices via real Crown + Senate governance
        address[7] memory justices;
        for (uint256 i = 0; i < 7; i++) {
            justices[i] = address(uint160(8000 + i));
            vm.prank(monarchAddr);
            crown.nominateJustice(justices[i], i);
            _confirmNomineeBySenateWith(i, citizen6, citizen7, pmCandidate2);
        }

        // ── Step 1: Majlis submits reapportionment bill ─────────────────
        vm.prank(citizen1);
        uint256 billId = parliament.submitBill(
            keccak256("Reapportionment Act: Tehran 250, Isfahan 30, Fars 10"),
            "Reapportion Majlis seats disproportionately"
        );

        // ── Step 2: Majlis passes (3/5 majority) ────────────────────────
        vm.prank(citizen1); parliament.voteMajlis(billId, true);
        vm.prank(citizen2); parliament.voteMajlis(billId, true);
        vm.prank(citizen3); parliament.voteMajlis(billId, true);
        skip(3 days);
        parliament.finalizeMajlisVote(billId);

        // ── Step 3: Senate passes ───────────────────────────────────────
        vm.prank(citizen6); parliament.voteSenate(billId, true);
        vm.prank(citizen7); parliament.voteSenate(billId, true);
        skip(3 days);
        parliament.finalizeSenateVote(billId);

        // ── Step 4: Crown returns — suspects gerrymandering ─────────────
        vm.prank(monarchAddr);
        crown.returnLaw(billId);
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.Returned));

        // ── Step 5: Majlis re-adopts ────────────────────────────────────
        vm.prank(citizen1); parliament.voteMajlis(billId, true);
        vm.prank(citizen2); parliament.voteMajlis(billId, true);
        vm.prank(citizen3); parliament.voteMajlis(billId, true);
        skip(3 days);
        parliament.finalizeMajlisVote(billId);

        // ── Step 6: Crown refers to Court via real Crown function ───────
        vm.prank(monarchAddr);
        crown.referToSupremeCourt(billId);
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.Referred));

        // ── Step 7: PM files constitutional review ──────────────────────
        vm.prank(pmCandidate);
        uint256 reviewId = court.fileConstitutionalReview(billId, keccak256("disproportionate allocation"));

        // ── Step 8: Court finds it unconstitutional (5-2) ───────────────
        for (uint256 i = 0; i < 2; i++) {
            vm.prank(justices[i]);
            court.voteOnReview(reviewId, true); // constitutional
        }
        for (uint256 i = 2; i < 7; i++) {
            vm.prank(justices[i]);
            court.voteOnReview(reviewId, false); // unconstitutional
        }
        court.finalizeReview(reviewId);
        assertEq(uint256(court.getReviewStatus(reviewId)), uint256(SupremeCourt.ReviewStatus.Unconstitutional));

        // ── Step 9: Execute ruling — bill vetoed ────────────────────────
        court.executeReviewOutcome(reviewId);
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.Vetoed));

        // ── Step 10: Allocations unchanged ──────────────────────────────
        assertEq(pc.getMajlisSeatCount(1), 200); // Tehran — still 200
        assertEq(pc.getMajlisSeatCount(2), 60);  // Isfahan — still 60
        assertEq(pc.getMajlisSeatCount(3), 30);  // Fars — still 30
    }

    /// @notice Happy path: bill passes Court review → enacted →
    ///         Parliament proceeds with reapportionment.
    function test_integration_reapportionment_courtFindsConstitutional() public {
        _initProvincesAndAssign();

        // Seat Majlis + senators + government + justices (same setup)
        address[] memory tehranCandidates = new address[](3);
        tehranCandidates[0] = citizen1; tehranCandidates[1] = citizen2; tehranCandidates[2] = citizen3;
        address[] memory tehranVoters = new address[](2);
        tehranVoters[0] = citizen4; tehranVoters[1] = citizen5;
        _runProvinceMajlisElection(1, tehranCandidates, tehranVoters);

        _formGovernment(pmCandidate);

        vm.prank(address(election));
        parliament.seatMember(citizen6, Parliament.Chamber.Senate);
        vm.prank(address(election));
        parliament.seatMember(citizen7, Parliament.Chamber.Senate);
        vm.prank(address(election));
        parliament.seatMember(pmCandidate2, Parliament.Chamber.Senate);

        address[7] memory justices;
        for (uint256 i = 0; i < 7; i++) {
            justices[i] = address(uint160(8100 + i));
            vm.prank(monarchAddr);
            crown.nominateJustice(justices[i], i);
            _confirmNomineeBySenateWith(i, citizen6, citizen7, pmCandidate2);
        }

        // Bill: reasonable reapportionment (proportional to population)
        vm.prank(citizen1);
        uint256 billId = parliament.submitBill(
            keccak256("Reapportionment Act: Tehran 180, Isfahan 70, Fars 40"),
            "Reapportion Majlis seats based on census"
        );

        // Pass through Majlis
        vm.prank(citizen1); parliament.voteMajlis(billId, true);
        vm.prank(citizen2); parliament.voteMajlis(billId, true);
        vm.prank(citizen3); parliament.voteMajlis(billId, true);
        skip(3 days);
        parliament.finalizeMajlisVote(billId);

        // Pass through Senate
        vm.prank(citizen6); parliament.voteSenate(billId, true);
        vm.prank(citizen7); parliament.voteSenate(billId, true);
        skip(3 days);
        parliament.finalizeSenateVote(billId);

        // Crown returns for review
        vm.prank(monarchAddr);
        crown.returnLaw(billId);

        // Majlis re-adopts
        vm.prank(citizen1); parliament.voteMajlis(billId, true);
        vm.prank(citizen2); parliament.voteMajlis(billId, true);
        vm.prank(citizen3); parliament.voteMajlis(billId, true);
        skip(3 days);
        parliament.finalizeMajlisVote(billId);

        // Crown refers to Court
        vm.prank(monarchAddr);
        crown.referToSupremeCourt(billId);

        // PM files review
        vm.prank(pmCandidate);
        uint256 reviewId = court.fileConstitutionalReview(billId, keccak256("census-based reapportionment"));

        // Court finds it constitutional (5-2)
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(justices[i]);
            court.voteOnReview(reviewId, true);
        }
        for (uint256 i = 5; i < 7; i++) {
            vm.prank(justices[i]);
            court.voteOnReview(reviewId, false);
        }
        court.finalizeReview(reviewId);
        assertEq(uint256(court.getReviewStatus(reviewId)), uint256(SupremeCourt.ReviewStatus.Constitutional));

        // Execute ruling — bill enacted
        court.executeReviewOutcome(reviewId);
        assertEq(uint256(parliament.getBillStatus(billId)), uint256(Parliament.BillStatus.Enacted));

        // Now Parliament proceeds with the reapportionment (authorized by enacted bill)
        uint8[] memory reapIds = new uint8[](3);
        uint256[] memory newCounts = new uint256[](3);
        reapIds[0] = 1; newCounts[0] = 180;
        reapIds[1] = 2; newCounts[1] = 70;
        reapIds[2] = 3; newCounts[2] = 40;

        vm.prank(address(parliament));
        pc.updateMajlisSeatAllocation(reapIds, newCounts);

        // Verify allocations updated
        assertEq(pc.getMajlisSeatCount(1), 180);
        assertEq(pc.getMajlisSeatCount(2), 70);
        assertEq(pc.getMajlisSeatCount(3), 40);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 16. SUCCESSION LIFECYCLE (Art. VI.1)
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Full succession lifecycle: monarch dies → Court certifies →
    ///         heir confirmed → claimSuccession → new monarch installed.
    function test_integration_successionLifecycle() public {
        _runElectionAndSeatMajlis();
        _formGovernment(pmCandidate);
        _seatTestSenators();

        // Appoint 7 justices
        address[7] memory justices;
        for (uint256 i = 0; i < 7; i++) {
            justices[i] = address(uint160(9000 + i));
            vm.prank(monarchAddr);
            crown.nominateJustice(justices[i], i);
            _confirmNomineeBySenate(i);
        }

        // Set succession list
        address heir = makeAddr("heir");
        vm.prank(authorityKey);
        registry.registerCitizen(heir, keccak256(abi.encodePacked(heir)), 1);
        address[] memory successors = new address[](1);
        successors[0] = heir;

        // Court certifies succession list update (Crown.updateSuccessionList needs Court cert)
        bytes32 succCertHash = keccak256(abi.encodePacked("SUCCESSION_LIST_UPDATE", monarchAddr));
        _certifyFactWith(justices, succCertHash);
        vm.prank(monarchAddr);
        crown.updateSuccessionList(successors);

        // Monarch dies — Court certifies vacancy
        bytes32 vacancyHash = keccak256(abi.encodePacked("MONARCH_VACANCY", monarchAddr));
        _certifyFactWith(justices, vacancyHash);

        // Court confirms heir
        bytes32 heirHash = keccak256(abi.encodePacked("HEIR_CONFIRMED", monarchAddr, heir));
        _certifyFactWith(justices, heirHash);

        // Anyone claims succession
        crown.claimSuccession(heir);

        // New monarch installed
        assertEq(constitution.getRole(ROLE_MONARCH), heir);
        assertFalse(crown.suspended());
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 17. REGENCY LIFECYCLE (Art. VI.3)
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Full regency lifecycle: monarch incapacitated → regent installed →
    ///         monarch recovers → regency ends.
    function test_integration_regencyLifecycle() public {
        _runElectionAndSeatMajlis();
        _formGovernment(pmCandidate);
        _seatTestSenators();

        // Appoint 7 justices
        address[7] memory justices;
        for (uint256 i = 0; i < 7; i++) {
            justices[i] = address(uint160(9100 + i));
            vm.prank(monarchAddr);
            crown.nominateJustice(justices[i], i);
            _confirmNomineeBySenate(i);
        }

        // Set succession list (regent must be first eligible)
        address regent = makeAddr("regent");
        vm.prank(authorityKey);
        registry.registerCitizen(regent, keccak256(abi.encodePacked(regent)), 1);
        address[] memory successors = new address[](1);
        successors[0] = regent;

        bytes32 succCertHash = keccak256(abi.encodePacked("SUCCESSION_LIST_UPDATE", monarchAddr));
        _certifyFactWith(justices, succCertHash);
        vm.prank(monarchAddr);
        crown.updateSuccessionList(successors);

        // Court certifies monarch incapacity
        bytes32 incapHash = keccak256(abi.encodePacked("MONARCH_INCAPACITY", monarchAddr));
        _certifyFactWith(justices, incapHash);

        // Court confirms regent
        bytes32 regentHash = keccak256(abi.encodePacked("REGENT_CONFIRMED", monarchAddr, regent));
        _certifyFactWith(justices, regentHash);

        // Claim regency
        crown.claimRegency(regent);

        // Regent now exercises monarch powers
        bytes32 ROLE_REGENT = constitution.ROLE_REGENT();
        assertEq(constitution.getRole(ROLE_REGENT), regent);

        // Regent can exercise Crown powers (e.g., enact a law)
        // (Monarch is still the monarch address, regent acts in their stead)

        // Monarch recovers — Court certifies recovery
        bytes32 recoveryHash = keccak256(abi.encodePacked("MONARCH_RECOVERY", monarchAddr));
        _certifyFactWith(justices, recoveryHash);

        // End regency
        crown.claimRegencyEnd();

        // Regent cleared
        assertEq(constitution.getRole(ROLE_REGENT), address(0));
        // Monarch still in place
        assertEq(constitution.getRole(ROLE_MONARCH), monarchAddr);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 18. COURT LIVENESS RECOVERY (Art. V.8)
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Court liveness challenge: PM challenges → deadline passes →
    ///         emergency vacate seats → appoint replacements.
    function test_integration_courtLivenessRecovery() public {
        _runElectionAndSeatMajlis();
        _formGovernment(pmCandidate);
        _seatTestSenators();

        // Appoint 7 justices
        address[7] memory justices;
        for (uint256 i = 0; i < 7; i++) {
            justices[i] = address(uint160(9200 + i));
            vm.prank(monarchAddr);
            crown.nominateJustice(justices[i], i);
            _confirmNomineeBySenate(i);
        }
        assertEq(court.activeJusticeCount(), 7);

        // PM challenges court liveness
        vm.prank(pmCandidate);
        court.challengeCourtLiveness();

        // No justice responds — liveness deadline passes (7 days)
        uint256 livenessPeriod = constitution.getParameter(constitution.PARAM_COURT_LIVENESS_PERIOD());
        skip(livenessPeriod);

        // Emergency vacate all 7 seats
        for (uint256 i = 0; i < 7; i++) {
            court.emergencyVacateSeat(i);
        }
        assertEq(court.activeJusticeCount(), 0);

        // Appoint replacements
        for (uint256 i = 0; i < 7; i++) {
            address replacement = address(uint160(9300 + i));
            vm.prank(monarchAddr);
            crown.nominateJustice(replacement, i);
            _confirmNomineeBySenate(i);
        }
        assertEq(court.activeJusticeCount(), 7);
    }

    /// @notice Court liveness: justices respond within deadline → liveness reset, seats preserved.
    function test_integration_courtLiveness_justicesRespond() public {
        _runElectionAndSeatMajlis();
        _formGovernment(pmCandidate);
        _seatTestSenators();

        // Appoint 7 justices
        address[7] memory justices;
        for (uint256 i = 0; i < 7; i++) {
            justices[i] = address(uint160(9400 + i));
            vm.prank(monarchAddr);
            crown.nominateJustice(justices[i], i);
            _confirmNomineeBySenate(i);
        }

        // PM challenges liveness
        vm.prank(pmCandidate);
        court.challengeCourtLiveness();

        // Justice responds by voting on a fact (any Court action resets liveness)
        bytes32 dummyFact = keccak256("DUMMY_FACT");
        vm.prank(justices[0]);
        court.voteOnFact(dummyFact, true);

        // Liveness deadline cleared — emergency vacate should fail
        uint256 livenessPeriod = constitution.getParameter(constitution.PARAM_COURT_LIVENESS_PERIOD());
        skip(livenessPeriod);

        vm.expectRevert(SupremeCourt.NeitherLivenessConditionMet.selector);
        court.emergencyVacateSeat(0);

        // All justices still active
        assertEq(court.activeJusticeCount(), 7);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 19. EMERGENCY AMENDMENT LIFECYCLE (Art. VII.5)
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Emergency amendment: Court certifies threat → Parliament enacts →
    ///         1 year passes → amendment expires → parameter rolls back.
    function test_integration_emergencyAmendment_expiresAfterOneYear() public {
        _runElectionAndSeatMajlis();
        _formGovernment(pmCandidate);
        _seatTestSenators();

        // Appoint 7 justices
        address[7] memory justices;
        for (uint256 i = 0; i < 7; i++) {
            justices[i] = address(uint160(9500 + i));
            vm.prank(monarchAddr);
            crown.nominateJustice(justices[i], i);
            _confirmNomineeBySenate(i);
        }

        // Record original parameter value
        bytes32 paramKey = constitution.PARAM_CONFIDENCE_HONEYMOON();
        uint256 originalValue = constitution.getParameter(paramKey);

        // Court certifies emergency
        bytes32 emergHash = keccak256(abi.encodePacked("EMERGENCY_AMENDMENT", keccak256("Crisis response")));
        _certifyFactWith(justices, emergHash);

        // Parliament enacts emergency amendment (via Majlis governance action)
        bytes memory enactCall = abi.encodeCall(
            Referendum.enactEmergencyAmendment,
            (keccak256("Crisis response"), paramKey, 180 days)
        );
        // Propose governance action
        vm.prank(citizen1);
        uint256 actionId = parliament.proposeGovernanceAction(
            address(referendum), enactCall, Parliament.Chamber.Majlis, 75, keccak256("emergency")
        );
        vm.prank(citizen1); parliament.voteOnGovernanceAction(actionId, true);
        vm.prank(citizen2); parliament.voteOnGovernanceAction(actionId, true);
        vm.prank(citizen3); parliament.voteOnGovernanceAction(actionId, true);
        vm.prank(citizen4); parliament.voteOnGovernanceAction(actionId, true);
        skip(3 days);
        parliament.finalizeGovernanceAction(actionId);
        parliament.executeGovernanceAction(actionId);

        // Parameter changed immediately
        assertEq(constitution.getParameter(paramKey), 180 days);

        // 1 year passes — emergency expires
        uint256 emergDuration = constitution.getParameter(constitution.PARAM_EMERGENCY_AMEND_DURATION());
        skip(emergDuration);

        uint256 amendId = referendum.amendmentCount() - 1;
        referendum.expireEmergencyAmendment(amendId);

        // Parameter rolled back to original
        assertEq(constitution.getParameter(paramKey), originalValue);
    }

    /// @notice Emergency amendment confirmed by referendum → becomes permanent, no rollback.
    function test_integration_emergencyAmendment_confirmedByReferendum() public {
        _runElectionAndSeatMajlis();
        _formGovernment(pmCandidate);
        _seatTestSenators();

        // Appoint 7 justices
        address[7] memory justices;
        for (uint256 i = 0; i < 7; i++) {
            justices[i] = address(uint160(9600 + i));
            vm.prank(monarchAddr);
            crown.nominateJustice(justices[i], i);
            _confirmNomineeBySenate(i);
        }

        bytes32 paramKey = constitution.PARAM_CONFIDENCE_HONEYMOON();

        // Court certifies + Parliament enacts emergency
        bytes32 emergHash = keccak256(abi.encodePacked("EMERGENCY_AMENDMENT", keccak256("Permanent change")));
        _certifyFactWith(justices, emergHash);

        bytes memory enactCall = abi.encodeCall(
            Referendum.enactEmergencyAmendment,
            (keccak256("Permanent change"), paramKey, 120 days)
        );
        vm.prank(citizen1);
        uint256 actionId = parliament.proposeGovernanceAction(
            address(referendum), enactCall, Parliament.Chamber.Majlis, 75, keccak256("emergency2")
        );
        vm.prank(citizen1); parliament.voteOnGovernanceAction(actionId, true);
        vm.prank(citizen2); parliament.voteOnGovernanceAction(actionId, true);
        vm.prank(citizen3); parliament.voteOnGovernanceAction(actionId, true);
        vm.prank(citizen4); parliament.voteOnGovernanceAction(actionId, true);
        skip(3 days);
        parliament.finalizeGovernanceAction(actionId);
        parliament.executeGovernanceAction(actionId);

        assertEq(constitution.getParameter(paramKey), 120 days);

        // Parliament confirms via governance action (ratification)
        uint256 amendId = referendum.amendmentCount() - 1;
        bytes memory confirmCall = abi.encodeCall(Referendum.confirmEmergencyAmendment, (amendId));
        vm.prank(citizen1);
        uint256 confirmActionId = parliament.proposeGovernanceAction(
            address(referendum), confirmCall, Parliament.Chamber.Majlis, 50, keccak256("confirm-emergency")
        );
        vm.prank(citizen1); parliament.voteOnGovernanceAction(confirmActionId, true);
        vm.prank(citizen2); parliament.voteOnGovernanceAction(confirmActionId, true);
        vm.prank(citizen3); parliament.voteOnGovernanceAction(confirmActionId, true);
        skip(3 days);
        parliament.finalizeGovernanceAction(confirmActionId);
        parliament.executeGovernanceAction(confirmActionId);

        // Amendment is now Confirmed — cannot expire
        assertEq(uint256(referendum.getAmendmentStatus(amendId)), uint256(Referendum.AmendmentStatus.Confirmed));

        // Even after 1 year, parameter stays at new value
        uint256 emergDuration = constitution.getParameter(constitution.PARAM_EMERGENCY_AMEND_DURATION());
        skip(emergDuration);

        // expireEmergencyAmendment should revert (not in Enacted status — it's Confirmed)
        vm.expectRevert();
        referendum.expireEmergencyAmendment(amendId);

        // Value persists
        assertEq(constitution.getParameter(paramKey), 120 days);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 20. DEPUTY PM DESIGNATION & VACANCY CLAIM (Art. IV.9)
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Deputy PM lifecycle: PM designates deputy → PM dies →
    ///         Court certifies → deputy becomes Acting PM.
    function test_integration_deputyPM_vacancyClaim() public {
        _runElectionAndSeatMajlis();
        _formGovernment(pmCandidate);
        _seatTestSenators();

        // Appoint 7 justices
        address[7] memory justices;
        for (uint256 i = 0; i < 7; i++) {
            justices[i] = address(uint160(9700 + i));
            vm.prank(monarchAddr);
            crown.nominateJustice(justices[i], i);
            _confirmNomineeBySenate(i);
        }

        // PM designates deputy
        vm.prank(pmCandidate);
        executive.designateDeputyPM(pmCandidate2);

        assertEq(executive.deputyPM(), pmCandidate2);
        assertFalse(executive.isDeputyOverdue());

        // PM dies — Court certifies PM vacancy
        bytes32 pmVacancyHash = keccak256(abi.encodePacked("PM_VACANCY", pmCandidate));
        _certifyFactWith(justices, pmVacancyHash);

        // Anyone claims PM vacancy
        executive.claimPMVacancy();

        // Deputy becomes Acting PM (caretaker)
        assertEq(constitution.getRole(ROLE_PM), pmCandidate2);
        assertTrue(executive.caretaker());

        // New formation cycle begins — Crown nominates new PM
        vm.prank(address(crown));
        executive.nominatePM(citizen1);

        vm.prank(citizen1);
        executive.presentGovernment(keccak256("new government"));

        vm.prank(citizen1); executive.voteConfidence(true);
        vm.prank(citizen2); executive.voteConfidence(true);
        vm.prank(citizen3); executive.voteConfidence(true);
        skip(3 days);
        executive.finalizeConfidenceVote();

        // New PM in place, no longer caretaker
        assertEq(constitution.getRole(ROLE_PM), citizen1);
        assertFalse(executive.caretaker());
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 21. CROWN SUSPENSION WITH PM POWERS (Art. VI.5)
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Crown suspended → PM exercises Crown powers:
    ///         returns bill, nominates justice, Senate initiates formation.
    function test_integration_crownSuspension_pmExercisesCrownPowers() public {
        _runElectionAndSeatMajlis();
        _formGovernment(pmCandidate);
        _seatTestSenators();

        // Appoint 7 justices
        address[7] memory justices;
        for (uint256 i = 0; i < 7; i++) {
            justices[i] = address(uint160(9800 + i));
            vm.prank(monarchAddr);
            crown.nominateJustice(justices[i], i);
            _confirmNomineeBySenate(i);
        }

        // PM designates deputy (required for justice nomination during suspension)
        vm.prank(pmCandidate);
        executive.designateDeputyPM(pmCandidate2);

        // Suspend Crown (Court certifies vacancy, succession exhausted)
        bytes32 vacancyHash = keccak256(abi.encodePacked("MONARCH_VACANCY", monarchAddr));
        _certifyFactWith(justices, vacancyHash);
        crown.claimSuccessionExhausted();
        assertTrue(crown.suspended());

        // PM exercises Crown's justice nomination power during suspension
        // First, remove a justice to create vacancy (fact hash uses seat index, not address)
        bytes32 justiceVacancyHash = keccak256(abi.encodePacked("JUSTICE_VACANCY", uint256(0)));
        _certifyFactWith(justices, justiceVacancyHash);
        court.vacateJusticeSeat(0);
        assertEq(court.activeJusticeCount(), 6);

        // PM nominates replacement justice
        address newJustice = makeAddr("newJustice");
        vm.prank(pmCandidate);
        executive.nominateJusticeDuringSuspension(newJustice, 0);

        // Senate confirms
        _confirmNomineeBySenateWith(0, integSenator1, integSenator2, integSenator3);
        assertEq(court.activeJusticeCount(), 7);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HELPERS FOR FACT CERTIFICATION IN INTEGRATION TESTS
    // ═══════════════════════════════════════════════════════════════════════

    /// @dev Certify a fact using provided justice addresses.
    function _certifyFactWith(address[7] memory justiceAddrs, bytes32 factHash) internal {
        for (uint256 i = 0; i < 7; i++) {
            vm.prank(justiceAddrs[i]);
            court.voteOnFact(factHash, true);
        }
        uint256 factCertPeriod = constitution.getParameter(constitution.PARAM_FACT_CERT_PERIOD());
        skip(factCertPeriod);
        court.finalizeFactCertification(factHash);
    }
}
