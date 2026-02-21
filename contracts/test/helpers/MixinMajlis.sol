// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./TestBase.sol";

/// @title MixinMajlis
/// @notice Composable mixin: full province-1 election, 5 Majlis members seated (citizen1-5).
///         Provides _executeMajlisAction() and _prepareMajlisAction().
///         Call _setupMajlis() in your test's setUp().
abstract contract MixinMajlis is GovTestBase {

    /// @notice Run a full Majlis election for province 1, seating citizen1-5.
    function _setupMajlis() internal {
        // Start province-1 Majlis election (bootstrapping prank — Majlis doesn't exist yet)
        vm.prank(address(parliament));
        uint256 electionId = election.startMajlisElection(1);

        // Register citizen1-5 as candidates
        address[5] memory candidates = [citizen1, citizen2, citizen3, citizen4, citizen5];
        for (uint256 i = 0; i < candidates.length; i++) {
            vm.prank(candidates[i]);
            election.registerCandidate(electionId, keccak256(abi.encodePacked("Party", i)));
        }

        // Warp past registration period, open voting
        uint256 regPeriod = constitution.getParameter(constitution.PARAM_ELECTION_REG_PERIOD());
        _warpForward(regPeriod);
        election.openVoting(electionId);

        // citizen1-5 vote (all province 1)
        for (uint256 i = 0; i < candidates.length; i++) {
            _castBallot(candidates[i], electionId, i);
        }

        // Warp past voting period
        uint256 votePeriod = constitution.getParameter(constitution.PARAM_ELECTION_VOTE_PERIOD());
        _warpForward(votePeriod);

        // Tally
        election.tallyVotes(electionId);

        // Seat winners via Crown ministerial act (winners determined by vote tally)
        vm.prank(monarchAddr);
        crown.executeMinisterialAct(
            address(election),
            abi.encodeCall(Election.seatMembers, (electionId))
        );
    }

    /// @notice Prepare a Majlis governance action (propose, vote, finalize) without executing.
    ///         Use this for revert tests: prepare, then vm.expectRevert + executeGovernanceAction.
    function _prepareMajlisAction(address target, bytes memory data) internal returns (uint256 actionId) {
        vm.prank(citizen1);
        actionId = parliament.proposeGovernanceAction(
            target, data, Parliament.Chamber.Majlis, 50, keccak256("majlis-action")
        );

        vm.prank(citizen1); parliament.voteOnGovernanceAction(actionId, true);
        vm.prank(citizen2); parliament.voteOnGovernanceAction(actionId, true);
        vm.prank(citizen3); parliament.voteOnGovernanceAction(actionId, true);

        _warpForward(3 days);
        parliament.finalizeGovernanceAction(actionId);
    }

    /// @notice Execute a Majlis governance action: propose, 3/5 vote yes, finalize, execute.
    function _executeMajlisAction(address target, bytes memory data) internal {
        uint256 actionId = _prepareMajlisAction(target, data);
        parliament.executeGovernanceAction(actionId);
    }
}
