// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./TestBase.sol";

/// @title MixinSenate
/// @notice Composable mixin: 3 senators seated via full two-tier pipeline.
///         Province 2 (Isfahan): citizen6, citizen7 become council members, then senators.
///         Province 3 (Fars): pmCandidate2 becomes council member, then senator.
///
///         KEY DESIGN: Does NOT require MixinGovernment. Crown can start provincial
///         elections without a PM (executeMinisterialAct only needs onlyMonarch).
///
///         Exposes _executeSenateAction() and _prepareSenateAction().
abstract contract MixinSenate is GovTestBase {

    // Senate members for easy reference
    address internal senator1;
    address internal senator2;
    address internal senator3;

    /// @notice Run full two-tier Senate pipeline: provincial elections + senate selections.
    function _setupSenate() internal {
        senator1 = citizen6;
        senator2 = citizen7;
        senator3 = pmCandidate2;

        // ═══════════════════════════════════════════════════════════════════
        // PHASE 1: Provincial Council Elections (Province 2 + Province 3)
        // ═══════════════════════════════════════════════════════════════════

        // Start provincial council elections for provinces 2 and 3
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(election),
            abi.encodeCall(Election.startProvincialElection, (2))
        );
        uint256 prov2ElectionId = election.electionCount() - 1;

        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(election),
            abi.encodeCall(Election.startProvincialElection, (3))
        );
        uint256 prov3ElectionId = election.electionCount() - 1;

        // Register candidates
        vm.prank(citizen6);
        election.registerCandidate(prov2ElectionId, keccak256("Isfahan-A"));
        vm.prank(citizen7);
        election.registerCandidate(prov2ElectionId, keccak256("Isfahan-B"));
        vm.prank(pmCandidate2);
        election.registerCandidate(prov3ElectionId, keccak256("Fars-A"));

        // Advance past registration period
        uint256 regPeriod = constitution.getParameter(constitution.PARAM_ELECTION_REG_PERIOD());
        _warpForward(regPeriod);
        election.openVoting(prov2ElectionId);
        election.openVoting(prov3ElectionId);

        // Cast ballots
        _castBallotWithProvince(citizen6, prov2ElectionId, 0, 2);
        _castBallotWithProvince(citizen7, prov2ElectionId, 1, 2);
        _castBallotWithProvince(pmCandidate, prov3ElectionId, 0, 3);

        // Advance past voting period
        uint256 votePeriod = constitution.getParameter(constitution.PARAM_ELECTION_VOTE_PERIOD());
        _warpForward(votePeriod);

        // Tally both elections
        election.tallyVotes(prov2ElectionId);
        election.tallyVotes(prov3ElectionId);

        // Seat council winners (determined by vote tally)
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(election),
            abi.encodeCall(Election.seatMembers, (prov2ElectionId))
        );

        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(election),
            abi.encodeCall(Election.seatMembers, (prov3ElectionId))
        );

        // ═══════════════════════════════════════════════════════════════════
        // PHASE 2: Senate Selections (Province 2 + Province 3)
        // ═══════════════════════════════════════════════════════════════════

        // Start senate selections
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.startSenateSelection, (2))
        );
        uint256 sel2Id = pc.selectionCount() - 1;

        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.startSenateSelection, (3))
        );
        uint256 sel3Id = pc.selectionCount() - 1;

        // Register senate candidates
        vm.prank(citizen6);
        pc.registerSenateCandidate(sel2Id);
        vm.prank(citizen7);
        pc.registerSenateCandidate(sel2Id);
        vm.prank(pmCandidate2);
        pc.registerSenateCandidate(sel3Id);

        // Advance past senate selection registration period
        uint256 selRegPeriod = constitution.getParameter(constitution.PARAM_SENATE_SELECTION_REG_PERIOD());
        _warpForward(selRegPeriod);

        // Council members vote
        vm.prank(citizen6);
        pc.castSenateVote(sel2Id, 1);
        vm.prank(citizen7);
        pc.castSenateVote(sel2Id, 0);
        vm.prank(pmCandidate2);
        pc.castSenateVote(sel3Id, 0);

        // Advance past senate selection voting period
        uint256 selVotePeriod = constitution.getParameter(constitution.PARAM_SENATE_SELECTION_VOTE_PERIOD());
        _warpForward(selVotePeriod);

        // Tally both
        pc.tallySenateSelection(sel2Id);
        pc.tallySenateSelection(sel3Id);

        // Seat selected senators (determined by vote tally)
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.seatSelectedSenators, (sel2Id))
        );

        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(pc),
            abi.encodeCall(ProvincialCouncil.seatSelectedSenators, (sel3Id))
        );

        // Postcondition: 3 active Senate members
        assert(parliament.senateMemberCount() == 3);
        assert(parliament.isSenateMember(senator1));
        assert(parliament.isSenateMember(senator2));
        assert(parliament.isSenateMember(senator3));
    }

    /// @notice Prepare a Senate governance action (propose, vote, finalize) without executing.
    function _prepareSenateAction(address target, bytes memory data) internal returns (uint256 actionId) {
        vm.prank(senator1);
        actionId = parliament.proposeGovernanceAction(
            target,
            data,
            Parliament.Chamber.Senate,
            50,
            keccak256("senate governance action")
        );

        vm.prank(senator1);
        parliament.voteOnGovernanceAction(actionId, true);
        vm.prank(senator2);
        parliament.voteOnGovernanceAction(actionId, true);
        vm.prank(senator3);
        parliament.voteOnGovernanceAction(actionId, true);

        _warpForward(3 days);
        parliament.finalizeGovernanceAction(actionId);
    }

    /// @notice Execute a Senate governance action: propose, all 3 senators vote yes, finalize, execute.
    function _executeSenateAction(address target, bytes memory data) internal {
        uint256 actionId = _prepareSenateAction(target, data);
        parliament.executeGovernanceAction(actionId);
    }
}
