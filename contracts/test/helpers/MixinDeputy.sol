// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./TestBase.sol";

/// @title MixinDeputy
/// @notice Composable mixin: PM has designated citizen1 as deputy.
///         Post-condition: deputyPM=citizen1, isDeputyOverdue=false.
///         Requires _setupGovernment() called first (PM must exist).
abstract contract MixinDeputy is GovTestBase {

    /// @notice PM designates citizen1 as Deputy PM.
    function _setupDeputy() internal {
        vm.prank(pmCandidate);
        executive.designateDeputyPM(citizen1);
    }
}
