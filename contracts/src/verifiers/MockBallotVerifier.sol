// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IBallotVerifier.sol";

/// @title MockBallotVerifier
/// @notice Always-true verifier for Tier 1 unit tests. Allows testing
///         contract logic (nullifiers, phases, seating) without real proofs.
contract MockBallotVerifier is IBallotVerifier {
    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[23] calldata
    ) external pure override returns (bool) {
        return true;
    }
}
