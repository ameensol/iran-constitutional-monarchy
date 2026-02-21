// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../../src/Election.sol";
import "../../src/Referendum.sol";

/// @title ProofHelper
/// @notice Mock proof builder for Tier 1 unit tests. Generates fake proof data
///         with valid public signals. Used with MockBallotVerifier (always returns true).
abstract contract ProofHelper {
    /// @notice Mock CSCA key hash — must match what's stored in CitizenRegistry via setCscaKey().
    uint256 internal constant MOCK_CSCA_KEY_HASH = 0xDEAD;

    /// @notice Mock currentDate — must be <= block.timestamp converted to YYYYMMDD.
    uint256 internal constant MOCK_CURRENT_DATE = 20260217;

    /// @notice Build a mock ballot proof for election voting.
    /// @param identityHash Unique identity hash for this voter (used to derive nullifier).
    /// @param electionId The election ID (maps to pubSignals[9]).
    /// @param candidateIndex The candidate to vote for (maps to pubSignals[10]).
    /// @param provinceId The voter's province (maps to pubSignals[11]).
    /// @return proof Zeroed proof points (MockBallotVerifier ignores them).
    /// @return pubSignals 23 signals with nullifier, citizenship, eventId, eventData, provinceId, cscaKeyHash, currentDate.
    function _mockBallotProof(
        bytes32 identityHash,
        uint256 electionId,
        uint256 candidateIndex,
        uint8 provinceId
    ) internal pure returns (
        Election.ProofPoints memory proof,
        uint256[23] memory pubSignals
    ) {
        // proof.a/b/c remain zeroed (MockBallotVerifier ignores them)
        pubSignals[0] = uint256(keccak256(abi.encodePacked(identityHash, electionId))); // nullifier
        pubSignals[6] = 0x495241;          // citizenship = Iran
        pubSignals[9] = electionId;        // eventId
        pubSignals[10] = candidateIndex;   // eventData
        pubSignals[11] = provinceId;       // provinceId
        pubSignals[12] = MOCK_CSCA_KEY_HASH; // cscaKeyHash
        pubSignals[13] = MOCK_CURRENT_DATE;  // currentDate
    }

    /// @notice Build a mock referendum proof.
    /// @param identityHash Unique identity hash for this voter.
    /// @param amendmentId The amendment ID (maps to pubSignals[9]).
    /// @return proof Zeroed proof points.
    /// @return pubSignals 23 signals with nullifier, citizenship, eventId, cscaKeyHash, currentDate.
    function _mockReferendumProof(
        bytes32 identityHash,
        uint256 amendmentId
    ) internal pure returns (
        Referendum.ProofPoints memory proof,
        uint256[23] memory pubSignals
    ) {
        pubSignals[0] = uint256(keccak256(abi.encodePacked(identityHash, amendmentId))); // nullifier
        pubSignals[6] = 0x495241;          // citizenship = Iran
        pubSignals[9] = amendmentId;       // eventId
        pubSignals[12] = MOCK_CSCA_KEY_HASH; // cscaKeyHash
        pubSignals[13] = MOCK_CURRENT_DATE;  // currentDate
    }

    /// @notice Get a deterministic identity hash for a test voter address.
    function _identityHash(address voter) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("identity", voter));
    }
}
