// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./helpers/MixinMajlis.sol";
import "./helpers/MixinJustices.sol";

/// @title ReferendumBaseTest
/// @notice Tests for Referendum.sol — amendment proposals, referendums, enactment, structural
///         amendments, nullifiers. No court certification needed; inherits MixinMajlis.
///
///         All Parliament-gated calls (proposeAmendment, startReferendum, enactEmergencyAmendment,
///         confirmEmergencyAmendment) go through real Majlis governance actions.
///         Permissionless calls (castReferendumVote, finalizeReferendum, enactAmendment,
///         expireEmergencyAmendment) are called directly.
///
/// Logical progression:
///   1. Construction
///   2. Propose amendment
///   3. Start referendum
///   4. Referendum voting
///   5. Finalize referendum
///   6. Enact amendment
///   7. Emergency revert paths (no cert needed)
///   8. Boundary conditions
///   9. Structural amendments (role/contract)
///  10. Nullifier verification
///  11. CSCA key hash validation
contract ReferendumBaseTest is MixinMajlis {
    event AmendmentProposed(uint256 indexed amendmentId, bytes32 amendmentHash, address proposer);
    event ReferendumStarted(uint256 indexed amendmentId, uint256 votingEnd);
    event ReferendumVoteCast(uint256 indexed amendmentId, uint256 indexed nullifier, bool support);
    event ReferendumPassed(uint256 indexed amendmentId, uint256 yesVotes, uint256 noVotes);
    event ReferendumFailed(uint256 indexed amendmentId, uint256 yesVotes, uint256 noVotes);
    event AmendmentEnacted(uint256 indexed amendmentId, bytes32 parameterKey, uint256 newValue, address targetAddress);

    bytes32 internal PARAM_MAJLIS_TERM;
    bytes32 internal PARAM_CONFIDENCE_HONEYMOON;

    address internal unauthorized = makeAddr("unauthorized");

    function setUp() public override {
        super.setUp();
        _setupMajlis();

        PARAM_MAJLIS_TERM = constitution.PARAM_MAJLIS_TERM();
        PARAM_CONFIDENCE_HONEYMOON = constitution.PARAM_CONFIDENCE_HONEYMOON();
    }

    // ─── Helpers ──────────────────────────────────────────────────────────

    /// @dev Propose an amendment via Majlis governance action. Returns amendmentId from state.
    function _proposeAmendment() internal returns (uint256 amendmentId) {
        _executeMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.proposeAmendment, (
                keccak256("Extend Majlis term to 5 years"),
                PARAM_MAJLIS_TERM,
                5 * 365 days
            ))
        );
        amendmentId = referendum.amendmentCount() - 1;
    }

    /// @dev Start a referendum via Majlis governance action.
    function _startReferendum(uint256 amendmentId) internal {
        _executeMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.startReferendum, (amendmentId, 7 days))
        );
    }

    /// @dev Propose and start a referendum via two Majlis governance actions.
    function _proposeAndStartReferendum() internal returns (uint256 amendmentId) {
        amendmentId = _proposeAmendment();
        _startReferendum(amendmentId);
    }

    /// @dev Cast votes and finalize. 3 yes, 2 no → passes.
    function _passReferendum(uint256 amendmentId) internal {
        _castReferendumVote(citizen1, amendmentId, true);
        _castReferendumVote(citizen2, amendmentId, true);
        _castReferendumVote(citizen3, amendmentId, true);
        _castReferendumVote(citizen4, amendmentId, false);
        _castReferendumVote(citizen5, amendmentId, false);

        _warpForward(7 days);
        referendum.finalizeReferendum(amendmentId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 1. CONSTRUCTION
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_constructor() public view {
        assertEq(address(referendum.constitution()), address(constitution));
        assertEq(referendum.amendmentCount(), 0);
    }

    function test_revert_constructor_zeroAddress() public {
        vm.expectRevert(Referendum.ZeroAddress.selector);
        new Referendum(address(0));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2. PROPOSE AMENDMENT
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_proposeAmendment() public {
        uint256 id = _proposeAmendment();

        assertEq(id, 0);
        assertEq(referendum.amendmentCount(), 1);
        assertEq(uint256(referendum.getAmendmentStatus(0)), uint256(Referendum.AmendmentStatus.Proposed));
    }

    function test_happyCase_proposeAmendment_emitsEvent() public {
        bytes32 hash = keccak256("Extend Majlis term to 5 years");

        uint256 actionId = _prepareMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.proposeAmendment, (hash, PARAM_MAJLIS_TERM, 5 * 365 days))
        );

        vm.expectEmit(true, false, false, true);
        emit AmendmentProposed(0, hash, address(parliament));

        parliament.executeGovernanceAction(actionId);
    }

    function test_modifier_proposeAmendment_onlyParliament() public {
        vm.prank(unauthorized);
        vm.expectRevert(Referendum.NotAuthorized.selector);
        referendum.proposeAmendment(keccak256("test"), PARAM_MAJLIS_TERM, 0);
    }

    function test_modifier_proposeRoleAmendment_onlyParliament() public {
        bytes32 roleKey = constitution.ROLE_MONARCH();
        vm.prank(unauthorized);
        vm.expectRevert(Referendum.NotAuthorized.selector);
        referendum.proposeRoleAmendment(keccak256("test"), roleKey, address(0));
    }

    function test_modifier_proposeContractAmendment_onlyParliament() public {
        bytes32 contractKey = constitution.CONTRACT_CROWN();
        vm.prank(unauthorized);
        vm.expectRevert(Referendum.NotAuthorized.selector);
        referendum.proposeContractAmendment(keccak256("test"), contractKey, address(0));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 3. START REFERENDUM
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_startReferendum() public {
        uint256 id = _proposeAmendment();
        _startReferendum(id);

        assertEq(uint256(referendum.getAmendmentStatus(id)), uint256(Referendum.AmendmentStatus.Voting));
    }

    function test_happyCase_startReferendum_emitsEvent() public {
        uint256 id = _proposeAmendment();

        uint256 actionId = _prepareMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.startReferendum, (id, 7 days))
        );

        vm.expectEmit(true, false, false, true);
        emit ReferendumStarted(id, block.timestamp + 7 days);

        parliament.executeGovernanceAction(actionId);
    }

    function test_revert_startReferendum_notProposed() public {
        uint256 id = _proposeAndStartReferendum();

        // Inner revert: NotInStatus(Proposed)
        uint256 actionId = _prepareMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.startReferendum, (id, 7 days))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_modifier_startReferendum_onlyParliament() public {
        uint256 id = _proposeAmendment();

        vm.prank(unauthorized);
        vm.expectRevert(Referendum.NotAuthorized.selector);
        referendum.startReferendum(id, 7 days);
    }

    function test_revert_startReferendum_durationTooShort() public {
        uint256 id = _proposeAmendment();

        // Inner revert: VotingDurationTooShort
        uint256 actionId = _prepareMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.startReferendum, (id, 1 days))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_revert_startReferendum_invalidAmendment() public {
        // Inner revert: InvalidAmendment
        uint256 actionId = _prepareMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.startReferendum, (99, 7 days))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. REFERENDUM VOTING
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_castVote() public {
        uint256 id = _proposeAndStartReferendum();

        _castReferendumVote(citizen1, id, true);

        bytes32 idHash = _identityHash(citizen1);
        uint256 nullifier = uint256(keccak256(abi.encodePacked(idHash, id)));
        assertTrue(referendum.isNullifierUsed(id, nullifier));
    }

    function test_happyCase_castVote_emitsEvent() public {
        uint256 id = _proposeAndStartReferendum();

        bytes32 idHash = _identityHash(citizen1);
        uint256 expectedNullifier = uint256(keccak256(abi.encodePacked(idHash, id)));

        vm.expectEmit(true, true, false, true);
        emit ReferendumVoteCast(id, expectedNullifier, true);

        _castReferendumVote(citizen1, id, true);
    }

    function test_revert_castVote_wrongCitizenship() public {
        uint256 id = _proposeAndStartReferendum();

        (Referendum.ProofPoints memory proof, uint256[23] memory signals) =
            _mockReferendumProof(_identityHash(citizen1), id);
        signals[6] = 0xDEAD; // wrong citizenship

        vm.expectRevert(Referendum.InvalidProof.selector);
        referendum.castReferendumVote(id, true, proof, signals);
    }

    function test_revert_castVote_alreadyVoted() public {
        uint256 id = _proposeAndStartReferendum();

        _castReferendumVote(citizen1, id, true);

        bytes32 idHash = _identityHash(citizen1);
        uint256 expectedNullifier = uint256(keccak256(abi.encodePacked(idHash, id)));

        (Referendum.ProofPoints memory proof, uint256[23] memory signals) =
            _mockReferendumProof(idHash, id);

        vm.expectRevert(abi.encodeWithSelector(Referendum.AlreadyVoted.selector, expectedNullifier));
        referendum.castReferendumVote(id, true, proof, signals);
    }

    function test_revert_castVote_votingEnded() public {
        uint256 id = _proposeAndStartReferendum();

        _warpForward(7 days + 1);

        (Referendum.ProofPoints memory proof, uint256[23] memory signals) =
            _mockReferendumProof(_identityHash(citizen1), id);
        vm.expectRevert(Referendum.VotingNotOpen.selector);
        referendum.castReferendumVote(id, true, proof, signals);
    }

    function test_revert_castVote_notInVotingStatus() public {
        uint256 id = _proposeAmendment();

        (Referendum.ProofPoints memory proof, uint256[23] memory signals) =
            _mockReferendumProof(_identityHash(citizen1), id);
        vm.expectRevert(abi.encodeWithSelector(Referendum.NotInStatus.selector, Referendum.AmendmentStatus.Voting));
        referendum.castReferendumVote(id, true, proof, signals);
    }

    function test_revert_castVote_wrongAmendmentBinding() public {
        uint256 id = _proposeAndStartReferendum();

        (Referendum.ProofPoints memory proof, uint256[23] memory signals) =
            _mockReferendumProof(_identityHash(citizen1), 999);
        vm.expectRevert(Referendum.InvalidElectionBinding.selector);
        referendum.castReferendumVote(id, true, proof, signals);
    }

    function test_revert_castVote_invalidAmendment() public {
        (Referendum.ProofPoints memory proof, uint256[23] memory signals) =
            _mockReferendumProof(_identityHash(citizen1), 99);
        vm.expectRevert(Referendum.InvalidAmendment.selector);
        referendum.castReferendumVote(99, true, proof, signals);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 5. FINALIZE REFERENDUM
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_referendumPassed() public {
        uint256 id = _proposeAndStartReferendum();
        _passReferendum(id);

        assertEq(uint256(referendum.getAmendmentStatus(id)), uint256(Referendum.AmendmentStatus.Approved));
    }

    function test_happyCase_referendumFailed() public {
        uint256 id = _proposeAndStartReferendum();

        _castReferendumVote(citizen1, id, true);
        _castReferendumVote(citizen2, id, true);
        _castReferendumVote(citizen3, id, false);
        _castReferendumVote(citizen4, id, false);
        _castReferendumVote(citizen5, id, false);

        _warpForward(7 days);
        referendum.finalizeReferendum(id);

        assertEq(uint256(referendum.getAmendmentStatus(id)), uint256(Referendum.AmendmentStatus.Rejected));
    }

    function test_happyCase_referendumTied_fails() public {
        uint256 id = _proposeAndStartReferendum();

        _castReferendumVote(citizen1, id, true);
        _castReferendumVote(citizen2, id, true);
        _castReferendumVote(citizen3, id, false);
        _castReferendumVote(citizen4, id, false);

        _warpForward(7 days);
        referendum.finalizeReferendum(id);

        assertEq(uint256(referendum.getAmendmentStatus(id)), uint256(Referendum.AmendmentStatus.Rejected));
    }

    function test_revert_finalizeReferendum_votingNotEnded() public {
        uint256 id = _proposeAndStartReferendum();

        vm.expectRevert(Referendum.VotingNotOpen.selector);
        referendum.finalizeReferendum(id);
    }

    function test_revert_finalizeReferendum_invalidAmendment() public {
        vm.expectRevert(Referendum.InvalidAmendment.selector);
        referendum.finalizeReferendum(99);
    }

    function test_revert_finalizeReferendum_notVoting() public {
        uint256 id = _proposeAmendment(); // status = Proposed, not Voting
        vm.expectRevert(abi.encodeWithSelector(Referendum.NotInStatus.selector, Referendum.AmendmentStatus.Voting));
        referendum.finalizeReferendum(id);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 6. ENACT AMENDMENT
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_enactAmendment() public {
        uint256 id = _proposeAndStartReferendum();
        _passReferendum(id);

        referendum.enactAmendment(id);

        assertEq(uint256(referendum.getAmendmentStatus(id)), uint256(Referendum.AmendmentStatus.Enacted));
        assertEq(constitution.getParameter(PARAM_MAJLIS_TERM), 5 * 365 days);
    }

    function test_happyCase_enactAmendment_emitsEvent() public {
        uint256 id = _proposeAndStartReferendum();
        _passReferendum(id);

        vm.expectEmit(true, false, false, true);
        emit AmendmentEnacted(id, PARAM_MAJLIS_TERM, 5 * 365 days, address(0));

        referendum.enactAmendment(id);
    }

    function test_revert_enactAmendment_notApproved() public {
        uint256 id = _proposeAmendment();

        vm.expectRevert(Referendum.AmendmentNotApproved.selector);
        referendum.enactAmendment(id);
    }

    function test_revert_enactAmendment_invalidAmendment() public {
        vm.expectRevert(Referendum.InvalidAmendment.selector);
        referendum.enactAmendment(99);
    }

    function test_happyCase_enactAmendment_textOnly() public {
        _executeMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.proposeAmendment, (
                keccak256("Declare national language"),
                bytes32(0),
                0
            ))
        );
        uint256 id = referendum.amendmentCount() - 1;

        _startReferendum(id);

        _castReferendumVote(citizen1, id, true);
        _castReferendumVote(citizen2, id, true);
        _castReferendumVote(citizen3, id, true);

        _warpForward(7 days);
        referendum.finalizeReferendum(id);
        referendum.enactAmendment(id);

        assertEq(uint256(referendum.getAmendmentStatus(id)), uint256(Referendum.AmendmentStatus.Enacted));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 7. EMERGENCY REVERT PATHS (no court cert needed)
    // ═══════════════════════════════════════════════════════════════════════

    function test_revert_emergencyAmendment_protectedParameter() public {
        // Inner revert: ProtectedParameter(PARAM_MAJLIS_TERM)
        uint256 actionId = _prepareMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.enactEmergencyAmendment, (
                keccak256("Emergency: change election period"),
                PARAM_MAJLIS_TERM,
                6 * 365 days
            ))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_revert_emergencyAmendment_noCertification() public {
        // Inner revert: CourtCertificationRequired (court returns false by default)
        uint256 actionId = _prepareMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.enactEmergencyAmendment, (
                keccak256("Uncertified emergency"),
                PARAM_CONFIDENCE_HONEYMOON,
                180 days
            ))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_revert_expireEmergency_notEmergency() public {
        uint256 id = _proposeAndStartReferendum();
        _passReferendum(id);
        referendum.enactAmendment(id);

        vm.expectRevert(Referendum.NotAuthorized.selector);
        referendum.expireEmergencyAmendment(id);
    }

    function test_modifier_emergencyAmendment_onlyParliament() public {
        vm.prank(unauthorized);
        vm.expectRevert(Referendum.NotAuthorized.selector);
        referendum.enactEmergencyAmendment(
            keccak256("Emergency"),
            PARAM_CONFIDENCE_HONEYMOON,
            0
        );
    }

    function test_revert_confirmEmergencyAmendment_notEmergency() public {
        uint256 id = _proposeAndStartReferendum();
        _passReferendum(id);
        referendum.enactAmendment(id);

        // Inner revert: NotEmergencyAmendment
        uint256 actionId = _prepareMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.confirmEmergencyAmendment, (id))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_happyCase_normalAmendment_noEmergency_noEffect() public {
        assertFalse(referendum.hasActiveEmergency(PARAM_CONFIDENCE_HONEYMOON));

        _executeMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.proposeAmendment, (
                keccak256("Change honeymoon to 120d"),
                PARAM_CONFIDENCE_HONEYMOON,
                120 days
            ))
        );
        uint256 normalId = referendum.amendmentCount() - 1;

        _startReferendum(normalId);
        _castReferendumVote(citizen1, normalId, true);
        _castReferendumVote(citizen2, normalId, true);
        _castReferendumVote(citizen3, normalId, true);
        _warpForward(7 days);
        referendum.finalizeReferendum(normalId);
        referendum.enactAmendment(normalId);

        assertEq(uint256(referendum.getAmendmentStatus(normalId)), uint256(Referendum.AmendmentStatus.Enacted));
        assertEq(constitution.getParameter(PARAM_CONFIDENCE_HONEYMOON), 120 days);
        assertFalse(referendum.hasActiveEmergency(PARAM_CONFIDENCE_HONEYMOON));
    }

    function test_revert_expireEmergencyAmendment_invalidAmendment() public {
        vm.expectRevert(Referendum.InvalidAmendment.selector);
        referendum.expireEmergencyAmendment(99);
    }

    function test_revert_confirmEmergencyAmendment_invalidAmendment() public {
        // Inner revert: InvalidAmendment
        uint256 actionId = _prepareMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.confirmEmergencyAmendment, (99))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_happyCase_expiresAt_zeroForNormalAmendment() public {
        uint256 id = _proposeAmendment();

        (bool emergency,, uint256 expiresAt) = referendum.getAmendmentEmergency(id);
        assertFalse(emergency);
        assertEq(expiresAt, 0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 8. BOUNDARY CONDITIONS
    // ═══════════════════════════════════════════════════════════════════════

    function test_boundary_getAmendmentStatus_invalid() public {
        vm.expectRevert(Referendum.InvalidAmendment.selector);
        referendum.getAmendmentStatus(99);
    }

    function test_boundary_getAmendmentVotes_invalid() public {
        vm.expectRevert(Referendum.InvalidAmendment.selector);
        referendum.getAmendmentVotes(99);
    }

    function test_boundary_getAmendmentEmergency_invalid() public {
        vm.expectRevert(Referendum.InvalidAmendment.selector);
        referendum.getAmendmentEmergency(99);
    }

    function test_boundary_multipleAmendments() public {
        _proposeAmendment();
        _proposeAmendment();

        assertEq(referendum.amendmentCount(), 2);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 9. STRUCTURAL AMENDMENTS (Role/Contract)
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_roleAmendment() public {
        address newMonarch = makeAddr("newMonarch");
        bytes32 roleKey = constitution.ROLE_MONARCH();

        _executeMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.proposeRoleAmendment, (
                keccak256("Transfer Crown to new monarch"),
                roleKey,
                newMonarch
            ))
        );
        uint256 amendmentId = referendum.amendmentCount() - 1;

        _startReferendum(amendmentId);
        _passReferendum(amendmentId);

        referendum.enactAmendment(amendmentId);
        assertEq(constitution.getRole(roleKey), newMonarch);
    }

    function test_happyCase_contractAmendment() public {
        address newCrown = makeAddr("newCrownContract");
        bytes32 contractKey = constitution.CONTRACT_CROWN();

        _executeMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.proposeContractAmendment, (
                keccak256("Replace Crown with President"),
                contractKey,
                newCrown
            ))
        );
        uint256 amendmentId = referendum.amendmentCount() - 1;

        _startReferendum(amendmentId);
        _passReferendum(amendmentId);

        referendum.enactAmendment(amendmentId);
        assertEq(constitution.getContract(contractKey), newCrown);
        assertFalse(constitution.getContract(contractKey) == address(crown));
    }

    function test_happyCase_vacateRoleByReferendum() public {
        bytes32 roleKey = constitution.ROLE_MONARCH();

        _executeMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.proposeRoleAmendment, (
                keccak256("Abolish the Crown - become a republic"),
                roleKey,
                address(0)
            ))
        );
        uint256 amendmentId = referendum.amendmentCount() - 1;

        _startReferendum(amendmentId);
        _passReferendum(amendmentId);

        referendum.enactAmendment(amendmentId);
        assertEq(constitution.getRole(roleKey), address(0));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 10. NULLIFIER VERIFICATION
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_isNullifierUsed() public {
        uint256 id = _proposeAndStartReferendum();

        bytes32 idHash = _identityHash(citizen1);
        uint256 nullifier = uint256(keccak256(abi.encodePacked(idHash, id)));

        assertFalse(referendum.isNullifierUsed(id, nullifier));

        _castReferendumVote(citizen1, id, true);

        assertTrue(referendum.isNullifierUsed(id, nullifier));
    }

    function test_happyCase_differentAmendments_differentNullifiers() public {
        uint256 id1 = _proposeAndStartReferendum();
        _castReferendumVote(citizen1, id1, true);

        bytes32 idHash = _identityHash(citizen1);
        uint256 nullifier1 = uint256(keccak256(abi.encodePacked(idHash, id1)));
        assertTrue(referendum.isNullifierUsed(id1, nullifier1));

        _executeMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.proposeAmendment, (
                keccak256("Second amendment"),
                PARAM_CONFIDENCE_HONEYMOON,
                120 days
            ))
        );
        uint256 id2 = referendum.amendmentCount() - 1;
        _startReferendum(id2);

        uint256 nullifier2 = uint256(keccak256(abi.encodePacked(idHash, id2)));
        assertTrue(nullifier1 != nullifier2);

        _castReferendumVote(citizen1, id2, true);
        assertTrue(referendum.isNullifierUsed(id2, nullifier2));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 11. CSCA KEY HASH VALIDATION
    // ═══════════════════════════════════════════════════════════════════════

    function test_revert_castReferendumVote_wrongCscaKeyHash() public {
        uint256 id = _proposeAndStartReferendum();

        (Referendum.ProofPoints memory proof, uint256[23] memory signals) =
            _mockReferendumProof(_identityHash(citizen1), id);
        signals[12] = 0xBEEF;

        vm.expectRevert(Referendum.InvalidProof.selector);
        referendum.castReferendumVote(id, true, proof, signals);
    }

    function test_revert_castReferendumVote_futureCurrentDate() public {
        uint256 id = _proposeAndStartReferendum();

        (Referendum.ProofPoints memory proof, uint256[23] memory signals) =
            _mockReferendumProof(_identityHash(citizen1), id);
        signals[13] = 20990101;

        vm.expectRevert(Referendum.InvalidProof.selector);
        referendum.castReferendumVote(id, true, proof, signals);
    }
}

