// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MixinMajlis.sol";

/// @title MixinCaretaker
/// @notice Composable mixin: formation started, caretaker=true.
///         Requires _setupMajlis() called first.
///         Can be called after _setupGovernment() to restart formation (PM stays as caretaker).
abstract contract MixinCaretaker is MixinMajlis {

    /// @notice Start government formation, putting Executive into caretaker mode.
    function _setupCaretaker() internal {
        _executeMajlisAction(
            address(executive),
            abi.encodeCall(Executive.startFormation, ())
        );
    }
}
