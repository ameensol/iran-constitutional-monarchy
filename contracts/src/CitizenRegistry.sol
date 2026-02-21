// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IIdentityVerifier.sol";

/// @title CitizenRegistry
/// @notice Passport office for the governance system. A signing authority registers
///         citizens for candidate eligibility and province tracking. Also stores the
///         trusted CSCA key hash used by Election and Referendum contracts to verify
///         ZK passport proofs during ballot casting.
/// @dev Citizen registration uses authority-signed attestations. Ballot verification
///      uses real Groth16 ZK proofs: the CSCA key hash stored here is checked against
///      each proof's pubSignals[12] to confirm the passport was government-issued.
contract CitizenRegistry is IIdentityVerifier {
    // ─── Errors ──────────────────────────────────────────────────────────

    error NotAuthority();
    error AlreadyRegistered(address citizen);
    error NotRegistered(address citizen);
    error ZeroAddress();
    error InvalidSignature();
    error InvalidProvince();

    // ─── Events ──────────────────────────────────────────────────────────

    event CitizenRegistered(address indexed citizen, bytes32 indexed identityHash);
    event CitizenRevoked(address indexed citizen);
    event AuthorityTransferred(address indexed oldAuthority, address indexed newAuthority);
    event ProvinceAssigned(address indexed citizen, uint8 province);

    // ─── State ───────────────────────────────────────────────────────────

    /// @notice The signing authority (mock passport office).
    address public authority;

    /// @notice Mapping of citizen address to registration status.
    mapping(address => bool) private _registered;

    /// @notice Mapping of citizen address to identity hash.
    mapping(address => bytes32) private _identityHashes;

    /// @notice Total number of registered citizens.
    uint256 private _citizenCount;

    /// @notice Province assignment per citizen (1-31, 0 = unassigned).
    mapping(address => uint8) private _province;

    /// @notice Number of registered citizens per province.
    mapping(uint8 => uint256) private _provinceCitizenCount;

    /// @notice Per-citizen nonce to prevent signature replay after revocation.
    mapping(address => uint256) public registrationNonce;

    /// @notice Trusted CSCA public key (Baby Jubjub) and its Poseidon hash.
    uint256 public cscaPubKeyAx;
    uint256 public cscaPubKeyAy;
    uint256 public cscaKeyHash;

    // ─── Modifiers ───────────────────────────────────────────────────────

    modifier onlyAuthority() {
        if (msg.sender != authority) revert NotAuthority();
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────

    /// @param _authority The initial signing authority address.
    constructor(address _authority) {
        if (_authority == address(0)) revert ZeroAddress();
        authority = _authority;
    }

    // ─── Registration ────────────────────────────────────────────────────

    /// @notice Register a citizen with province assignment. Called by the authority.
    /// @param citizen The address to register.
    /// @param idHash A hash representing the citizen's identity (e.g., passport hash).
    /// @param province The citizen's province (1-31). Province is mandatory.
    function registerCitizen(address citizen, bytes32 idHash, uint8 province) external onlyAuthority {
        if (citizen == address(0)) revert ZeroAddress();
        if (_registered[citizen]) revert AlreadyRegistered(citizen);
        if (province == 0 || province > 31) revert InvalidProvince();

        _registered[citizen] = true;
        _identityHashes[citizen] = idHash;
        _province[citizen] = province;
        _citizenCount++;
        _provinceCitizenCount[province]++;

        emit CitizenRegistered(citizen, idHash);
        emit ProvinceAssigned(citizen, province);
    }

    /// @notice Assign or reassign a citizen's province. Called by the authority.
    /// @param citizen The citizen's address (must be registered).
    /// @param province The province to assign (1-31).
    function assignProvince(address citizen, uint8 province) external onlyAuthority {
        if (!_registered[citizen]) revert NotRegistered(citizen);
        if (province == 0 || province > 31) revert InvalidProvince();

        uint8 oldProvince = _province[citizen];
        if (oldProvince != 0) {
            _provinceCitizenCount[oldProvince]--;
        }
        _province[citizen] = province;
        _provinceCitizenCount[province]++;

        emit ProvinceAssigned(citizen, province);
    }

    /// @notice Register a citizen using a signature from the authority.
    ///         This allows gasless registration — anyone can submit the tx
    ///         as long as they have a valid authority signature.
    /// @param citizen The address to register.
    /// @param idHash A hash representing the citizen's identity.
    /// @param province The citizen's province (1-31). Province is mandatory.
    /// @param v ECDSA recovery id.
    /// @param r ECDSA r value.
    /// @param s ECDSA s value.
    function registerWithSignature(
        address citizen,
        bytes32 idHash,
        uint8 province,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        if (citizen == address(0)) revert ZeroAddress();
        if (_registered[citizen]) revert AlreadyRegistered(citizen);
        if (province == 0 || province > 31) revert InvalidProvince();

        // Verify authority signature over (citizen, idHash, province, nonce, chainid, contract address)
        // nonce prevents replay after revocation; chainid + address(this) prevent cross-chain/contract replay
        bytes32 digest = keccak256(abi.encodePacked(citizen, idHash, province, registrationNonce[citizen], block.chainid, address(this)));
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", digest)
        );
        address signer = ecrecover(ethSignedHash, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
        if (signer != authority) revert InvalidSignature();

        _registered[citizen] = true;
        _identityHashes[citizen] = idHash;
        _province[citizen] = province;
        _citizenCount++;
        _provinceCitizenCount[province]++;

        emit CitizenRegistered(citizen, idHash);
        emit ProvinceAssigned(citizen, province);
    }

    // ─── Revocation ──────────────────────────────────────────────────────

    /// @notice Revoke a citizen's registration.
    /// @param citizen The address to revoke.
    function revokeCitizenship(address citizen) external onlyAuthority {
        if (!_registered[citizen]) revert NotRegistered(citizen);

        _registered[citizen] = false;
        delete _identityHashes[citizen];
        _citizenCount--;
        registrationNonce[citizen]++;

        // Clear province data to prevent stale counts
        uint8 oldProvince = _province[citizen];
        if (oldProvince != 0) {
            _provinceCitizenCount[oldProvince]--;
            _province[citizen] = 0;
        }

        emit CitizenRevoked(citizen);
    }

    // ─── Authority Management ────────────────────────────────────────────

    /// @notice Transfer the authority role to a new address.
    /// @param newAuthority The new authority address.
    function transferAuthority(address newAuthority) external onlyAuthority {
        if (newAuthority == address(0)) revert ZeroAddress();

        address old = authority;
        authority = newAuthority;

        emit AuthorityTransferred(old, newAuthority);
    }

    // ─── CSCA Key Management ──────────────────────────────────────────────

    /// @notice Set the trusted CSCA public key and its pre-computed Poseidon hash.
    /// @param ax Baby Jubjub x-coordinate of the CSCA public key.
    /// @param ay Baby Jubjub y-coordinate of the CSCA public key.
    /// @param keyHash Poseidon(ax, ay), pre-computed off-chain.
    function setCscaKey(uint256 ax, uint256 ay, uint256 keyHash) external onlyAuthority {
        cscaPubKeyAx = ax;
        cscaPubKeyAy = ay;
        cscaKeyHash = keyHash;
    }

    // ─── View Functions ──────────────────────────────────────────────────

    /// @inheritdoc IIdentityVerifier
    function isCitizen(address citizen) external view override returns (bool) {
        return _registered[citizen];
    }

    /// @inheritdoc IIdentityVerifier
    function citizenCount() external view override returns (uint256) {
        return _citizenCount;
    }

    /// @notice Get the identity hash for a registered citizen.
    /// @param citizen The citizen's address.
    /// @return The identity hash.
    function identityHash(address citizen) external view returns (bytes32) {
        return _identityHashes[citizen];
    }

    /// @notice Get a citizen's province assignment.
    /// @param citizen The citizen's address.
    /// @return The province ID (0 if unassigned).
    function citizenProvince(address citizen) external view returns (uint8) {
        return _province[citizen];
    }

    /// @notice Get the number of registered citizens in a province.
    /// @param province The province ID (1-31).
    /// @return The citizen count for that province.
    function provinceCitizenCount(uint8 province) external view returns (uint256) {
        return _provinceCitizenCount[province];
    }
}
