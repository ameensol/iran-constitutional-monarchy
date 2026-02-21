// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MixinSenate.sol";

/// @title MixinJustices
/// @notice Composable mixin: 7 justices appointed via Crown nomination + Senate confirmation.
///         Exposes justices[7] array and _certifyFact() helper.
///         Requires _setupSenate() called first.
abstract contract MixinJustices is MixinSenate {
    address[7] internal justices;

    /// @notice Appoint 7 justices: Crown nominates each, Senate confirms via governance action.
    function _setupJustices() internal {
        // Create 7 justice addresses
        for (uint256 i = 0; i < 7; i++) {
            justices[i] = address(uint160(2000 + i));
        }

        // Appoint all 7: Crown nominates, Senate confirms
        for (uint256 i = 0; i < 7; i++) {
            vm.prank(monarchAddr);
            crown.nominateJustice(justices[i], i);

            _executeSenateAction(
                address(court),
                abi.encodeCall(SupremeCourt.confirmNominee, (i))
            );
        }
    }

    /// @notice Certify a fact: all 7 justices vote yes, warp past FACT_CERT_PERIOD, finalize.
    function _certifyFact(bytes32 factHash) internal {
        for (uint256 i = 0; i < 7; i++) {
            vm.prank(justices[i]);
            court.voteOnFact(factHash, true);
        }

        uint256 factCertPeriod = constitution.getParameter(constitution.PARAM_FACT_CERT_PERIOD());
        _warpForward(factCertPeriod);
        court.finalizeFactCertification(factHash);
    }
}
