// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Constitution.sol";
import "../src/CitizenRegistry.sol";
import "../src/Parliament.sol";
import "../src/Election.sol";
import "../src/Referendum.sol";
import "../src/ProvincialCouncil.sol";
import "../src/verifiers/GeneratedBallotVerifier.sol";

/// @title ZKIntegrationTest
/// @notice Tier 2 integration tests: real Groth16 proof generation and on-chain verification.
///
///         Uses Foundry FFI to call prove-ffi.js, which generates genuine Groth16 proofs
///         from fake passport data signed by a test Certificate Signing Authority (CSCA).
///         The GeneratedBallotVerifier (snarkJS-generated, real BN254 pairing checks) verifies
///         each proof on-chain.
///
/// @dev These tests are SLOW (~300ms per proof via FFI) and require:
///      - Node.js + npm dependencies (snarkjs, circomlibjs)
///      - Circuit build artifacts (circuits/build/)
///      - ffi = true in foundry.toml
///
///      Run: forge test --match-contract ZKIntegration -vvv
contract ZKIntegrationTest is Test {
    // ─── Contracts ────────────────────────────────────────────────────────

    Constitution internal constitution;
    CitizenRegistry internal registry;
    Parliament internal parliament;
    Election internal election;
    Referendum internal referendum;
    ProvincialCouncil internal pc;
    GeneratedBallotVerifier internal verifier;

    // ─── Actors ───────────────────────────────────────────────────────────

    address internal deployer = makeAddr("deployer");
    address internal authorityKey = makeAddr("authorityKey");
    address internal crownContract = makeAddr("crownContract");
    address internal executiveContract = makeAddr("executiveContract");
    address internal courtContract = makeAddr("courtContract");
    address internal budgetContract = makeAddr("budgetContract");

    // Candidates (must be registered citizens for candidate registration)
    address internal candidateA = makeAddr("candidateA");
    address internal candidateB = makeAddr("candidateB");
    address internal candidateC = makeAddr("candidateC"); // province 7

    // ─── Test CSCA ────────────────────────────────────────────────────────

    string constant CSCA_PRIV_KEY = "0001020304050607080900010203040506070809000102030405060708090001";

    // Pre-computed Poseidon(Ax, Ay) of the test CSCA public key (from circuits/csca-hash.js)
    uint256 constant CSCA_PUB_KEY_AX = 13277427435165878497778222415993513565335242147425444199013288855685581939618;
    uint256 constant CSCA_PUB_KEY_AY = 13622229784656158136036771217484571176836296686641868549125388198837476602820;
    uint256 constant CSCA_KEY_HASH = 8093821485214269328389004542394237209037452657522929891144731833981969398000;

    // ─── Events ───────────────────────────────────────────────────────────

    event BallotCast(uint256 indexed electionId, uint256 indexed nullifier, uint256 candidateIndex);
    event ReferendumVoteCast(uint256 indexed amendmentId, uint256 indexed nullifier, bool support);

    // ─── Setup ────────────────────────────────────────────────────────────

    function setUp() public {
        vm.prank(deployer);
        constitution = new Constitution();

        registry = new CitizenRegistry(authorityKey);
        parliament = new Parliament(address(constitution));
        election = new Election(address(constitution));
        referendum = new Referendum(address(constitution));
        pc = new ProvincialCouncil(address(constitution));
        verifier = new GeneratedBallotVerifier();

        // Etch minimal bytecode at mock addresses
        vm.etch(crownContract, hex"00");
        vm.etch(executiveContract, hex"00");
        vm.etch(courtContract, hex"00");
        vm.etch(budgetContract, hex"00");

        bytes32[] memory names = new bytes32[](10);
        address[] memory addrs = new address[](10);
        names[0] = constitution.CONTRACT_CITIZEN_REGISTRY();
        addrs[0] = address(registry);
        names[1] = constitution.CONTRACT_CROWN();
        addrs[1] = crownContract;
        names[2] = constitution.CONTRACT_PARLIAMENT();
        addrs[2] = address(parliament);
        names[3] = constitution.CONTRACT_EXECUTIVE();
        addrs[3] = executiveContract;
        names[4] = constitution.CONTRACT_SUPREME_COURT();
        addrs[4] = courtContract;
        names[5] = constitution.CONTRACT_ELECTION();
        addrs[5] = address(election);
        names[6] = constitution.CONTRACT_REFERENDUM();
        addrs[6] = address(referendum);
        names[7] = constitution.CONTRACT_BUDGET();
        addrs[7] = budgetContract;
        names[8] = constitution.CONTRACT_PROVINCIAL_COUNCIL();
        addrs[8] = address(pc);
        names[9] = constitution.CONTRACT_BALLOT_VERIFIER();
        addrs[9] = address(verifier);

        vm.prank(deployer);
        constitution.initialize(names, addrs);

        // Set trusted CSCA key (real key hash from test CSCA private key)
        vm.prank(authorityKey);
        registry.setCscaKey(CSCA_PUB_KEY_AX, CSCA_PUB_KEY_AY, CSCA_KEY_HASH);

        // Warp to 2026-02-17 00:00 UTC so currentDate (20260217) passes freshness check
        vm.warp(1771286400);

        // Register candidates as citizens
        _registerCitizen(candidateA, 1);
        _registerCitizen(candidateB, 1);
        _registerCitizen(candidateC, 7);
    }

    function _registerCitizen(address citizen, uint8 province) internal {
        vm.prank(authorityKey);
        registry.registerCitizen(citizen, keccak256(abi.encodePacked(citizen)), province);
    }

    // ─── FFI Proof Generation ─────────────────────────────────────────────

    /// @notice Generate a real Groth16 proof via FFI (calls prove-ffi.js).
    function _generateProof(
        uint256 identitySecret,
        uint256 documentNumber,
        uint256 provinceId,
        uint256 eventId,
        uint256 eventData
    ) internal returns (
        Election.ProofPoints memory proof,
        uint256[23] memory pubSignals
    ) {
        return _generateProofWithDates(identitySecret, documentNumber, provinceId, eventId, eventData, "19900101", "20260217");
    }

    /// @notice Generate a proof with custom birthDate and currentDate (for age boundary tests).
    function _generateProofWithDates(
        uint256 identitySecret,
        uint256 documentNumber,
        uint256 provinceId,
        uint256 eventId,
        uint256 eventData,
        string memory birthDate,
        string memory currentDate
    ) internal returns (
        Election.ProofPoints memory proof,
        uint256[23] memory pubSignals
    ) {
        string memory args = string.concat(
            '{"identitySecret":"', vm.toString(identitySecret),
            '","citizenship":"4805185',
            '","birthDate":"', birthDate,
            '","expirationDate":"20300101',
            '","documentNumber":"', vm.toString(documentNumber),
            '","nationality":"4805185',
            '","sex":"1',
            '","provinceId":"', vm.toString(provinceId),
            '","cscaPrivKey":"', CSCA_PRIV_KEY,
            '","currentDate":"', currentDate,
            '","eventId":"', vm.toString(eventId),
            '","eventData":"', vm.toString(eventData),
            '"}'
        );

        string[] memory inputs = new string[](3);
        inputs[0] = "node";
        inputs[1] = "circuits/prove-ffi.js";
        inputs[2] = args;

        bytes memory result = vm.ffi(inputs);

        (
            uint256[2] memory a,
            uint256[2][2] memory b,
            uint256[2] memory c,
            uint256[23] memory sigs
        ) = abi.decode(result, (uint256[2], uint256[2][2], uint256[2], uint256[23]));

        proof.a = a;
        proof.b = b;
        proof.c = c;
        pubSignals = sigs;
    }

    // ─── Election Helpers ─────────────────────────────────────────────────

    /// @notice Start a Majlis election for province 1 with 2 candidates, advance to voting.
    function _startElectionAndOpenVoting() internal returns (uint256 electionId) {
        vm.prank(address(parliament));
        electionId = election.startMajlisElection(1);

        vm.prank(candidateA);
        election.registerCandidate(electionId, keccak256("partyA"));
        vm.prank(candidateB);
        election.registerCandidate(electionId, keccak256("partyB"));

        uint256 regPeriod = constitution.getParameter(constitution.PARAM_ELECTION_REG_PERIOD());
        vm.warp(block.timestamp + regPeriod + 1);
        election.openVoting(electionId);
    }

    /// @notice Start a referendum on an amendment, advance to voting.
    function _startReferendumVoting() internal returns (uint256 amendmentId) {
        // Evaluate args before prank so the prank isn't consumed by external reads
        bytes32 paramKey = constitution.PARAM_MAJLIS_TERM();
        uint256 minPeriod = constitution.getParameter(constitution.PARAM_MIN_VOTING_PERIOD());

        vm.prank(address(parliament));
        amendmentId = referendum.proposeAmendment(
            keccak256("test amendment"),
            paramKey,
            5 * 365 days
        );

        vm.prank(address(parliament));
        referendum.startReferendum(amendmentId, minPeriod);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Test 1: Single voter casts a ballot with a real Groth16 proof
    // ═══════════════════════════════════════════════════════════════════════

    function test_realProof_happyCase_castBallot() public {
        uint256 electionId = _startElectionAndOpenVoting();

        (Election.ProofPoints memory proof, uint256[23] memory signals) =
            _generateProof(12345, 987654, 1, electionId, 0);

        election.castBallot(electionId, 0, proof, signals);

        assertEq(election.getCandidateVotes(electionId, 0), 1);
        assertTrue(election.isNullifierUsed(electionId, signals[0]));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Test 2: Multiple voters — 3 for candidate A, 2 for candidate B
    // ═══════════════════════════════════════════════════════════════════════

    function test_realProof_happyCase_multipleVoters_tallyCorrect() public {
        uint256 electionId = _startElectionAndOpenVoting();

        // 3 voters for candidate A (index 0)
        // Each voter has a unique identitySecret and documentNumber
        for (uint256 i = 0; i < 3; i++) {
            (Election.ProofPoints memory proof, uint256[23] memory signals) =
                _generateProof(12345 + i, 987654 + i, 1, electionId, 0);
            election.castBallot(electionId, 0, proof, signals);
        }

        // 2 voters for candidate B (index 1)
        for (uint256 i = 0; i < 2; i++) {
            (Election.ProofPoints memory proof, uint256[23] memory signals) =
                _generateProof(22345 + i, 887654 + i, 1, electionId, 1);
            election.castBallot(electionId, 1, proof, signals);
        }

        assertEq(election.getCandidateVotes(electionId, 0), 3, "candidate A should have 3 votes");
        assertEq(election.getCandidateVotes(electionId, 1), 2, "candidate B should have 2 votes");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Test 3: Referendum — 3 yes, 2 no, finalize as Approved
    // ═══════════════════════════════════════════════════════════════════════

    function test_realProof_happyCase_referendum_multipleVoters() public {
        uint256 amendmentId = _startReferendumVoting();

        // 3 yes votes
        for (uint256 i = 0; i < 3; i++) {
            (Election.ProofPoints memory eProof, uint256[23] memory signals) =
                _generateProof(12345 + i, 987654 + i, 1, amendmentId, 0);

            Referendum.ProofPoints memory proof;
            proof.a = eProof.a;
            proof.b = eProof.b;
            proof.c = eProof.c;

            referendum.castReferendumVote(amendmentId, true, proof, signals);
        }

        // 2 no votes
        for (uint256 i = 0; i < 2; i++) {
            (Election.ProofPoints memory eProof, uint256[23] memory signals) =
                _generateProof(22345 + i, 887654 + i, 1, amendmentId, 0);

            Referendum.ProofPoints memory proof;
            proof.a = eProof.a;
            proof.b = eProof.b;
            proof.c = eProof.c;

            referendum.castReferendumVote(amendmentId, false, proof, signals);
        }

        // Finalize after voting ends
        uint256 minPeriod = constitution.getParameter(constitution.PARAM_MIN_VOTING_PERIOD());
        vm.warp(block.timestamp + minPeriod + 1);
        referendum.finalizeReferendum(amendmentId);

        // Check results
        (uint256 yesVotes, uint256 noVotes) = referendum.getAmendmentVotes(amendmentId);
        assertEq(yesVotes, 3, "should have 3 yes votes");
        assertEq(noVotes, 2, "should have 2 no votes");
        assertEq(
            uint8(referendum.getAmendmentStatus(amendmentId)),
            uint8(Referendum.AmendmentStatus.Approved),
            "referendum should be approved"
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Test 4: Same passport, different elections → different nullifiers
    // ═══════════════════════════════════════════════════════════════════════

    function test_realProof_happyCase_differentElections() public {
        // Start two elections
        vm.prank(address(parliament));
        uint256 electionId1 = election.startMajlisElection(1);
        vm.prank(address(parliament));
        uint256 electionId2 = election.startMajlisElection(1);

        // Register candidates in both
        vm.prank(candidateA);
        election.registerCandidate(electionId1, keccak256("partyA"));
        vm.prank(candidateA);
        election.registerCandidate(electionId2, keccak256("partyA"));

        // Open voting for both
        uint256 regPeriod = constitution.getParameter(constitution.PARAM_ELECTION_REG_PERIOD());
        vm.warp(block.timestamp + regPeriod + 1);
        election.openVoting(electionId1);
        election.openVoting(electionId2);

        // Same passport data, different elections
        (Election.ProofPoints memory proof1, uint256[23] memory signals1) =
            _generateProof(12345, 987654, 1, electionId1, 0);
        (Election.ProofPoints memory proof2, uint256[23] memory signals2) =
            _generateProof(12345, 987654, 1, electionId2, 0);

        // Nullifiers must differ (derived from identityHash + eventId)
        assertTrue(signals1[0] != signals2[0], "same passport + different elections should produce different nullifiers");

        // Both ballots should succeed
        election.castBallot(electionId1, 0, proof1, signals1);
        election.castBallot(electionId2, 0, proof2, signals2);

        assertEq(election.getCandidateVotes(electionId1, 0), 1);
        assertEq(election.getCandidateVotes(electionId2, 0), 1);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Test 5: Duplicate nullifier — same passport + same election reverts
    // ═══════════════════════════════════════════════════════════════════════

    function test_realProof_revert_duplicateNullifier() public {
        uint256 electionId = _startElectionAndOpenVoting();

        (Election.ProofPoints memory proof, uint256[23] memory signals) =
            _generateProof(12345, 987654, 1, electionId, 0);

        // First vote succeeds
        election.castBallot(electionId, 0, proof, signals);

        // Second vote with same proof reverts (same nullifier)
        vm.expectRevert(abi.encodeWithSelector(Election.AlreadyVoted.selector, signals[0]));
        election.castBallot(electionId, 0, proof, signals);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Test 6: Tampered citizenship — contract rejects wrong citizenship
    // ═══════════════════════════════════════════════════════════════════════

    function test_realProof_revert_tamperedCitizenship() public {
        uint256 electionId = _startElectionAndOpenVoting();

        (Election.ProofPoints memory proof, uint256[23] memory signals) =
            _generateProof(12345, 987654, 1, electionId, 0);

        // Tamper citizenship: change from 0x495241 (IRA) to 0x555341 (USA)
        signals[6] = 0x555341;

        vm.expectRevert(Election.InvalidProof.selector);
        election.castBallot(electionId, 0, proof, signals);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Test 7: Single referendum vote with real proof
    // ═══════════════════════════════════════════════════════════════════════

    function test_realProof_happyCase_referendumVote() public {
        uint256 amendmentId = _startReferendumVoting();

        (Election.ProofPoints memory eProof, uint256[23] memory signals) =
            _generateProof(12345, 987654, 1, amendmentId, 0);

        Referendum.ProofPoints memory proof;
        proof.a = eProof.a;
        proof.b = eProof.b;
        proof.c = eProof.c;

        referendum.castReferendumVote(amendmentId, true, proof, signals);

        assertTrue(referendum.isNullifierUsed(amendmentId, signals[0]));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Test 8: Vote verification — isNullifierUsed after casting
    // ═══════════════════════════════════════════════════════════════════════

    function test_realProof_happyCase_voteVerification() public {
        uint256 electionId = _startElectionAndOpenVoting();

        (Election.ProofPoints memory proof, uint256[23] memory signals) =
            _generateProof(12345, 987654, 1, electionId, 0);

        uint256 nullifier = signals[0];

        // Before voting: nullifier not used
        assertFalse(election.isNullifierUsed(electionId, nullifier));

        election.castBallot(electionId, 0, proof, signals);

        // After voting: nullifier is used
        assertTrue(election.isNullifierUsed(electionId, nullifier));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Test 9: Province-scoped election — province 7 proof for province 7 election
    // ═══════════════════════════════════════════════════════════════════════

    function test_realProof_happyCase_provinceScoped() public {
        // Start province 7 election
        vm.prank(address(parliament));
        uint256 electionId = election.startMajlisElection(7);

        // Register candidate in province 7
        vm.prank(candidateC);
        election.registerCandidate(electionId, keccak256("partyC"));

        uint256 regPeriod = constitution.getParameter(constitution.PARAM_ELECTION_REG_PERIOD());
        vm.warp(block.timestamp + regPeriod + 1);
        election.openVoting(electionId);

        // Generate proof with provinceId=7
        (Election.ProofPoints memory proof, uint256[23] memory signals) =
            _generateProof(12345, 987654, 7, electionId, 0);

        // Province in proof matches election province
        assertEq(signals[11], 7, "proof should have provinceId=7");

        election.castBallot(electionId, 0, proof, signals);

        assertEq(election.getCandidateVotes(electionId, 0), 1);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Test 10: Groth16 pairing rejects ALL tampered unchecked signals
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Verifies that the Groth16 BN254 pairing check cryptographically binds
    ///         every public signal to the proof. For each signal not checked by the
    ///         contract, we tamper it and verify the verifier returns false.
    ///         Calls the verifier directly (not castBallot) to prove this is Groth16
    ///         rejection, not a contract-level check.
    function test_realProof_revert_groth16RejectsAllTamperedSignals() public {
        uint256 electionId = _startElectionAndOpenVoting();

        // Generate ONE valid proof
        (Election.ProofPoints memory proof, uint256[23] memory signals) =
            _generateProof(12345, 987654, 1, electionId, 0);

        // Unchecked signal indices: [1]=birthDate, [2]=expirationDate, [3]=name,
        // [4]=nameResidual, [5]=nationality, [7]=sex, [8]=documentNumberHash
        uint256[7] memory uncheckedIndices = [uint256(1), 2, 3, 4, 5, 7, 8];

        for (uint256 i = 0; i < uncheckedIndices.length; i++) {
            // Copy signals
            uint256[23] memory tampered;
            for (uint256 j = 0; j < 23; j++) tampered[j] = signals[j];

            // Tamper the signal
            tampered[uncheckedIndices[i]] += 1;

            // Verifier should return false (Groth16 pairing rejection)
            bool valid = verifier.verifyProof(proof.a, proof.b, proof.c, tampered);
            assertFalse(valid, string.concat("Groth16 should reject tampered signal[", vm.toString(uncheckedIndices[i]), "]"));
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Test 11: Sanity check — verifier accepts untampered proof
    // ═══════════════════════════════════════════════════════════════════════

    function test_realProof_happyCase_verifierAcceptsUntamperedProof() public {
        uint256 electionId = _startElectionAndOpenVoting();

        (Election.ProofPoints memory proof, uint256[23] memory signals) =
            _generateProof(12345, 987654, 1, electionId, 0);

        bool valid = verifier.verifyProof(proof.a, proof.b, proof.c, signals);
        assertTrue(valid, "Verifier should accept untampered proof");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Test 12: Wrong CSCA key hash — contract rejects
    // ═══════════════════════════════════════════════════════════════════════

    function test_realProof_revert_wrongCscaKeyHash() public {
        // Override registry with wrong CSCA hash
        vm.prank(authorityKey);
        registry.setCscaKey(0, 0, 0xDEADBEEF);

        uint256 electionId = _startElectionAndOpenVoting();

        (Election.ProofPoints memory proof, uint256[23] memory signals) =
            _generateProof(12345, 987654, 1, electionId, 0);

        // Proof has real CSCA hash but registry has wrong one
        vm.expectRevert(Election.InvalidProof.selector);
        election.castBallot(electionId, 0, proof, signals);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Test 13: Exactly 18 years old — boundary case passes
    // ═══════════════════════════════════════════════════════════════════════

    function test_realProof_happyCase_exactly18() public {
        uint256 electionId = _startElectionAndOpenVoting();

        // birthDate=20080217, currentDate=20260217 → exactly 18
        (Election.ProofPoints memory proof, uint256[23] memory signals) =
            _generateProofWithDates(12345, 987654, 1, electionId, 0, "20080217", "20260217");

        election.castBallot(electionId, 0, proof, signals);

        assertEq(election.getCandidateVotes(electionId, 0), 1);
    }
}
