// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IBallotVerifier
/// @notice Interface for ZK ballot proof verification. Implemented by both
///         MockBallotVerifier (unit tests) and GeneratedBallotVerifier (real Groth16).
interface IBallotVerifier {
    /// @notice Verify a Groth16 proof with 23 public signals.
    /// @param _pA Proof point A (2 elements).
    /// @param _pB Proof point B (2x2 elements).
    /// @param _pC Proof point C (2 elements).
    /// @param _pubSignals 23 public signals from the circuit.
    /// @return True if the proof is valid.
    function verifyProof(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[23] calldata _pubSignals
    ) external view returns (bool);
}
