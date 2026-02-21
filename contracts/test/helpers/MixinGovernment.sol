// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MixinMajlis.sol";

/// @title MixinGovernment
/// @notice Composable mixin: full PM formation cycle completed.
///         Post-condition: PM=pmCandidate, caretaker=false, stage=Idle.
///         Requires _setupMajlis() called first.
abstract contract MixinGovernment is MixinMajlis {

    /// @notice Run full PM formation: start formation, Crown nominates, present government,
    ///         3/5 Majlis vote confidence, finalize.
    function _setupGovernment() internal {
        // Start formation via Majlis governance action
        _executeMajlisAction(
            address(executive),
            abi.encodeCall(Executive.startFormation, ())
        );

        // Crown nominates PM
        vm.prank(monarchAddr);
        crown.nominatePrimeMinister(pmCandidate);

        // Nominee presents government program
        vm.prank(pmCandidate);
        executive.presentGovernment(keccak256("government program"));

        // 3 of 5 Majlis members vote confidence
        vm.prank(citizen1); executive.voteConfidence(true);
        vm.prank(citizen2); executive.voteConfidence(true);
        vm.prank(citizen3); executive.voteConfidence(true);

        // Warp past MIN_VOTING_PERIOD (3 days), finalize
        _warpForward(3 days);
        executive.finalizeConfidenceVote();
    }
}
