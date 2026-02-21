// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/CitizenRegistry.sol";

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO A: Empty Registry
// ═══════════════════════════════════════════════════════════════════════════

/// @notice Tests for CitizenRegistry.sol with no registered citizens.
///         Covers: constructor, registration (direct + signature), views, CSCA key.
contract CitizenRegistryEmptyTest is Test {
    event CitizenRegistered(address indexed citizen, bytes32 indexed identityHash);
    event CitizenRevoked(address indexed citizen);
    event AuthorityTransferred(address indexed oldAuthority, address indexed newAuthority);
    event ProvinceAssigned(address indexed citizen, uint8 province);

    CitizenRegistry internal registry;

    uint256 internal authorityPrivateKey = 0xA11CE;
    address internal authority = vm.addr(authorityPrivateKey);
    address internal citizen1 = makeAddr("citizen1");
    address internal citizen2 = makeAddr("citizen2");
    address internal citizen3 = makeAddr("citizen3");
    address internal nonAuthority = makeAddr("nonAuthority");
    address internal newAuthority = makeAddr("newAuthority");

    bytes32 internal constant IDENTITY_HASH_1 = keccak256("passport:citizen1");
    bytes32 internal constant IDENTITY_HASH_2 = keccak256("passport:citizen2");
    bytes32 internal constant IDENTITY_HASH_3 = keccak256("passport:citizen3");

    function setUp() public {
        registry = new CitizenRegistry(authority);
    }

    function _signRegistration(address citizen, bytes32 idHash, uint8 province)
        internal view returns (uint8 v, bytes32 r, bytes32 s)
    {
        uint256 nonce = registry.registrationNonce(citizen);
        bytes32 digest = keccak256(abi.encodePacked(citizen, idHash, province, nonce, block.chainid, address(registry)));
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (v, r, s) = vm.sign(authorityPrivateKey, ethSignedHash);
    }

    function _signRegistrationWithNonce(address citizen, bytes32 idHash, uint8 province, uint256 nonce)
        internal view returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 digest = keccak256(abi.encodePacked(citizen, idHash, province, nonce, block.chainid, address(registry)));
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (v, r, s) = vm.sign(authorityPrivateKey, ethSignedHash);
    }

    // ─── Constructor ─────────────────────────────────────────────────────

    function test_happyCase_constructor() public view {
        assertEq(registry.authority(), authority);
        assertEq(registry.citizenCount(), 0);
    }

    function test_revert_constructor_zeroAddress() public {
        vm.expectRevert(CitizenRegistry.ZeroAddress.selector);
        new CitizenRegistry(address(0));
    }

    // ─── Views on empty registry ─────────────────────────────────────────

    function test_happyCase_isCitizen_unregistered() public view {
        assertFalse(registry.isCitizen(citizen1));
    }

    function test_happyCase_citizenCount_empty() public view {
        assertEq(registry.citizenCount(), 0);
    }

    function test_happyCase_identityHash_unregistered() public view {
        assertEq(registry.identityHash(citizen1), bytes32(0));
    }

    function test_happyCase_citizenProvince_unregistered() public view {
        assertEq(registry.citizenProvince(citizen1), 0);
    }

    // ─── registerCitizen: happy paths ────────────────────────────────────

    function test_happyCase_registerCitizen() public {
        vm.prank(authority);
        registry.registerCitizen(citizen1, IDENTITY_HASH_1, 1);

        assertTrue(registry.isCitizen(citizen1));
        assertEq(registry.identityHash(citizen1), IDENTITY_HASH_1);
        assertEq(registry.citizenCount(), 1);
        assertEq(registry.citizenProvince(citizen1), 1);
        assertEq(registry.provinceCitizenCount(1), 1);
    }

    function test_happyCase_registerCitizen_multiple() public {
        vm.startPrank(authority);
        registry.registerCitizen(citizen1, IDENTITY_HASH_1, 1);
        registry.registerCitizen(citizen2, IDENTITY_HASH_2, 1);
        registry.registerCitizen(citizen3, IDENTITY_HASH_3, 5);
        vm.stopPrank();

        assertEq(registry.citizenCount(), 3);
        assertEq(registry.provinceCitizenCount(1), 2);
        assertEq(registry.provinceCitizenCount(5), 1);
    }

    function test_happyCase_registerCitizen_emitsEvents() public {
        vm.expectEmit(true, true, false, true);
        emit CitizenRegistered(citizen1, IDENTITY_HASH_1);
        vm.expectEmit(true, false, false, true);
        emit ProvinceAssigned(citizen1, 1);

        vm.prank(authority);
        registry.registerCitizen(citizen1, IDENTITY_HASH_1, 1);
    }

    // ─── registerCitizen: revert paths ───────────────────────────────────

    function test_revert_registerCitizen_notAuthority() public {
        vm.prank(nonAuthority);
        vm.expectRevert(CitizenRegistry.NotAuthority.selector);
        registry.registerCitizen(citizen1, IDENTITY_HASH_1, 1);
    }

    function test_revert_registerCitizen_zeroAddress() public {
        vm.prank(authority);
        vm.expectRevert(CitizenRegistry.ZeroAddress.selector);
        registry.registerCitizen(address(0), IDENTITY_HASH_1, 1);
    }

    function test_revert_registerCitizen_alreadyRegistered() public {
        vm.startPrank(authority);
        registry.registerCitizen(citizen1, IDENTITY_HASH_1, 1);

        vm.expectRevert(abi.encodeWithSelector(CitizenRegistry.AlreadyRegistered.selector, citizen1));
        registry.registerCitizen(citizen1, IDENTITY_HASH_1, 1);
        vm.stopPrank();
    }

    function test_revert_registerCitizen_invalidProvinceZero() public {
        vm.prank(authority);
        vm.expectRevert(CitizenRegistry.InvalidProvince.selector);
        registry.registerCitizen(citizen1, IDENTITY_HASH_1, 0);
    }

    function test_revert_registerCitizen_invalidProvinceTooHigh() public {
        vm.prank(authority);
        vm.expectRevert(CitizenRegistry.InvalidProvince.selector);
        registry.registerCitizen(citizen1, IDENTITY_HASH_1, 32);
    }

    function test_boundary_registerCitizen_province31() public {
        vm.prank(authority);
        registry.registerCitizen(citizen1, IDENTITY_HASH_1, 31);
        assertEq(registry.citizenProvince(citizen1), 31);
        assertEq(registry.provinceCitizenCount(31), 1);
    }

    function test_boundary_registerCitizen_manyRegistrations() public {
        uint256 count = 50;
        vm.startPrank(authority);
        for (uint256 i = 0; i < count; i++) {
            address citizen = address(uint160(i + 100));
            bytes32 idHash = keccak256(abi.encodePacked("citizen", i));
            registry.registerCitizen(citizen, idHash, 1);
        }
        vm.stopPrank();
        assertEq(registry.citizenCount(), count);
    }

    // ─── registerWithSignature: happy paths ──────────────────────────────

    function test_happyCase_registerWithSignature() public {
        (uint8 v, bytes32 r, bytes32 s) = _signRegistration(citizen1, IDENTITY_HASH_1, 1);
        vm.prank(citizen1);
        registry.registerWithSignature(citizen1, IDENTITY_HASH_1, 1, v, r, s);

        assertTrue(registry.isCitizen(citizen1));
        assertEq(registry.identityHash(citizen1), IDENTITY_HASH_1);
        assertEq(registry.citizenProvince(citizen1), 1);
        assertEq(registry.provinceCitizenCount(1), 1);
    }

    function test_happyCase_registerWithSignature_thirdPartySubmits() public {
        (uint8 v, bytes32 r, bytes32 s) = _signRegistration(citizen1, IDENTITY_HASH_1, 1);
        vm.prank(nonAuthority);
        registry.registerWithSignature(citizen1, IDENTITY_HASH_1, 1, v, r, s);
        assertTrue(registry.isCitizen(citizen1));
    }

    function test_happyCase_registerWithSignature_emitsEvents() public {
        (uint8 v, bytes32 r, bytes32 s) = _signRegistration(citizen1, IDENTITY_HASH_1, 1);
        vm.expectEmit(true, true, false, true);
        emit CitizenRegistered(citizen1, IDENTITY_HASH_1);
        vm.expectEmit(true, false, false, true);
        emit ProvinceAssigned(citizen1, 1);

        registry.registerWithSignature(citizen1, IDENTITY_HASH_1, 1, v, r, s);
    }

    // ─── registerWithSignature: revert paths ─────────────────────────────

    function test_revert_registerWithSignature_invalidSignature() public {
        (uint8 v, bytes32 r, bytes32 s) = _signRegistration(citizen1, IDENTITY_HASH_1, 1);
        vm.expectRevert(CitizenRegistry.InvalidSignature.selector);
        registry.registerWithSignature(citizen2, IDENTITY_HASH_1, 1, v, r, s);
    }

    function test_revert_registerWithSignature_wrongIdentityHash() public {
        (uint8 v, bytes32 r, bytes32 s) = _signRegistration(citizen1, IDENTITY_HASH_1, 1);
        vm.expectRevert(CitizenRegistry.InvalidSignature.selector);
        registry.registerWithSignature(citizen1, IDENTITY_HASH_2, 1, v, r, s);
    }

    function test_revert_registerWithSignature_alreadyRegistered() public {
        (uint8 v, bytes32 r, bytes32 s) = _signRegistration(citizen1, IDENTITY_HASH_1, 1);
        registry.registerWithSignature(citizen1, IDENTITY_HASH_1, 1, v, r, s);

        vm.expectRevert(abi.encodeWithSelector(CitizenRegistry.AlreadyRegistered.selector, citizen1));
        registry.registerWithSignature(citizen1, IDENTITY_HASH_1, 1, v, r, s);
    }

    function test_revert_registerWithSignature_zeroAddress() public {
        (uint8 v, bytes32 r, bytes32 s) = _signRegistration(address(0), IDENTITY_HASH_1, 1);
        vm.expectRevert(CitizenRegistry.ZeroAddress.selector);
        registry.registerWithSignature(address(0), IDENTITY_HASH_1, 1, v, r, s);
    }

    function test_revert_registerWithSignature_nonAuthoritySigner() public {
        uint256 fakeKey = 0xBEEF;
        uint8 province = 1;
        bytes32 digest = keccak256(abi.encodePacked(citizen1, IDENTITY_HASH_1, province, registry.registrationNonce(citizen1), block.chainid, address(registry)));
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(fakeKey, ethSignedHash);

        vm.expectRevert(CitizenRegistry.InvalidSignature.selector);
        registry.registerWithSignature(citizen1, IDENTITY_HASH_1, 1, v, r, s);
    }

    function test_revert_registerWithSignature_ecrecoverReturnsZero() public {
        // Garbage v/r/s values that cause ecrecover to return address(0)
        // This tests the L141 path: `if (signer == address(0)) revert InvalidSignature()`
        vm.expectRevert(CitizenRegistry.InvalidSignature.selector);
        registry.registerWithSignature(citizen1, IDENTITY_HASH_1, 1, 0, bytes32(0), bytes32(0));
    }

    function test_revert_registerWithSignature_wrongProvince() public {
        // Sign for province 1, submit with province 2
        (uint8 v, bytes32 r, bytes32 s) = _signRegistration(citizen1, IDENTITY_HASH_1, 1);
        vm.expectRevert(CitizenRegistry.InvalidSignature.selector);
        registry.registerWithSignature(citizen1, IDENTITY_HASH_1, 2, v, r, s);
    }

    function test_revert_registerWithSignature_invalidProvinceZero() public {
        (uint8 v, bytes32 r, bytes32 s) = _signRegistration(citizen1, IDENTITY_HASH_1, 0);
        vm.expectRevert(CitizenRegistry.InvalidProvince.selector);
        registry.registerWithSignature(citizen1, IDENTITY_HASH_1, 0, v, r, s);
    }

    function test_revert_registerWithSignature_invalidProvinceTooHigh() public {
        (uint8 v, bytes32 r, bytes32 s) = _signRegistration(citizen1, IDENTITY_HASH_1, 32);
        vm.expectRevert(CitizenRegistry.InvalidProvince.selector);
        registry.registerWithSignature(citizen1, IDENTITY_HASH_1, 32, v, r, s);
    }

    // ─── setCscaKey: happy path + modifier ───────────────────────────────

    function test_happyCase_setCscaKey() public {
        uint256 ax = 123;
        uint256 ay = 456;
        uint256 keyHash = 0xDEAD;
        vm.prank(authority);
        registry.setCscaKey(ax, ay, keyHash);

        assertEq(registry.cscaPubKeyAx(), ax);
        assertEq(registry.cscaPubKeyAy(), ay);
        assertEq(registry.cscaKeyHash(), keyHash);
    }

    function test_happyCase_setCscaKey_overwrite() public {
        vm.startPrank(authority);
        registry.setCscaKey(111, 222, 0xAAAA);
        registry.setCscaKey(333, 444, 0xBBBB);
        vm.stopPrank();

        assertEq(registry.cscaPubKeyAx(), 333);
        assertEq(registry.cscaPubKeyAy(), 444);
        assertEq(registry.cscaKeyHash(), 0xBBBB);
    }

    function test_revert_setCscaKey_notAuthority() public {
        vm.prank(nonAuthority);
        vm.expectRevert(CitizenRegistry.NotAuthority.selector);
        registry.setCscaKey(0, 0, 0xDEAD);
    }

    // ─── transferAuthority ───────────────────────────────────────────────

    function test_happyCase_transferAuthority() public {
        vm.prank(authority);
        registry.transferAuthority(newAuthority);
        assertEq(registry.authority(), newAuthority);
    }

    function test_happyCase_transferAuthority_emitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit AuthorityTransferred(authority, newAuthority);

        vm.prank(authority);
        registry.transferAuthority(newAuthority);
    }

    function test_happyCase_transferAuthority_newAuthorityCanRegister() public {
        vm.prank(authority);
        registry.transferAuthority(newAuthority);

        vm.prank(newAuthority);
        registry.registerCitizen(citizen1, IDENTITY_HASH_1, 1);
        assertTrue(registry.isCitizen(citizen1));
    }

    function test_happyCase_transferAuthority_oldAuthorityCannotRegister() public {
        vm.prank(authority);
        registry.transferAuthority(newAuthority);

        vm.prank(authority);
        vm.expectRevert(CitizenRegistry.NotAuthority.selector);
        registry.registerCitizen(citizen1, IDENTITY_HASH_1, 1);
    }

    function test_revert_transferAuthority_zeroAddress() public {
        vm.prank(authority);
        vm.expectRevert(CitizenRegistry.ZeroAddress.selector);
        registry.transferAuthority(address(0));
    }

    function test_revert_transferAuthority_notAuthority() public {
        vm.prank(nonAuthority);
        vm.expectRevert(CitizenRegistry.NotAuthority.selector);
        registry.transferAuthority(newAuthority);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENARIO B: Registry With Citizens
// ═══════════════════════════════════════════════════════════════════════════

/// @notice Tests for CitizenRegistry.sol with pre-registered citizens.
///         Covers: revocation, province assignment, signature replay, re-registration.
contract CitizenRegistryWithCitizensTest is Test {
    event CitizenRevoked(address indexed citizen);
    event ProvinceAssigned(address indexed citizen, uint8 province);

    CitizenRegistry internal registry;

    uint256 internal authorityPrivateKey = 0xA11CE;
    address internal authority = vm.addr(authorityPrivateKey);
    address internal citizen1 = makeAddr("citizen1");
    address internal citizen2 = makeAddr("citizen2");
    address internal nonAuthority = makeAddr("nonAuthority");

    bytes32 internal constant IDENTITY_HASH_1 = keccak256("passport:citizen1");
    bytes32 internal constant IDENTITY_HASH_2 = keccak256("passport:citizen2");

    function setUp() public {
        registry = new CitizenRegistry(authority);
        vm.startPrank(authority);
        registry.registerCitizen(citizen1, IDENTITY_HASH_1, 1);
        registry.registerCitizen(citizen2, IDENTITY_HASH_2, 5);
        vm.stopPrank();
    }

    function _signRegistration(address citizen, bytes32 idHash, uint8 province)
        internal view returns (uint8 v, bytes32 r, bytes32 s)
    {
        uint256 nonce = registry.registrationNonce(citizen);
        bytes32 digest = keccak256(abi.encodePacked(citizen, idHash, province, nonce, block.chainid, address(registry)));
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (v, r, s) = vm.sign(authorityPrivateKey, ethSignedHash);
    }

    function _signRegistrationWithNonce(address citizen, bytes32 idHash, uint8 province, uint256 nonce)
        internal view returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 digest = keccak256(abi.encodePacked(citizen, idHash, province, nonce, block.chainid, address(registry)));
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (v, r, s) = vm.sign(authorityPrivateKey, ethSignedHash);
    }

    // ─── revokeCitizenship: happy paths ──────────────────────────────────

    function test_happyCase_revokeCitizenship() public {
        vm.prank(authority);
        registry.revokeCitizenship(citizen1);

        assertFalse(registry.isCitizen(citizen1));
        assertEq(registry.identityHash(citizen1), bytes32(0));
        assertEq(registry.citizenCount(), 1);
    }

    function test_happyCase_revokeCitizenship_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit CitizenRevoked(citizen1);

        vm.prank(authority);
        registry.revokeCitizenship(citizen1);
    }

    function test_happyCase_revokeCitizenship_countDecrements() public {
        assertEq(registry.citizenCount(), 2);
        vm.prank(authority);
        registry.revokeCitizenship(citizen1);
        assertEq(registry.citizenCount(), 1);
        assertTrue(registry.isCitizen(citizen2));
    }

    function test_happyCase_revokeCitizenship_clearsProvince() public {
        assertEq(registry.citizenProvince(citizen2), 5);
        assertEq(registry.provinceCitizenCount(5), 1);

        vm.prank(authority);
        registry.revokeCitizenship(citizen2);

        assertEq(registry.citizenProvince(citizen2), 0);
        assertEq(registry.provinceCitizenCount(5), 0);
    }

    // ─── revokeCitizenship: revert paths ─────────────────────────────────

    function test_revert_revokeCitizenship_notRegistered() public {
        address notRegistered = makeAddr("notRegistered");
        vm.prank(authority);
        vm.expectRevert(abi.encodeWithSelector(CitizenRegistry.NotRegistered.selector, notRegistered));
        registry.revokeCitizenship(notRegistered);
    }

    function test_revert_revokeCitizenship_notAuthority() public {
        vm.prank(nonAuthority);
        vm.expectRevert(CitizenRegistry.NotAuthority.selector);
        registry.revokeCitizenship(citizen1);
    }

    // ─── Revoke and re-register ──────────────────────────────────────────

    function test_happyCase_revokeAndReregister() public {
        vm.startPrank(authority);
        registry.revokeCitizenship(citizen1);

        bytes32 newHash = keccak256("passport:citizen1:renewed");
        registry.registerCitizen(citizen1, newHash, 3);
        vm.stopPrank();

        assertTrue(registry.isCitizen(citizen1));
        assertEq(registry.identityHash(citizen1), newHash);
        assertEq(registry.citizenProvince(citizen1), 3);
        assertEq(registry.citizenCount(), 2);
    }

    // ─── assignProvince: happy paths ─────────────────────────────────────

    function test_happyCase_assignProvince() public {
        vm.prank(authority);
        registry.assignProvince(citizen1, 3);

        assertEq(registry.citizenProvince(citizen1), 3);
        assertEq(registry.provinceCitizenCount(1), 0);
        assertEq(registry.provinceCitizenCount(3), 1);
    }

    function test_happyCase_assignProvince_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit ProvinceAssigned(citizen1, 7);

        vm.prank(authority);
        registry.assignProvince(citizen1, 7);
    }

    function test_happyCase_assignProvince_reassign() public {
        vm.startPrank(authority);
        registry.assignProvince(citizen1, 5);
        registry.assignProvince(citizen1, 10);
        vm.stopPrank();

        assertEq(registry.citizenProvince(citizen1), 10);
        assertEq(registry.provinceCitizenCount(1), 0);
        assertEq(registry.provinceCitizenCount(5), 1); // citizen2 still here
        assertEq(registry.provinceCitizenCount(10), 1);
    }

    // ─── assignProvince: revert paths ────────────────────────────────────

    function test_revert_assignProvince_notRegistered() public {
        address notRegistered = makeAddr("notRegistered");
        vm.prank(authority);
        vm.expectRevert(abi.encodeWithSelector(CitizenRegistry.NotRegistered.selector, notRegistered));
        registry.assignProvince(notRegistered, 1);
    }

    function test_revert_assignProvince_invalidProvinceZero() public {
        vm.prank(authority);
        vm.expectRevert(CitizenRegistry.InvalidProvince.selector);
        registry.assignProvince(citizen1, 0);
    }

    function test_revert_assignProvince_invalidProvinceTooHigh() public {
        vm.prank(authority);
        vm.expectRevert(CitizenRegistry.InvalidProvince.selector);
        registry.assignProvince(citizen1, 32);
    }

    function test_revert_assignProvince_notAuthority() public {
        vm.prank(nonAuthority);
        vm.expectRevert(CitizenRegistry.NotAuthority.selector);
        registry.assignProvince(citizen1, 1);
    }

    // ─── Signature replay protection ─────────────────────────────────────

    function test_revert_signatureReplayAfterRevocation() public {
        // Register citizen via direct call in setUp; now revoke and try signature replay
        vm.prank(authority);
        registry.revokeCitizenship(citizen1);
        assertEq(registry.registrationNonce(citizen1), 1);

        // Sign with old nonce (0) — should fail
        (uint8 v, bytes32 r, bytes32 s) = _signRegistrationWithNonce(citizen1, IDENTITY_HASH_1, 1, 0);
        vm.expectRevert(CitizenRegistry.InvalidSignature.selector);
        registry.registerWithSignature(citizen1, IDENTITY_HASH_1, 1, v, r, s);
    }

    function test_happyCase_reRegisterWithNewSignatureAfterRevocation() public {
        vm.prank(authority);
        registry.revokeCitizenship(citizen1);
        assertEq(registry.registrationNonce(citizen1), 1);

        // Sign with new nonce (1) — should work
        bytes32 newHash = keccak256("passport:citizen1:renewed");
        (uint8 v, bytes32 r, bytes32 s) = _signRegistration(citizen1, newHash, 1);
        registry.registerWithSignature(citizen1, newHash, 1, v, r, s);

        assertTrue(registry.isCitizen(citizen1));
        assertEq(registry.identityHash(citizen1), newHash);
    }
}