/// @title ReferendumEmergencyTest
/// @notice Tests for emergency amendment paths that require real court certification.
///         Inherits MixinMajlis + MixinJustices for governance actions and fact certification.
///
///         All Parliament-gated calls go through real Majlis governance actions.
///
/// Logical progression:
///   1. Emergency amendment lifecycle (enact, expire, reuse)
///   2. Emergency amendment confirmation (Art. VII.5.2)
///   3. Supersede (normal referendum supersedes emergency)
///   4. Stored expiry deadline
///   5. Already-expired/already-confirmed revert paths
contract ReferendumEmergencyTest is MixinMajlis, MixinJustices {
    event EmergencyAmendmentEnacted(uint256 indexed amendmentId, uint256 expiresAt);
    event EmergencyAmendmentExpired(uint256 indexed amendmentId);
    event EmergencyAmendmentSuperseded(uint256 indexed emergencyId, uint256 indexed supersedingId);

    bytes32 internal PARAM_EMERGENCY_DURATION;
    bytes32 internal PARAM_CONFIDENCE_HONEYMOON;

    function setUp() public override {
        super.setUp();
        _setupMajlis();
        _setupSenate();
        _setupJustices();

        PARAM_EMERGENCY_DURATION = constitution.PARAM_EMERGENCY_AMEND_DURATION();
        PARAM_CONFIDENCE_HONEYMOON = constitution.PARAM_CONFIDENCE_HONEYMOON();
    }

    /// @dev Certify an emergency amendment fact via real court process.
    function _certifyEmergency(bytes32 amendmentHash) internal {
        bytes32 certHash = keccak256(abi.encodePacked("EMERGENCY_AMENDMENT", amendmentHash));
        _certifyFact(certHash);
    }

    /// @dev Enact an emergency amendment via Majlis governance action. Returns amendmentId from state.
    function _enactEmergency(bytes32 hash, uint256 newValue) internal returns (uint256 amendmentId) {
        _executeMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.enactEmergencyAmendment, (hash, PARAM_CONFIDENCE_HONEYMOON, newValue))
        );
        amendmentId = referendum.amendmentCount() - 1;
    }

    /// @dev Propose, vote, finalize, and enact a normal referendum on PARAM_CONFIDENCE_HONEYMOON.
    function _enactNormalAmendmentOnHoneymoon(uint256 newValue) internal returns (uint256 amendmentId) {
        _executeMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.proposeAmendment, (
                keccak256(abi.encodePacked("Change honeymoon to", newValue)),
                PARAM_CONFIDENCE_HONEYMOON,
                newValue
            ))
        );
        amendmentId = referendum.amendmentCount() - 1;

        _executeMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.startReferendum, (amendmentId, 7 days))
        );

        _castReferendumVote(citizen1, amendmentId, true);
        _castReferendumVote(citizen2, amendmentId, true);
        _castReferendumVote(citizen3, amendmentId, true);

        _warpForward(7 days);
        referendum.finalizeReferendum(amendmentId);
        referendum.enactAmendment(amendmentId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 1. EMERGENCY AMENDMENT LIFECYCLE
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_emergencyAmendment() public {
        bytes32 hash = keccak256("Emergency: extend honeymoon period");
        _certifyEmergency(hash);

        uint256 id = _enactEmergency(hash, 180 days);

        assertEq(uint256(referendum.getAmendmentStatus(id)), uint256(Referendum.AmendmentStatus.Enacted));
        assertEq(constitution.getParameter(PARAM_CONFIDENCE_HONEYMOON), 180 days);
    }

    function test_happyCase_emergencyAmendment_expires() public {
        bytes32 hash = keccak256("Emergency measure");
        _certifyEmergency(hash);

        uint256 originalValue = constitution.getParameter(PARAM_CONFIDENCE_HONEYMOON);

        uint256 id = _enactEmergency(hash, 180 days);

        assertEq(constitution.getParameter(PARAM_CONFIDENCE_HONEYMOON), 180 days);

        uint256 duration = constitution.getParameter(PARAM_EMERGENCY_DURATION);
        _warpForward(duration);

        referendum.expireEmergencyAmendment(id);

        assertEq(uint256(referendum.getAmendmentStatus(id)), uint256(Referendum.AmendmentStatus.Expired));
        assertEq(constitution.getParameter(PARAM_CONFIDENCE_HONEYMOON), originalValue);
    }

    function test_revert_expireEmergencyAmendment_tooEarly() public {
        bytes32 hash = keccak256("Emergency measure");
        _certifyEmergency(hash);

        uint256 id = _enactEmergency(hash, 180 days);

        vm.expectRevert(Referendum.EmergencyNotExpired.selector);
        referendum.expireEmergencyAmendment(id);
    }

    function test_revert_emergencyAmendment_alreadyActive() public {
        bytes32 hash1 = keccak256("Emergency 1");
        _certifyEmergency(hash1);
        _enactEmergency(hash1, 180 days);

        bytes32 hash2 = keccak256("Emergency 2");
        _certifyEmergency(hash2);

        // Inner revert: EmergencyAlreadyActive(PARAM_CONFIDENCE_HONEYMOON)
        uint256 actionId = _prepareMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.enactEmergencyAmendment, (hash2, PARAM_CONFIDENCE_HONEYMOON, 365 days))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_happyCase_emergencyAmendment_afterExpiry_canReuse() public {
        bytes32 hash1 = keccak256("Emergency 1");
        _certifyEmergency(hash1);

        uint256 id1 = _enactEmergency(hash1, 180 days);

        uint256 duration = constitution.getParameter(PARAM_EMERGENCY_DURATION);
        _warpForward(duration);
        referendum.expireEmergencyAmendment(id1);

        bytes32 hash2 = keccak256("Emergency 2");
        _certifyEmergency(hash2);

        _enactEmergency(hash2, 365 days);
        assertEq(constitution.getParameter(PARAM_CONFIDENCE_HONEYMOON), 365 days);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2. EMERGENCY AMENDMENT CONFIRMATION (Art. VII.5.2)
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_confirmEmergencyAmendment() public {
        bytes32 hash = keccak256("Emergency: extend honeymoon");
        _certifyEmergency(hash);

        uint256 id = _enactEmergency(hash, 180 days);

        _executeMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.confirmEmergencyAmendment, (id))
        );

        assertEq(uint256(referendum.getAmendmentStatus(id)), uint256(Referendum.AmendmentStatus.Confirmed));
        assertEq(constitution.getParameter(PARAM_CONFIDENCE_HONEYMOON), 180 days);
    }

    function test_happyCase_confirmEmergencyAmendment_preventsExpiry() public {
        bytes32 hash = keccak256("Emergency: extend honeymoon");
        _certifyEmergency(hash);

        uint256 id = _enactEmergency(hash, 180 days);

        _executeMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.confirmEmergencyAmendment, (id))
        );

        uint256 duration = constitution.getParameter(PARAM_EMERGENCY_DURATION);
        _warpForward(duration);

        // Status is Confirmed, not Enacted → expiry check fails
        vm.expectRevert(abi.encodeWithSelector(Referendum.NotInStatus.selector, Referendum.AmendmentStatus.Enacted));
        referendum.expireEmergencyAmendment(id);

        assertEq(constitution.getParameter(PARAM_CONFIDENCE_HONEYMOON), 180 days);
    }

    function test_happyCase_confirmEmergencyAmendment_clearsActiveTracking() public {
        bytes32 hash = keccak256("Emergency: extend honeymoon");
        _certifyEmergency(hash);

        uint256 id = _enactEmergency(hash, 180 days);

        _executeMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.confirmEmergencyAmendment, (id))
        );

        assertFalse(referendum.hasActiveEmergency(PARAM_CONFIDENCE_HONEYMOON));
    }

    function test_revert_confirmEmergencyAmendment_alreadyConfirmed() public {
        bytes32 hash = keccak256("Emergency: extend honeymoon");
        _certifyEmergency(hash);

        uint256 id = _enactEmergency(hash, 180 days);

        _executeMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.confirmEmergencyAmendment, (id))
        );

        // Inner revert: AmendmentAlreadyConfirmed
        uint256 actionId = _prepareMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.confirmEmergencyAmendment, (id))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    function test_modifier_confirmEmergencyAmendment_onlyParliament() public {
        bytes32 hash = keccak256("Emergency: extend honeymoon");
        _certifyEmergency(hash);

        uint256 id = _enactEmergency(hash, 180 days);

        address unauth = makeAddr("unauthorized");
        vm.prank(unauth);
        vm.expectRevert(Referendum.NotAuthorized.selector);
        referendum.confirmEmergencyAmendment(id);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 3. SUPERSEDE — Normal referendum supersedes active emergency
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_normalAmendment_supersedesActiveEmergency() public {
        bytes32 hash = keccak256("Emergency honeymoon");
        _certifyEmergency(hash);

        uint256 emergId = _enactEmergency(hash, 180 days);
        assertTrue(referendum.hasActiveEmergency(PARAM_CONFIDENCE_HONEYMOON));

        _executeMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.proposeAmendment, (
                keccak256("Change honeymoon to 120d"),
                PARAM_CONFIDENCE_HONEYMOON,
                120 days
            ))
        );
        uint256 normalId = referendum.amendmentCount() - 1;

        _executeMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.startReferendum, (normalId, 7 days))
        );
        _castReferendumVote(citizen1, normalId, true);
        _castReferendumVote(citizen2, normalId, true);
        _castReferendumVote(citizen3, normalId, true);
        _warpForward(7 days);
        referendum.finalizeReferendum(normalId);

        vm.expectEmit(true, true, false, false);
        emit EmergencyAmendmentSuperseded(emergId, normalId);
        referendum.enactAmendment(normalId);

        assertEq(uint256(referendum.getAmendmentStatus(emergId)), uint256(Referendum.AmendmentStatus.Superseded));
        assertFalse(referendum.hasActiveEmergency(PARAM_CONFIDENCE_HONEYMOON));
        assertEq(constitution.getParameter(PARAM_CONFIDENCE_HONEYMOON), 120 days);
        assertEq(uint256(referendum.getAmendmentStatus(normalId)), uint256(Referendum.AmendmentStatus.Enacted));
    }

    function test_revert_supersededEmergency_cannotExpire() public {
        bytes32 hash = keccak256("Emergency honeymoon");
        _certifyEmergency(hash);

        uint256 emergId = _enactEmergency(hash, 180 days);

        _enactNormalAmendmentOnHoneymoon(120 days);

        _warpForward(365 days + 1);

        vm.expectRevert(abi.encodeWithSelector(Referendum.NotInStatus.selector, Referendum.AmendmentStatus.Enacted));
        referendum.expireEmergencyAmendment(emergId);
    }

    function test_revert_supersededEmergency_cannotConfirm() public {
        bytes32 hash = keccak256("Emergency honeymoon");
        _certifyEmergency(hash);

        uint256 emergId = _enactEmergency(hash, 180 days);

        _enactNormalAmendmentOnHoneymoon(120 days);

        // Inner revert: NotInStatus(Enacted) because status is Superseded
        uint256 actionId = _prepareMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.confirmEmergencyAmendment, (emergId))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. STORED EXPIRY DEADLINE
    // ═══════════════════════════════════════════════════════════════════════

    function test_happyCase_emergencyExpiry_usesStoredDeadline() public {
        bytes32 hash = keccak256("Emergency stored deadline");
        _certifyEmergency(hash);

        uint256 duration = constitution.getParameter(PARAM_EMERGENCY_DURATION);

        uint256 id = _enactEmergency(hash, 180 days);

        (bool emergency, uint256 enactedAt, uint256 expiresAt) = referendum.getAmendmentEmergency(id);
        assertTrue(emergency);
        assertEq(expiresAt, enactedAt + duration);

        currentTime = expiresAt;
        vm.warp(currentTime);
        referendum.expireEmergencyAmendment(id);
        assertEq(uint256(referendum.getAmendmentStatus(id)), uint256(Referendum.AmendmentStatus.Expired));
    }

    function test_happyCase_durationChange_doesNotAffectActiveEmergency() public {
        bytes32 hash = keccak256("Emergency before duration change");
        _certifyEmergency(hash);

        uint256 id = _enactEmergency(hash, 180 days);

        (, uint256 enactedAt, uint256 storedExpiry) = referendum.getAmendmentEmergency(id);
        uint256 originalDuration = storedExpiry - enactedAt;

        // Change duration via normal referendum to 30 days (was 365 days)
        _executeMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.proposeAmendment, (
                keccak256("Shorten emergency duration"),
                PARAM_EMERGENCY_DURATION,
                30 days
            ))
        );
        uint256 durationAmendId = referendum.amendmentCount() - 1;

        _executeMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.startReferendum, (durationAmendId, 7 days))
        );
        _castReferendumVote(citizen1, durationAmendId, true);
        _castReferendumVote(citizen2, durationAmendId, true);
        _castReferendumVote(citizen3, durationAmendId, true);
        _warpForward(7 days);
        referendum.finalizeReferendum(durationAmendId);
        referendum.enactAmendment(durationAmendId);

        assertEq(constitution.getParameter(PARAM_EMERGENCY_DURATION), 30 days);

        // 31 days after enact — would expire under new duration but NOT under stored deadline
        currentTime = enactedAt + 31 days;
        vm.warp(currentTime);
        vm.expectRevert(Referendum.EmergencyNotExpired.selector);
        referendum.expireEmergencyAmendment(id);

        // Warp to the stored deadline (original duration)
        currentTime = enactedAt + originalDuration;
        vm.warp(currentTime);
        referendum.expireEmergencyAmendment(id);
        assertEq(uint256(referendum.getAmendmentStatus(id)), uint256(Referendum.AmendmentStatus.Expired));
    }

    function test_boundary_emergencyExpiry_exactBoundary() public {
        bytes32 hash = keccak256("Emergency boundary");
        _certifyEmergency(hash);

        uint256 id = _enactEmergency(hash, 180 days);

        (,, uint256 expiresAt) = referendum.getAmendmentEmergency(id);

        // 1 second before expiry
        currentTime = expiresAt - 1;
        vm.warp(currentTime);
        vm.expectRevert(Referendum.EmergencyNotExpired.selector);
        referendum.expireEmergencyAmendment(id);

        // Exactly at expiry
        currentTime = expiresAt;
        vm.warp(currentTime);
        referendum.expireEmergencyAmendment(id);
        assertEq(uint256(referendum.getAmendmentStatus(id)), uint256(Referendum.AmendmentStatus.Expired));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 5. ALREADY-EXPIRED / ALREADY-CONFIRMED REVERT PATHS
    // ═══════════════════════════════════════════════════════════════════════

    function test_revert_expireEmergencyAmendment_alreadyExpired() public {
        bytes32 hash = keccak256("Emergency already expired");
        _certifyEmergency(hash);

        uint256 id = _enactEmergency(hash, 180 days);

        (,, uint256 expiresAt) = referendum.getAmendmentEmergency(id);
        currentTime = expiresAt;
        vm.warp(currentTime);
        referendum.expireEmergencyAmendment(id);

        // Status is now Expired, trying to expire again
        vm.expectRevert(abi.encodeWithSelector(Referendum.NotInStatus.selector, Referendum.AmendmentStatus.Enacted));
        referendum.expireEmergencyAmendment(id);
    }

    function test_revert_confirmEmergencyAmendment_alreadyExpired() public {
        bytes32 hash = keccak256("Emergency confirm after expire");
        _certifyEmergency(hash);

        uint256 id = _enactEmergency(hash, 180 days);

        (,, uint256 expiresAt) = referendum.getAmendmentEmergency(id);
        currentTime = expiresAt;
        vm.warp(currentTime);
        referendum.expireEmergencyAmendment(id);

        // Inner revert: NotInStatus(Enacted) because status is Expired
        uint256 actionId = _prepareMajlisAction(
            address(referendum),
            abi.encodeCall(Referendum.confirmEmergencyAmendment, (id))
        );
        vm.expectRevert(Parliament.ExecutionFailed.selector);
        parliament.executeGovernanceAction(actionId);
    }
}
