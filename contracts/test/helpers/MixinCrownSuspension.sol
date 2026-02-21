// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MixinJustices.sol";

/// @title MixinCrownSuspension
/// @notice Composable mixin: Crown is suspended (succession exhausted, ROLE_MONARCH=address(0)).
///         Requires _setupJustices() called first.
abstract contract MixinCrownSuspension is MixinJustices {

    /// @notice Certify MONARCH_VACANCY and claim succession exhausted to suspend the Crown.
    function _setupCrownSuspension() internal {
        // Certify MONARCH_VACANCY (instance-specific: includes current monarch address)
        bytes32 vacancyHash = keccak256(abi.encodePacked("MONARCH_VACANCY", monarchAddr));
        _certifyFact(vacancyHash);

        // Succession list is empty (default) — claim succession exhausted
        crown.claimSuccessionExhausted();
    }
}
