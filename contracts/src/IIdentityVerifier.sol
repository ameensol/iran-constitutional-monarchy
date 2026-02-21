// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IIdentityVerifier
/// @notice Interface for identity verification. In production, this would be
///         implemented by a ZK proof verifier (e.g., Rarimo Freedom Tool).
///         In this implementation, a mock signing authority is used instead.
interface IIdentityVerifier {
    /// @notice Check whether an address is a verified citizen.
    /// @param citizen The address to check.
    /// @return True if the address is a verified citizen.
    function isCitizen(address citizen) external view returns (bool);

    /// @notice Get the total number of registered citizens.
    /// @return The count of registered citizens.
    function citizenCount() external view returns (uint256);
}
