// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Constitution.sol";

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO A: Uninitialized Constitution
// ═══════════════════════════════════════════════════════════════════════════

/// @notice Tests for Constitution.sol in its freshly-deployed, uninitialized state.
///         Covers: constructor, default parameters, initialize() happy/revert paths.
contract ConstitutionUninitializedTest is Test {
    event RoleChanged(bytes32 indexed role, address indexed oldHolder, address indexed newHolder);
    event ParameterAmended(bytes32 indexed key, uint256 oldValue, uint256 newValue);
    event ContractRegistered(bytes32 indexed name, address indexed addr);
    event Initialized();

    Constitution internal constitution;

    address internal deployer = makeAddr("deployer");
    address internal unauthorized = makeAddr("unauthorized");

    // Mock contract addresses
    address internal registryContract = makeAddr("registryContract");
    address internal crownContract = makeAddr("crownContract");
    address internal parliamentContract = makeAddr("parliamentContract");
    address internal executiveContract = makeAddr("executiveContract");
    address internal courtContract = makeAddr("courtContract");
    address internal electionContract = makeAddr("electionContract");
    address internal referendumContract = makeAddr("referendumContract");
    address internal budgetContract = makeAddr("budgetContract");
    address internal pcContract = makeAddr("pcContract");
    address internal verifierContract = makeAddr("verifierContract");

    // Cached keys
    bytes32 internal PARAM_MAJLIS_TERM;
    bytes32 internal CONTRACT_CROWN;
    bytes32 internal CONTRACT_CITIZEN_REGISTRY;
    bytes32 internal CONTRACT_PARLIAMENT;
    bytes32 internal CONTRACT_EXECUTIVE;
    bytes32 internal CONTRACT_SUPREME_COURT;
    bytes32 internal CONTRACT_ELECTION;
    bytes32 internal CONTRACT_REFERENDUM;
    bytes32 internal CONTRACT_BUDGET;
    bytes32 internal CONTRACT_PROVINCIAL_COUNCIL;
    bytes32 internal CONTRACT_BALLOT_VERIFIER;

    function setUp() public {
        vm.prank(deployer);
        constitution = new Constitution();

        PARAM_MAJLIS_TERM = constitution.PARAM_MAJLIS_TERM();
        CONTRACT_CROWN = constitution.CONTRACT_CROWN();
        CONTRACT_CITIZEN_REGISTRY = constitution.CONTRACT_CITIZEN_REGISTRY();
        CONTRACT_PARLIAMENT = constitution.CONTRACT_PARLIAMENT();
        CONTRACT_EXECUTIVE = constitution.CONTRACT_EXECUTIVE();
        CONTRACT_SUPREME_COURT = constitution.CONTRACT_SUPREME_COURT();
        CONTRACT_ELECTION = constitution.CONTRACT_ELECTION();
        CONTRACT_REFERENDUM = constitution.CONTRACT_REFERENDUM();
        CONTRACT_BUDGET = constitution.CONTRACT_BUDGET();
        CONTRACT_PROVINCIAL_COUNCIL = constitution.CONTRACT_PROVINCIAL_COUNCIL();
        CONTRACT_BALLOT_VERIFIER = constitution.CONTRACT_BALLOT_VERIFIER();
    }

    function _contractNames() internal view returns (bytes32[] memory names) {
        names = new bytes32[](10);
        names[0] = CONTRACT_CITIZEN_REGISTRY;
        names[1] = CONTRACT_CROWN;
        names[2] = CONTRACT_PARLIAMENT;
        names[3] = CONTRACT_EXECUTIVE;
        names[4] = CONTRACT_SUPREME_COURT;
        names[5] = CONTRACT_ELECTION;
        names[6] = CONTRACT_REFERENDUM;
        names[7] = CONTRACT_BUDGET;
        names[8] = CONTRACT_PROVINCIAL_COUNCIL;
        names[9] = CONTRACT_BALLOT_VERIFIER;
    }

    function _contractAddrs() internal view returns (address[] memory addrs) {
        addrs = new address[](10);
        addrs[0] = registryContract;
        addrs[1] = crownContract;
        addrs[2] = parliamentContract;
        addrs[3] = executiveContract;
        addrs[4] = courtContract;
        addrs[5] = electionContract;
        addrs[6] = referendumContract;
        addrs[7] = budgetContract;
        addrs[8] = pcContract;
        addrs[9] = verifierContract;
    }

    function _etchAll() internal {
        address[] memory addrs = _contractAddrs();
        for (uint256 i = 0; i < addrs.length; i++) {
            vm.etch(addrs[i], hex"00");
        }
    }

    // ─── Constructor ─────────────────────────────────────────────────────

    function test_happyCase_constructor() public view {
        assertEq(constitution.deployer(), deployer);
        assertFalse(constitution.initialized());
    }

    function test_happyCase_defaultParameters() public view {
        assertEq(constitution.getParameter(constitution.PARAM_MAJLIS_TERM()), 4 * 365 days);
        assertEq(constitution.getParameter(constitution.PARAM_SENATE_TERM()), 6 * 365 days);
        assertEq(constitution.getParameter(constitution.PARAM_JUSTICE_TERM()), 9 * 365 days);
        assertEq(constitution.getParameter(constitution.PARAM_JUSTICE_COUNT()), 12);
        assertEq(constitution.getParameter(constitution.PARAM_COURT_QUORUM()), 7);
        assertEq(constitution.getParameter(constitution.PARAM_SENATE_CROWN_PCT()), 10);
        assertEq(constitution.getParameter(constitution.PARAM_CROWN_LAW_DEADLINE()), 14 days);
        assertEq(constitution.getParameter(constitution.PARAM_SENATE_REVIEW_PERIOD()), 30 days);
        assertEq(constitution.getParameter(constitution.PARAM_CONFIDENCE_HONEYMOON()), 90 days);
        assertEq(constitution.getParameter(constitution.PARAM_NOMINATION_DEADLINE()), 14 days);
        assertEq(constitution.getParameter(constitution.PARAM_MAJLIS_LIST_DEADLINE()), 14 days);
        assertEq(constitution.getParameter(constitution.PARAM_ELECTION_REG_PERIOD()), 14 days);
        assertEq(constitution.getParameter(constitution.PARAM_ELECTION_VOTE_PERIOD()), 7 days);
        assertEq(constitution.getParameter(constitution.PARAM_DISSOLUTION_ELECTION_DEADLINE()), 60 days);
        assertEq(constitution.getParameter(constitution.PARAM_AMENDMENT_THRESHOLD()), 67);
        assertEq(constitution.getParameter(constitution.PARAM_EMERGENCY_AMEND_THRESHOLD()), 75);
        assertEq(constitution.getParameter(constitution.PARAM_EMERGENCY_AMEND_DURATION()), 365 days);
        assertEq(constitution.getParameter(constitution.PARAM_CROWN_APPOINT_DEADLINE()), 7 days);
        assertEq(constitution.getParameter(constitution.PARAM_CROWN_JUSTICE_APPOINT_DEADLINE()), 14 days);
        assertEq(constitution.getParameter(constitution.PARAM_CONFIDENCE_VOTE_PERIOD()), 14 days);
        assertEq(constitution.getParameter(constitution.PARAM_MAJLIS_QUORUM()), 50);
        assertEq(constitution.getParameter(constitution.PARAM_SENATE_QUORUM()), 50);
        assertEq(constitution.getParameter(constitution.PARAM_MIN_VOTING_PERIOD()), 3 days);
        assertEq(constitution.getParameter(constitution.PARAM_PETITION_TIMEOUT()), 30 days);
        assertEq(constitution.getParameter(constitution.PARAM_FACT_CERT_PERIOD()), 14 days);
        assertEq(constitution.getParameter(constitution.PARAM_BY_ELECTION_DEADLINE()), 90 days);
        assertEq(constitution.getParameter(constitution.PARAM_VACANCY_VOTE_PERIOD()), 14 days);
        assertEq(constitution.getParameter(constitution.PARAM_COURT_LIVENESS_PERIOD()), 7 days);
        assertEq(constitution.getParameter(constitution.PARAM_COURT_INACTIVITY_PERIOD()), 14 days);
        assertEq(constitution.getParameter(constitution.PARAM_COUNCIL_TERM()), 4 * 365 days);
        assertEq(constitution.getParameter(constitution.PARAM_SENATE_SELECTION_REG_PERIOD()), 14 days);
        assertEq(constitution.getParameter(constitution.PARAM_SENATE_SELECTION_VOTE_PERIOD()), 7 days);
        assertEq(constitution.getParameter(constitution.PARAM_SUCCESSION_REFERENDUM_DEADLINE()), 365 days);
        assertEq(constitution.getParameter(constitution.PARAM_DEPUTY_DESIGNATION_DEADLINE()), 14 days);
        assertEq(constitution.getParameter(constitution.PARAM_TOTAL_MAJLIS_SEATS()), 290);
        assertEq(constitution.getParameter(constitution.PARAM_CROWN_SEAT_DEADLINE()), 14 days);
    }

    function test_happyCase_protectedParameters() public view {
        assertTrue(constitution.isProtectedParameter(constitution.PARAM_JUSTICE_TERM()));
        assertTrue(constitution.isProtectedParameter(constitution.PARAM_COURT_QUORUM()));
        assertTrue(constitution.isProtectedParameter(constitution.PARAM_JUSTICE_COUNT()));
        assertTrue(constitution.isProtectedParameter(constitution.PARAM_AMENDMENT_THRESHOLD()));
        assertTrue(constitution.isProtectedParameter(constitution.PARAM_EMERGENCY_AMEND_THRESHOLD()));
        assertTrue(constitution.isProtectedParameter(constitution.PARAM_ELECTION_REG_PERIOD()));
        assertTrue(constitution.isProtectedParameter(constitution.PARAM_ELECTION_VOTE_PERIOD()));
        assertTrue(constitution.isProtectedParameter(constitution.PARAM_DISSOLUTION_ELECTION_DEADLINE()));
        assertTrue(constitution.isProtectedParameter(constitution.PARAM_MAJLIS_TERM()));
        assertTrue(constitution.isProtectedParameter(constitution.PARAM_SENATE_TERM()));
        assertTrue(constitution.isProtectedParameter(constitution.PARAM_CONFIDENCE_VOTE_PERIOD()));
        assertTrue(constitution.isProtectedParameter(constitution.PARAM_EMERGENCY_AMEND_DURATION()));
        assertTrue(constitution.isProtectedParameter(constitution.PARAM_COUNCIL_TERM()));
        assertTrue(constitution.isProtectedParameter(constitution.PARAM_TOTAL_MAJLIS_SEATS()));
    }

    function test_happyCase_unprotectedParameters() public view {
        assertFalse(constitution.isProtectedParameter(constitution.PARAM_CONFIDENCE_HONEYMOON()));
        assertFalse(constitution.isProtectedParameter(constitution.PARAM_CROWN_LAW_DEADLINE()));
        assertFalse(constitution.isProtectedParameter(constitution.PARAM_MIN_VOTING_PERIOD()));
        assertFalse(constitution.isProtectedParameter(constitution.PARAM_FACT_CERT_PERIOD()));
    }

    function test_happyCase_getParameter_unknownKey() public view {
        assertEq(constitution.getParameter(keccak256("NONEXISTENT")), 0);
    }

    function test_happyCase_getContract_uninitialized() public view {
        assertEq(constitution.getContract(CONTRACT_CROWN), address(0));
    }

    function test_happyCase_getRole_vacant() public view {
        assertEq(constitution.getRole(constitution.ROLE_MONARCH()), address(0));
    }

    function test_happyCase_hasRole_false() public view {
        assertFalse(constitution.hasRole(constitution.ROLE_MONARCH(), unauthorized));
    }

    // ─── Initialize: happy paths ─────────────────────────────────────────

    function test_happyCase_initialize() public {
        _etchAll();
        vm.prank(deployer);
        constitution.initialize(_contractNames(), _contractAddrs());

        assertTrue(constitution.initialized());
        assertEq(constitution.getContract(CONTRACT_CROWN), crownContract);
        assertEq(constitution.getContract(CONTRACT_PARLIAMENT), parliamentContract);
        assertEq(constitution.getContract(CONTRACT_REFERENDUM), referendumContract);
        assertEq(constitution.getContract(CONTRACT_BUDGET), budgetContract);
        assertEq(constitution.getContract(CONTRACT_PROVINCIAL_COUNCIL), pcContract);
        assertEq(constitution.getContract(CONTRACT_BALLOT_VERIFIER), verifierContract);
    }

    function test_happyCase_initialize_emitsContractRegistered() public {
        _etchAll();
        vm.expectEmit(true, true, false, true);
        emit ContractRegistered(CONTRACT_CITIZEN_REGISTRY, registryContract);

        vm.prank(deployer);
        constitution.initialize(_contractNames(), _contractAddrs());
    }

    function test_happyCase_initialize_emitsInitialized() public {
        _etchAll();
        vm.expectEmit(false, false, false, true);
        emit Initialized();

        vm.prank(deployer);
        constitution.initialize(_contractNames(), _contractAddrs());
    }

    function test_happyCase_initialize_keepsDeployer() public {
        _etchAll();
        vm.prank(deployer);
        constitution.initialize(_contractNames(), _contractAddrs());
        assertEq(constitution.deployer(), deployer);
    }

    // ─── Initialize: revert paths ────────────────────────────────────────

    function test_revert_initialize_notDeployer() public {
        vm.prank(unauthorized);
        vm.expectRevert(Constitution.NotDeployer.selector);
        constitution.initialize(_contractNames(), _contractAddrs());
    }

    function test_revert_initialize_alreadyInitialized() public {
        _etchAll();
        vm.prank(deployer);
        constitution.initialize(_contractNames(), _contractAddrs());

        vm.prank(deployer);
        vm.expectRevert(Constitution.AlreadyInitialized.selector);
        constitution.initialize(_contractNames(), _contractAddrs());
    }

    function test_revert_initialize_lengthMismatch() public {
        bytes32[] memory names = new bytes32[](2);
        address[] memory addrs = new address[](1);
        names[0] = CONTRACT_CROWN;
        names[1] = CONTRACT_PARLIAMENT;
        addrs[0] = crownContract;

        vm.prank(deployer);
        vm.expectRevert(Constitution.InvalidParameter.selector);
        constitution.initialize(names, addrs);
    }

    function test_revert_initialize_zeroAddress() public {
        address[] memory addrs = _contractAddrs();
        addrs[0] = address(0);

        vm.prank(deployer);
        vm.expectRevert(Constitution.ZeroAddress.selector);
        constitution.initialize(_contractNames(), addrs);
    }

    function test_revert_initialize_eoaAddress() public {
        // No vm.etch — all addresses are EOAs (no code)
        vm.prank(deployer);
        vm.expectRevert(Constitution.InvalidAddress.selector);
        constitution.initialize(_contractNames(), _contractAddrs());
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO B: Initialized Constitution
// ═══════════════════════════════════════════════════════════════════════════

/// @notice Tests for Constitution.sol after initialize() has been called.
///         Covers: setRole, amendParameter, amendContract, finalizeSetup, views.
contract ConstitutionInitializedTest is Test {
    event RoleChanged(bytes32 indexed role, address indexed oldHolder, address indexed newHolder);
    event ParameterAmended(bytes32 indexed key, uint256 oldValue, uint256 newValue);
    event ContractAmended(bytes32 indexed name, address indexed oldAddr, address indexed newAddr);
    event SetupFinalized();

    Constitution internal constitution;

    address internal deployer = makeAddr("deployer");
    address internal unauthorized = makeAddr("unauthorized");
    address internal monarch = makeAddr("monarch");
    address internal pm = makeAddr("pm");

    // Mock contracts
    address internal registryContract = makeAddr("registryContract");
    address internal crownContract = makeAddr("crownContract");
    address internal parliamentContract = makeAddr("parliamentContract");
    address internal executiveContract = makeAddr("executiveContract");
    address internal courtContract = makeAddr("courtContract");
    address internal electionContract = makeAddr("electionContract");
    address internal referendumContract = makeAddr("referendumContract");
    address internal budgetContract = makeAddr("budgetContract");
    address internal pcContract = makeAddr("pcContract");
    address internal verifierContract = makeAddr("verifierContract");

    // Cached keys
    bytes32 internal ROLE_MONARCH;
    bytes32 internal ROLE_PRIME_MINISTER;
    bytes32 internal ROLE_AUDIT_HEAD;
    bytes32 internal PARAM_MAJLIS_TERM;
    bytes32 internal CONTRACT_CROWN;

    function setUp() public {
        vm.prank(deployer);
        constitution = new Constitution();

        ROLE_MONARCH = constitution.ROLE_MONARCH();
        ROLE_PRIME_MINISTER = constitution.ROLE_PRIME_MINISTER();
        ROLE_AUDIT_HEAD = constitution.ROLE_AUDIT_HEAD();
        PARAM_MAJLIS_TERM = constitution.PARAM_MAJLIS_TERM();
        CONTRACT_CROWN = constitution.CONTRACT_CROWN();

        // Build arrays and initialize
        bytes32[] memory names = new bytes32[](10);
        address[] memory addrs = new address[](10);
        names[0] = constitution.CONTRACT_CITIZEN_REGISTRY(); addrs[0] = registryContract;
        names[1] = CONTRACT_CROWN;                           addrs[1] = crownContract;
        names[2] = constitution.CONTRACT_PARLIAMENT();       addrs[2] = parliamentContract;
        names[3] = constitution.CONTRACT_EXECUTIVE();        addrs[3] = executiveContract;
        names[4] = constitution.CONTRACT_SUPREME_COURT();    addrs[4] = courtContract;
        names[5] = constitution.CONTRACT_ELECTION();         addrs[5] = electionContract;
        names[6] = constitution.CONTRACT_REFERENDUM();       addrs[6] = referendumContract;
        names[7] = constitution.CONTRACT_BUDGET();           addrs[7] = budgetContract;
        names[8] = constitution.CONTRACT_PROVINCIAL_COUNCIL(); addrs[8] = pcContract;
        names[9] = constitution.CONTRACT_BALLOT_VERIFIER();  addrs[9] = verifierContract;

        for (uint256 i = 0; i < addrs.length; i++) {
            vm.etch(addrs[i], hex"00");
        }

        vm.prank(deployer);
        constitution.initialize(names, addrs);
    }

    // ─── setRole: happy paths ────────────────────────────────────────────

    function test_happyCase_setRole_byCrown() public {
        vm.prank(crownContract);
        constitution.setRole(ROLE_MONARCH, monarch);

        assertEq(constitution.getRole(ROLE_MONARCH), monarch);
        assertTrue(constitution.hasRole(ROLE_MONARCH, monarch));
    }

    function test_happyCase_setRole_emitsEvent() public {
        vm.expectEmit(true, true, true, true);
        emit RoleChanged(ROLE_MONARCH, address(0), monarch);

        vm.prank(crownContract);
        constitution.setRole(ROLE_MONARCH, monarch);
    }

    function test_happyCase_setRole_changeHolder() public {
        vm.prank(crownContract);
        constitution.setRole(ROLE_MONARCH, monarch);

        address newMonarch = makeAddr("newMonarch");
        vm.prank(crownContract);
        constitution.setRole(ROLE_MONARCH, newMonarch);

        assertEq(constitution.getRole(ROLE_MONARCH), newMonarch);
        assertFalse(constitution.hasRole(ROLE_MONARCH, monarch));
        assertTrue(constitution.hasRole(ROLE_MONARCH, newMonarch));
    }

    function test_happyCase_setRole_vacate() public {
        vm.prank(executiveContract);
        constitution.setRole(ROLE_PRIME_MINISTER, pm);

        vm.prank(executiveContract);
        constitution.setRole(ROLE_PRIME_MINISTER, address(0));

        assertEq(constitution.getRole(ROLE_PRIME_MINISTER), address(0));
    }

    function test_happyCase_setRole_byExecutive() public {
        vm.prank(executiveContract);
        constitution.setRole(ROLE_PRIME_MINISTER, pm);
        assertEq(constitution.getRole(ROLE_PRIME_MINISTER), pm);
    }

    function test_happyCase_setRole_byReferendum() public {
        vm.prank(referendumContract);
        constitution.setRole(ROLE_MONARCH, monarch);
        assertEq(constitution.getRole(ROLE_MONARCH), monarch);
    }

    // ─── setRole: AUDIT_HEAD special path (Art. IX.4) ────────────────────

    function test_happyCase_setRole_auditHead_byBudget() public {
        address auditHead = makeAddr("auditHead");
        vm.prank(budgetContract);
        constitution.setRole(ROLE_AUDIT_HEAD, auditHead);
        assertEq(constitution.getRole(ROLE_AUDIT_HEAD), auditHead);
    }

    function test_happyCase_setRole_auditHead_byReferendum() public {
        address auditHead = makeAddr("auditHead");
        vm.prank(referendumContract);
        constitution.setRole(ROLE_AUDIT_HEAD, auditHead);
        assertEq(constitution.getRole(ROLE_AUDIT_HEAD), auditHead);
    }

    function test_revert_setRole_auditHead_byCrown() public {
        vm.prank(crownContract);
        vm.expectRevert(Constitution.NotAuthorized.selector);
        constitution.setRole(ROLE_AUDIT_HEAD, makeAddr("auditHead"));
    }

    function test_revert_setRole_auditHead_byExecutive() public {
        vm.prank(executiveContract);
        vm.expectRevert(Constitution.NotAuthorized.selector);
        constitution.setRole(ROLE_AUDIT_HEAD, makeAddr("auditHead"));
    }

    function test_revert_setRole_auditHead_byUnauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert(Constitution.NotAuthorized.selector);
        constitution.setRole(ROLE_AUDIT_HEAD, makeAddr("auditHead"));
    }

    function test_revert_setRole_auditHead_byParliament() public {
        vm.prank(parliamentContract);
        vm.expectRevert(Constitution.NotAuthorized.selector);
        constitution.setRole(ROLE_AUDIT_HEAD, makeAddr("auditHead"));
    }

    // ─── setRole: revert paths ───────────────────────────────────────────

    function test_revert_setRole_byUnauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert(Constitution.NotAuthorized.selector);
        constitution.setRole(ROLE_MONARCH, monarch);
    }

    function test_revert_setRole_byParliament() public {
        vm.prank(parliamentContract);
        vm.expectRevert(Constitution.NotAuthorized.selector);
        constitution.setRole(ROLE_PRIME_MINISTER, pm);
    }

    function test_revert_setRole_byElection() public {
        vm.prank(electionContract);
        vm.expectRevert(Constitution.NotAuthorized.selector);
        constitution.setRole(ROLE_MONARCH, monarch);
    }

    function test_revert_setRole_byCourt() public {
        vm.prank(courtContract);
        vm.expectRevert(Constitution.NotAuthorized.selector);
        constitution.setRole(ROLE_MONARCH, monarch);
    }

    // ─── amendParameter: happy paths ─────────────────────────────────────

    function test_happyCase_amendParameter() public {
        uint256 newValue = 5 * 365 days;
        vm.prank(referendumContract);
        constitution.amendParameter(PARAM_MAJLIS_TERM, newValue);
        assertEq(constitution.getParameter(PARAM_MAJLIS_TERM), newValue);
    }

    function test_happyCase_amendParameter_emitsEvent() public {
        uint256 oldValue = constitution.getParameter(PARAM_MAJLIS_TERM);
        uint256 newValue = 5 * 365 days;

        vm.expectEmit(true, false, false, true);
        emit ParameterAmended(PARAM_MAJLIS_TERM, oldValue, newValue);

        vm.prank(referendumContract);
        constitution.amendParameter(PARAM_MAJLIS_TERM, newValue);
    }

    function test_boundary_amendParameter_toZero() public {
        vm.prank(referendumContract);
        constitution.amendParameter(PARAM_MAJLIS_TERM, 0);
        assertEq(constitution.getParameter(PARAM_MAJLIS_TERM), 0);
    }

    function test_boundary_amendParameter_toMaxUint() public {
        vm.prank(referendumContract);
        constitution.amendParameter(PARAM_MAJLIS_TERM, type(uint256).max);
        assertEq(constitution.getParameter(PARAM_MAJLIS_TERM), type(uint256).max);
    }

    // ─── amendParameter: revert paths ────────────────────────────────────

    function test_revert_amendParameter_byCrown() public {
        vm.prank(crownContract);
        vm.expectRevert(Constitution.NotAuthorized.selector);
        constitution.amendParameter(PARAM_MAJLIS_TERM, 5 * 365 days);
    }

    function test_revert_amendParameter_byExecutive() public {
        vm.prank(executiveContract);
        vm.expectRevert(Constitution.NotAuthorized.selector);
        constitution.amendParameter(PARAM_MAJLIS_TERM, 5 * 365 days);
    }

    function test_revert_amendParameter_byUnauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert(Constitution.NotAuthorized.selector);
        constitution.amendParameter(PARAM_MAJLIS_TERM, 5 * 365 days);
    }

    function test_revert_amendParameter_byParliament() public {
        vm.prank(parliamentContract);
        vm.expectRevert(Constitution.NotAuthorized.selector);
        constitution.amendParameter(PARAM_MAJLIS_TERM, 5 * 365 days);
    }

    function test_revert_amendParameter_byBudget() public {
        vm.prank(budgetContract);
        vm.expectRevert(Constitution.NotAuthorized.selector);
        constitution.amendParameter(PARAM_MAJLIS_TERM, 5 * 365 days);
    }

    // ─── amendContract: happy paths ──────────────────────────────────────

    function test_happyCase_amendContract() public {
        address newCrown = makeAddr("newCrown");
        vm.prank(referendumContract);
        constitution.amendContract(CONTRACT_CROWN, newCrown);
        assertEq(constitution.getContract(CONTRACT_CROWN), newCrown);
    }

    function test_happyCase_amendContract_emitsEvent() public {
        address newCrown = makeAddr("newCrown");
        vm.expectEmit(true, true, true, true);
        emit ContractAmended(CONTRACT_CROWN, crownContract, newCrown);

        vm.prank(referendumContract);
        constitution.amendContract(CONTRACT_CROWN, newCrown);
    }

    function test_happyCase_amendContract_toZeroAddress() public {
        vm.prank(referendumContract);
        constitution.amendContract(CONTRACT_CROWN, address(0));
        assertEq(constitution.getContract(CONTRACT_CROWN), address(0));
    }

    // ─── amendContract: revert paths ─────────────────────────────────────

    function test_revert_amendContract_byCrown() public {
        vm.prank(crownContract);
        vm.expectRevert(Constitution.NotAuthorized.selector);
        constitution.amendContract(CONTRACT_CROWN, makeAddr("newCrown"));
    }

    function test_revert_amendContract_byExecutive() public {
        vm.prank(executiveContract);
        vm.expectRevert(Constitution.NotAuthorized.selector);
        constitution.amendContract(CONTRACT_CROWN, makeAddr("newCrown"));
    }

    function test_revert_amendContract_byUnauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert(Constitution.NotAuthorized.selector);
        constitution.amendContract(CONTRACT_CROWN, makeAddr("newCrown"));
    }

    function test_revert_amendContract_byParliament() public {
        vm.prank(parliamentContract);
        vm.expectRevert(Constitution.NotAuthorized.selector);
        constitution.amendContract(CONTRACT_CROWN, makeAddr("newCrown"));
    }

    function test_revert_amendContract_byBudget() public {
        vm.prank(budgetContract);
        vm.expectRevert(Constitution.NotAuthorized.selector);
        constitution.amendContract(CONTRACT_CROWN, makeAddr("newCrown"));
    }

    // ─── finalizeSetup: happy paths ──────────────────────────────────────

    function test_happyCase_finalizeSetup_byDeployer() public {
        vm.prank(deployer);
        constitution.finalizeSetup();
        assertEq(constitution.deployer(), address(0));
    }

    function test_happyCase_finalizeSetup_byCrown() public {
        vm.prank(crownContract);
        constitution.finalizeSetup();
        assertEq(constitution.deployer(), address(0));
    }

    function test_happyCase_finalizeSetup_emitsEvent() public {
        vm.expectEmit(false, false, false, true);
        emit SetupFinalized();

        vm.prank(deployer);
        constitution.finalizeSetup();
    }

    // ─── finalizeSetup: revert paths ─────────────────────────────────────

    function test_revert_finalizeSetup_byUnauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert(Constitution.NotAuthorized.selector);
        constitution.finalizeSetup();
    }

    function test_revert_finalizeSetup_alreadyFinalized() public {
        vm.prank(deployer);
        constitution.finalizeSetup();

        vm.prank(deployer);
        vm.expectRevert(Constitution.AlreadyFinalized.selector);
        constitution.finalizeSetup();
    }

    function test_revert_finalizeSetup_byExecutive() public {
        vm.prank(executiveContract);
        vm.expectRevert(Constitution.NotAuthorized.selector);
        constitution.finalizeSetup();
    }

    function test_revert_finalizeSetup_byParliament() public {
        vm.prank(parliamentContract);
        vm.expectRevert(Constitution.NotAuthorized.selector);
        constitution.finalizeSetup();
    }

    function test_revert_finalizeSetup_byReferendum() public {
        vm.prank(referendumContract);
        vm.expectRevert(Constitution.NotAuthorized.selector);
        constitution.finalizeSetup();
    }

    function test_revert_finalizeSetup_byBudget() public {
        vm.prank(budgetContract);
        vm.expectRevert(Constitution.NotAuthorized.selector);
        constitution.finalizeSetup();
    }

    // ─── Contract registry views ─────────────────────────────────────────

    function test_happyCase_getContract_afterInit() public view {
        assertEq(constitution.getContract(CONTRACT_CROWN), crownContract);
        assertEq(constitution.getContract(constitution.CONTRACT_EXECUTIVE()), executiveContract);
        assertEq(constitution.getContract(constitution.CONTRACT_BUDGET()), budgetContract);
        assertEq(constitution.getContract(constitution.CONTRACT_PROVINCIAL_COUNCIL()), pcContract);
        assertEq(constitution.getContract(constitution.CONTRACT_BALLOT_VERIFIER()), verifierContract);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO C: Finalized Constitution (deployer wiped)
// ═══════════════════════════════════════════════════════════════════════════

/// @notice Tests for Constitution.sol after finalizeSetup() has been called.
///         Deployer is address(0), can no longer call deployer-gated functions.
///         But role/parameter/contract operations still work normally.
contract ConstitutionFinalizedTest is Test {
    Constitution internal constitution;

    address internal deployer = makeAddr("deployer");
    address internal crownContract = makeAddr("crownContract");
    address internal referendumContract = makeAddr("referendumContract");
    address internal executiveContract = makeAddr("executiveContract");
    address internal budgetContract = makeAddr("budgetContract");
    address internal monarch = makeAddr("monarch");

    bytes32 internal ROLE_MONARCH;
    bytes32 internal PARAM_MAJLIS_TERM;
    bytes32 internal CONTRACT_CROWN;

    function setUp() public {
        vm.prank(deployer);
        constitution = new Constitution();

        ROLE_MONARCH = constitution.ROLE_MONARCH();
        PARAM_MAJLIS_TERM = constitution.PARAM_MAJLIS_TERM();
        CONTRACT_CROWN = constitution.CONTRACT_CROWN();

        bytes32[] memory names = new bytes32[](10);
        address[] memory addrs = new address[](10);
        names[0] = constitution.CONTRACT_CITIZEN_REGISTRY(); addrs[0] = makeAddr("reg");
        names[1] = CONTRACT_CROWN;                           addrs[1] = crownContract;
        names[2] = constitution.CONTRACT_PARLIAMENT();       addrs[2] = makeAddr("parl");
        names[3] = constitution.CONTRACT_EXECUTIVE();        addrs[3] = executiveContract;
        names[4] = constitution.CONTRACT_SUPREME_COURT();    addrs[4] = makeAddr("court");
        names[5] = constitution.CONTRACT_ELECTION();         addrs[5] = makeAddr("elec");
        names[6] = constitution.CONTRACT_REFERENDUM();       addrs[6] = referendumContract;
        names[7] = constitution.CONTRACT_BUDGET();           addrs[7] = budgetContract;
        names[8] = constitution.CONTRACT_PROVINCIAL_COUNCIL(); addrs[8] = makeAddr("pc");
        names[9] = constitution.CONTRACT_BALLOT_VERIFIER();  addrs[9] = makeAddr("verif");

        for (uint256 i = 0; i < addrs.length; i++) {
            vm.etch(addrs[i], hex"00");
        }

        vm.prank(deployer);
        constitution.initialize(names, addrs);

        vm.prank(deployer);
        constitution.finalizeSetup();
    }

    function test_happyCase_deployerWiped() public view {
        assertEq(constitution.deployer(), address(0));
    }

    function test_revert_finalizeSetup_cannotCallAgain() public {
        vm.prank(deployer);
        vm.expectRevert(Constitution.AlreadyFinalized.selector);
        constitution.finalizeSetup();
    }

    function test_happyCase_setRole_stillWorks() public {
        vm.prank(crownContract);
        constitution.setRole(ROLE_MONARCH, monarch);
        assertEq(constitution.getRole(ROLE_MONARCH), monarch);
    }

    function test_happyCase_amendParameter_stillWorks() public {
        vm.prank(referendumContract);
        constitution.amendParameter(PARAM_MAJLIS_TERM, 5 * 365 days);
        assertEq(constitution.getParameter(PARAM_MAJLIS_TERM), 5 * 365 days);
    }

    function test_happyCase_amendContract_stillWorks() public {
        address newCrown = makeAddr("newCrown");
        vm.prank(referendumContract);
        constitution.amendContract(CONTRACT_CROWN, newCrown);
        assertEq(constitution.getContract(CONTRACT_CROWN), newCrown);
    }
}
