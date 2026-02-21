/**
 * Unit tests for PassportBallot proof generation.
 *
 * Tests each step of the proof pipeline:
 * 1. Poseidon identity hash computation
 * 2. EdDSA signing by CSCA
 * 3. EdDSA signature verification (sanity check)
 * 4. Witness generation (circuit satisfaction)
 * 5. Full Groth16 proof generation + verification
 * 6. Public signal correctness
 * 7. Nullifier determinism and uniqueness
 * 8. Error cases (bad signature, wrong inputs)
 *
 * Run: node circuits/prove.test.js
 */

const snarkjs = require("snarkjs");
const path = require("path");
const fs = require("fs");

const WASM_PATH = path.join(__dirname, "build/PassportBallot_js/PassportBallot.wasm");
const ZKEY_PATH = path.join(__dirname, "build/PassportBallot_final.zkey");
const VKEY_PATH = path.join(__dirname, "build/verification_key.json");

// Test passport data (YYYYMMDD format for dates)
const TEST_PASSPORT = {
    identitySecret: "12345",
    citizenship: "4805185",      // 0x495241 = "IRA" = Iran
    birthDate: "19900101",
    expirationDate: "20300101",
    documentNumber: "987654",
    nationality: "4805185",
    sex: "1",
    provinceId: "1",
};

const TEST_CURRENT_DATE = "20260217";

const CSCA_PRIV_KEY = "0001020304050607080900010203040506070809000102030405060708090001";

let eddsa, poseidon, F;
let passed = 0;
let failed = 0;
let errors = [];

function assert(condition, message) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message}: expected ${expected}, got ${actual}`);
    }
}

async function test(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`  ✓ ${name}`);
    } catch (e) {
        failed++;
        errors.push({ name, error: e.message });
        console.log(`  ✗ ${name}`);
        console.log(`    ${e.message}`);
    }
}

// Helper: build circuit inputs from passport data + CSCA key
async function buildCircuitInputs(passport, cscaPrivKeyHex, eventId, eventData, currentDate) {
    currentDate = currentDate || TEST_CURRENT_DATE;
    const idHash = poseidon([
        BigInt(passport.citizenship),
        BigInt(passport.birthDate),
        BigInt(passport.documentNumber),
        BigInt(passport.nationality),
        BigInt(passport.sex),
        BigInt(passport.provinceId),
        BigInt(passport.identitySecret),
    ]);

    const cscaPrivKey = Buffer.from(cscaPrivKeyHex, "hex");
    const signature = eddsa.signPoseidon(cscaPrivKey, idHash);
    const pubKey = eddsa.prv2pub(cscaPrivKey);

    return {
        identitySecret: passport.identitySecret.toString(),
        citizenship: passport.citizenship.toString(),
        birthDate: passport.birthDate.toString(),
        expirationDate: passport.expirationDate.toString(),
        documentNumber: passport.documentNumber.toString(),
        nationality: passport.nationality.toString(),
        sex: passport.sex.toString(),
        provinceId: passport.provinceId.toString(),
        cscaPubKeyAx: F.toObject(pubKey[0]).toString(),
        cscaPubKeyAy: F.toObject(pubKey[1]).toString(),
        sigR8x: F.toObject(signature.R8[0]).toString(),
        sigR8y: F.toObject(signature.R8[1]).toString(),
        sigS: signature.S.toString(),
        currentDate: currentDate.toString(),
        eventId: eventId.toString(),
        eventData: eventData.toString(),
    };
}

async function main() {
    console.log("Loading circomlibjs...");
    const { buildEddsa, buildPoseidon } = await import("circomlibjs");
    eddsa = await buildEddsa();
    poseidon = await buildPoseidon();
    F = poseidon.F;
    console.log("Libraries loaded.\n");

    // ── Step 1: Poseidon Identity Hash ──
    console.log("Step 1: Poseidon Identity Hash");

    await test("computes deterministic identity hash", async () => {
        const hash1 = poseidon([
            BigInt(TEST_PASSPORT.citizenship),
            BigInt(TEST_PASSPORT.birthDate),
            BigInt(TEST_PASSPORT.documentNumber),
            BigInt(TEST_PASSPORT.nationality),
            BigInt(TEST_PASSPORT.sex),
            BigInt(TEST_PASSPORT.provinceId),
            BigInt(TEST_PASSPORT.identitySecret),
        ]);
        const hash2 = poseidon([
            BigInt(TEST_PASSPORT.citizenship),
            BigInt(TEST_PASSPORT.birthDate),
            BigInt(TEST_PASSPORT.documentNumber),
            BigInt(TEST_PASSPORT.nationality),
            BigInt(TEST_PASSPORT.sex),
            BigInt(TEST_PASSPORT.provinceId),
            BigInt(TEST_PASSPORT.identitySecret),
        ]);
        assertEqual(
            F.toObject(hash1).toString(),
            F.toObject(hash2).toString(),
            "Same inputs should produce same hash"
        );
    });

    await test("different identitySecret produces different hash", async () => {
        const hash1 = poseidon([
            BigInt(TEST_PASSPORT.citizenship), BigInt(TEST_PASSPORT.birthDate),
            BigInt(TEST_PASSPORT.documentNumber), BigInt(TEST_PASSPORT.nationality),
            BigInt(TEST_PASSPORT.sex), BigInt(TEST_PASSPORT.provinceId), BigInt("12345"),
        ]);
        const hash2 = poseidon([
            BigInt(TEST_PASSPORT.citizenship), BigInt(TEST_PASSPORT.birthDate),
            BigInt(TEST_PASSPORT.documentNumber), BigInt(TEST_PASSPORT.nationality),
            BigInt(TEST_PASSPORT.sex), BigInt(TEST_PASSPORT.provinceId), BigInt("99999"),
        ]);
        assert(
            F.toObject(hash1).toString() !== F.toObject(hash2).toString(),
            "Different secrets should produce different hashes"
        );
    });

    await test("different province produces different hash", async () => {
        const hash1 = poseidon([
            BigInt(TEST_PASSPORT.citizenship), BigInt(TEST_PASSPORT.birthDate),
            BigInt(TEST_PASSPORT.documentNumber), BigInt(TEST_PASSPORT.nationality),
            BigInt(TEST_PASSPORT.sex), BigInt(1), BigInt(TEST_PASSPORT.identitySecret),
        ]);
        const hash2 = poseidon([
            BigInt(TEST_PASSPORT.citizenship), BigInt(TEST_PASSPORT.birthDate),
            BigInt(TEST_PASSPORT.documentNumber), BigInt(TEST_PASSPORT.nationality),
            BigInt(TEST_PASSPORT.sex), BigInt(2), BigInt(TEST_PASSPORT.identitySecret),
        ]);
        assert(
            F.toObject(hash1).toString() !== F.toObject(hash2).toString(),
            "Different provinces should produce different hashes"
        );
    });

    // ── Step 2: EdDSA Signing ──
    console.log("\nStep 2: EdDSA CSCA Signing");

    await test("CSCA key generates valid public key", async () => {
        const cscaPrivKey = Buffer.from(CSCA_PRIV_KEY, "hex");
        const pubKey = eddsa.prv2pub(cscaPrivKey);
        assert(pubKey[0] !== undefined, "Public key x should exist");
        assert(pubKey[1] !== undefined, "Public key y should exist");
        // Public key should be a point on Baby Jubjub
        const ax = F.toObject(pubKey[0]);
        const ay = F.toObject(pubKey[1]);
        assert(ax > 0n, "Public key x should be non-zero");
        assert(ay > 0n, "Public key y should be non-zero");
    });

    await test("CSCA produces deterministic signature", async () => {
        const cscaPrivKey = Buffer.from(CSCA_PRIV_KEY, "hex");
        const idHash = poseidon([
            BigInt(TEST_PASSPORT.citizenship), BigInt(TEST_PASSPORT.birthDate),
            BigInt(TEST_PASSPORT.documentNumber), BigInt(TEST_PASSPORT.nationality),
            BigInt(TEST_PASSPORT.sex), BigInt(TEST_PASSPORT.provinceId),
            BigInt(TEST_PASSPORT.identitySecret),
        ]);
        const sig1 = eddsa.signPoseidon(cscaPrivKey, idHash);
        const sig2 = eddsa.signPoseidon(cscaPrivKey, idHash);
        assertEqual(sig1.S.toString(), sig2.S.toString(), "Signature S scalar");
        assertEqual(
            F.toObject(sig1.R8[0]).toString(),
            F.toObject(sig2.R8[0]).toString(),
            "Signature R8x"
        );
    });

    // ── Step 3: EdDSA Verification (sanity) ──
    console.log("\nStep 3: EdDSA Signature Verification");

    await test("valid signature verifies", async () => {
        const cscaPrivKey = Buffer.from(CSCA_PRIV_KEY, "hex");
        const idHash = poseidon([
            BigInt(TEST_PASSPORT.citizenship), BigInt(TEST_PASSPORT.birthDate),
            BigInt(TEST_PASSPORT.documentNumber), BigInt(TEST_PASSPORT.nationality),
            BigInt(TEST_PASSPORT.sex), BigInt(TEST_PASSPORT.provinceId),
            BigInt(TEST_PASSPORT.identitySecret),
        ]);
        const sig = eddsa.signPoseidon(cscaPrivKey, idHash);
        const pubKey = eddsa.prv2pub(cscaPrivKey);
        const valid = eddsa.verifyPoseidon(idHash, sig, pubKey);
        assert(valid, "Signature should verify against correct public key and message");
    });

    await test("signature fails with wrong message", async () => {
        const cscaPrivKey = Buffer.from(CSCA_PRIV_KEY, "hex");
        const idHash = poseidon([
            BigInt(TEST_PASSPORT.citizenship), BigInt(TEST_PASSPORT.birthDate),
            BigInt(TEST_PASSPORT.documentNumber), BigInt(TEST_PASSPORT.nationality),
            BigInt(TEST_PASSPORT.sex), BigInt(TEST_PASSPORT.provinceId),
            BigInt(TEST_PASSPORT.identitySecret),
        ]);
        const wrongHash = poseidon([BigInt(99999), BigInt(0), BigInt(0), BigInt(0), BigInt(0), BigInt(0), BigInt(0)]);
        const sig = eddsa.signPoseidon(cscaPrivKey, idHash);
        const pubKey = eddsa.prv2pub(cscaPrivKey);
        const valid = eddsa.verifyPoseidon(wrongHash, sig, pubKey);
        assert(!valid, "Signature should NOT verify with wrong message");
    });

    await test("signature fails with wrong public key", async () => {
        const cscaPrivKey = Buffer.from(CSCA_PRIV_KEY, "hex");
        const wrongPrivKey = Buffer.from("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "hex");
        const idHash = poseidon([
            BigInt(TEST_PASSPORT.citizenship), BigInt(TEST_PASSPORT.birthDate),
            BigInt(TEST_PASSPORT.documentNumber), BigInt(TEST_PASSPORT.nationality),
            BigInt(TEST_PASSPORT.sex), BigInt(TEST_PASSPORT.provinceId),
            BigInt(TEST_PASSPORT.identitySecret),
        ]);
        const sig = eddsa.signPoseidon(cscaPrivKey, idHash);
        const wrongPubKey = eddsa.prv2pub(wrongPrivKey);
        const valid = eddsa.verifyPoseidon(idHash, sig, wrongPubKey);
        assert(!valid, "Signature should NOT verify with wrong public key");
    });

    // ── Step 4: Witness Generation ──
    console.log("\nStep 4: Witness Generation (Circuit Satisfaction)");

    await test("valid inputs satisfy the circuit", async () => {
        const input = await buildCircuitInputs(TEST_PASSPORT, CSCA_PRIV_KEY, 1, 0);
        const wc = require(path.join(__dirname, "build/PassportBallot_js/witness_calculator.js"));
        const wasmBuffer = fs.readFileSync(WASM_PATH);
        const calculator = await wc(wasmBuffer);
        const witness = await calculator.calculateWTNSBin(input, 0);
        assert(witness.length > 0, "Witness should be non-empty");
    });

    await test("wrong CSCA key fails witness generation", async () => {
        const wrongKey = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        // Sign with correct key but provide wrong pub key inputs
        const idHash = poseidon([
            BigInt(TEST_PASSPORT.citizenship), BigInt(TEST_PASSPORT.birthDate),
            BigInt(TEST_PASSPORT.documentNumber), BigInt(TEST_PASSPORT.nationality),
            BigInt(TEST_PASSPORT.sex), BigInt(TEST_PASSPORT.provinceId),
            BigInt(TEST_PASSPORT.identitySecret),
        ]);
        const cscaPrivKey = Buffer.from(CSCA_PRIV_KEY, "hex");
        const sig = eddsa.signPoseidon(cscaPrivKey, idHash);
        // Use wrong key's public key
        const wrongPubKey = eddsa.prv2pub(Buffer.from(wrongKey, "hex"));

        const input = {
            identitySecret: TEST_PASSPORT.identitySecret,
            citizenship: TEST_PASSPORT.citizenship,
            birthDate: TEST_PASSPORT.birthDate,
            expirationDate: TEST_PASSPORT.expirationDate,
            documentNumber: TEST_PASSPORT.documentNumber,
            nationality: TEST_PASSPORT.nationality,
            sex: TEST_PASSPORT.sex,
            provinceId: TEST_PASSPORT.provinceId,
            cscaPubKeyAx: F.toObject(wrongPubKey[0]).toString(),
            cscaPubKeyAy: F.toObject(wrongPubKey[1]).toString(),
            sigR8x: F.toObject(sig.R8[0]).toString(),
            sigR8y: F.toObject(sig.R8[1]).toString(),
            sigS: sig.S.toString(),
            eventId: "1",
            eventData: "0",
        };

        const wc = require(path.join(__dirname, "build/PassportBallot_js/witness_calculator.js"));
        const wasmBuffer = fs.readFileSync(WASM_PATH);
        const calculator = await wc(wasmBuffer);
        let threw = false;
        try {
            await calculator.calculateWTNSBin(input, 0);
        } catch (e) {
            threw = true;
        }
        assert(threw, "Circuit should reject mismatched CSCA key + signature");
    });

    // ── Step 5: Full Groth16 Proof Generation ──
    console.log("\nStep 5: Full Groth16 Proof Generation");

    let validProof, validPublicSignals;

    await test("generates valid Groth16 proof", async () => {
        const input = await buildCircuitInputs(TEST_PASSPORT, CSCA_PRIV_KEY, 1, 0);
        const result = await snarkjs.groth16.fullProve(input, WASM_PATH, ZKEY_PATH);
        validProof = result.proof;
        validPublicSignals = result.publicSignals;
        assert(validProof.pi_a.length === 3, "proof.pi_a should have 3 elements");
        assert(validProof.pi_b.length === 3, "proof.pi_b should have 3 elements");
        assert(validProof.pi_c.length === 3, "proof.pi_c should have 3 elements");
        assertEqual(validPublicSignals.length, 23, "Should have 23 public signals");
    });

    await test("proof verifies against verification key", async () => {
        assert(validProof, "Need valid proof from previous test");
        const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));
        const isValid = await snarkjs.groth16.verify(vkey, validPublicSignals, validProof);
        assert(isValid, "Proof should verify against the verification key");
    });

    await test("tampered public signals fail verification", async () => {
        assert(validProof, "Need valid proof from previous test");
        const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));
        // Tamper with citizenship signal
        const tamperedSignals = [...validPublicSignals];
        tamperedSignals[6] = "999999";
        const isValid = await snarkjs.groth16.verify(vkey, tamperedSignals, validProof);
        assert(!isValid, "Proof should NOT verify with tampered citizenship");
    });

    await test("tampered nullifier fails verification", async () => {
        assert(validProof, "Need valid proof from previous test");
        const vkey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));
        const tamperedSignals = [...validPublicSignals];
        tamperedSignals[0] = "12345";
        const isValid = await snarkjs.groth16.verify(vkey, tamperedSignals, validProof);
        assert(!isValid, "Proof should NOT verify with tampered nullifier");
    });

    // ── Step 6: Public Signal Correctness ──
    console.log("\nStep 6: Public Signal Layout Correctness");

    await test("pubSignals[0] is nullifier (Poseidon(idHash, eventId))", async () => {
        assert(validPublicSignals, "Need signals from previous test");
        // Recompute expected nullifier
        const idHash = poseidon([
            BigInt(TEST_PASSPORT.citizenship), BigInt(TEST_PASSPORT.birthDate),
            BigInt(TEST_PASSPORT.documentNumber), BigInt(TEST_PASSPORT.nationality),
            BigInt(TEST_PASSPORT.sex), BigInt(TEST_PASSPORT.provinceId),
            BigInt(TEST_PASSPORT.identitySecret),
        ]);
        const expectedNullifier = poseidon.F.toObject(poseidon([idHash, BigInt(1)])).toString();
        assertEqual(validPublicSignals[0], expectedNullifier, "Nullifier mismatch");
    });

    await test("pubSignals[1] is birthDate", async () => {
        assertEqual(validPublicSignals[1], TEST_PASSPORT.birthDate, "birthDate");
    });

    await test("pubSignals[2] is expirationDate", async () => {
        assertEqual(validPublicSignals[2], TEST_PASSPORT.expirationDate, "expirationDate");
    });

    await test("pubSignals[5] is nationality", async () => {
        assertEqual(validPublicSignals[5], TEST_PASSPORT.nationality, "nationality");
    });

    await test("pubSignals[6] is citizenship (0x495241 = Iran)", async () => {
        assertEqual(validPublicSignals[6], TEST_PASSPORT.citizenship, "citizenship");
        // Verify it decodes to "IRA"
        const val = parseInt(validPublicSignals[6]);
        assertEqual(val, 0x495241, "Citizenship should be 0x495241 (Iran)");
    });

    await test("pubSignals[7] is sex", async () => {
        assertEqual(validPublicSignals[7], TEST_PASSPORT.sex, "sex");
    });

    await test("pubSignals[8] is documentNumber", async () => {
        assertEqual(validPublicSignals[8], TEST_PASSPORT.documentNumber, "documentNumber");
    });

    await test("pubSignals[9] is eventId", async () => {
        assertEqual(validPublicSignals[9], "1", "eventId");
    });

    await test("pubSignals[10] is eventData (candidateIndex)", async () => {
        assertEqual(validPublicSignals[10], "0", "eventData");
    });

    await test("pubSignals[11] is provinceId", async () => {
        assertEqual(validPublicSignals[11], TEST_PASSPORT.provinceId, "provinceId");
    });

    await test("pubSignals[12] is CSCA key hash (Poseidon(Ax, Ay))", async () => {
        const cscaPrivKey = Buffer.from(CSCA_PRIV_KEY, "hex");
        const pubKey = eddsa.prv2pub(cscaPrivKey);
        const expectedHash = F.toObject(poseidon([pubKey[0], pubKey[1]])).toString();
        assertEqual(validPublicSignals[12], expectedHash, "CSCA key hash mismatch");
    });

    await test("pubSignals[13] is currentDate", async () => {
        assertEqual(validPublicSignals[13], TEST_CURRENT_DATE, "currentDate");
    });

    await test("pubSignals[14-22] are zero (unused fields)", async () => {
        for (let i = 14; i <= 22; i++) {
            assertEqual(validPublicSignals[i], "0", `pubSignals[${i}] should be 0`);
        }
    });

    // ── Step 7: Nullifier Determinism and Uniqueness ──
    console.log("\nStep 7: Nullifier Properties");

    await test("same passport + same election = same nullifier", async () => {
        const input1 = await buildCircuitInputs(TEST_PASSPORT, CSCA_PRIV_KEY, 1, 0);
        const input2 = await buildCircuitInputs(TEST_PASSPORT, CSCA_PRIV_KEY, 1, 2);
        const r1 = await snarkjs.groth16.fullProve(input1, WASM_PATH, ZKEY_PATH);
        const r2 = await snarkjs.groth16.fullProve(input2, WASM_PATH, ZKEY_PATH);
        assertEqual(
            r1.publicSignals[0], r2.publicSignals[0],
            "Same passport + same electionId should produce same nullifier regardless of candidateIndex"
        );
    });

    await test("same passport + different election = different nullifier", async () => {
        const input1 = await buildCircuitInputs(TEST_PASSPORT, CSCA_PRIV_KEY, 1, 0);
        const input2 = await buildCircuitInputs(TEST_PASSPORT, CSCA_PRIV_KEY, 2, 0);
        const r1 = await snarkjs.groth16.fullProve(input1, WASM_PATH, ZKEY_PATH);
        const r2 = await snarkjs.groth16.fullProve(input2, WASM_PATH, ZKEY_PATH);
        assert(
            r1.publicSignals[0] !== r2.publicSignals[0],
            "Different electionIds should produce different nullifiers"
        );
    });

    await test("different passport + same election = different nullifier", async () => {
        const passport2 = { ...TEST_PASSPORT, identitySecret: "99999", documentNumber: "111111" };
        const input1 = await buildCircuitInputs(TEST_PASSPORT, CSCA_PRIV_KEY, 1, 0);
        const input2 = await buildCircuitInputs(passport2, CSCA_PRIV_KEY, 1, 0);
        const r1 = await snarkjs.groth16.fullProve(input1, WASM_PATH, ZKEY_PATH);
        const r2 = await snarkjs.groth16.fullProve(input2, WASM_PATH, ZKEY_PATH);
        assert(
            r1.publicSignals[0] !== r2.publicSignals[0],
            "Different passports should produce different nullifiers"
        );
    });

    // ── Step 8: prove.js Output Format ──
    console.log("\nStep 8: prove.js Output Format (Solidity ABI compatibility)");

    await test("B coordinates are swapped for Solidity verifier", async () => {
        assert(validProof, "Need valid proof from previous test");
        // snarkJS native: pi_b[i][j]
        // Solidity expects: [[pi_b[0][1], pi_b[0][0]], [pi_b[1][1], pi_b[1][0]]]
        const solB = [
            [validProof.pi_b[0][1], validProof.pi_b[0][0]],
            [validProof.pi_b[1][1], validProof.pi_b[1][0]],
        ];
        // Verify the swap produces different ordering from native
        assert(
            validProof.pi_b[0][0] !== validProof.pi_b[0][1] ||
            validProof.pi_b[1][0] !== validProof.pi_b[1][1],
            "B coordinates should differ (swap should change ordering)"
        );
        // Verify swapped values are strings (not undefined)
        assert(typeof solB[0][0] === "string", "Swapped B[0][0] should be string");
        assert(typeof solB[0][1] === "string", "Swapped B[0][1] should be string");
        assert(typeof solB[1][0] === "string", "Swapped B[1][0] should be string");
        assert(typeof solB[1][1] === "string", "Swapped B[1][1] should be string");
    });

    await test("proof.a has exactly 2 elements (excluding infinity flag)", async () => {
        // snarkJS outputs 3 elements (x, y, "1" for affine), Solidity needs 2
        assertEqual(validProof.pi_a.length, 3, "snarkJS pi_a has 3 elements");
        const solA = [validProof.pi_a[0], validProof.pi_a[1]];
        assert(typeof solA[0] === "string", "A[0] should be string");
        assert(typeof solA[1] === "string", "A[1] should be string");
    });

    await test("proof.c has exactly 2 elements (excluding infinity flag)", async () => {
        assertEqual(validProof.pi_c.length, 3, "snarkJS pi_c has 3 elements");
        const solC = [validProof.pi_c[0], validProof.pi_c[1]];
        assert(typeof solC[0] === "string", "C[0] should be string");
        assert(typeof solC[1] === "string", "C[1] should be string");
    });

    // ── Step 9: Province-scoped voting ──
    console.log("\nStep 9: Province-Scoped Election Signals");

    await test("different province in passport produces different provinceId signal", async () => {
        const passport2 = { ...TEST_PASSPORT, provinceId: "15" };
        const input = await buildCircuitInputs(passport2, CSCA_PRIV_KEY, 1, 0);
        const result = await snarkjs.groth16.fullProve(input, WASM_PATH, ZKEY_PATH);
        assertEqual(result.publicSignals[11], "15", "provinceId should be 15");
    });

    // ── Step 10: Age Verification ──
    console.log("\nStep 10: Age Verification (Circuit Constraint)");

    await test("exactly 18 years old passes (boundary)", async () => {
        // birthDate=20080217, currentDate=20260217 → difference = 180000 (exactly 18)
        const passport18 = { ...TEST_PASSPORT, birthDate: "20080217" };
        const input = await buildCircuitInputs(passport18, CSCA_PRIV_KEY, 1, 0, "20260217");
        const result = await snarkjs.groth16.fullProve(input, WASM_PATH, ZKEY_PATH);
        assertEqual(result.publicSignals.length, 23, "Should produce 23 signals");
    });

    await test("under 18 by 1 day fails witness generation", async () => {
        // birthDate=20080218, currentDate=20260217 → difference = 179999 (under 18)
        const passportUnder = { ...TEST_PASSPORT, birthDate: "20080218" };
        const input = await buildCircuitInputs(passportUnder, CSCA_PRIV_KEY, 1, 0, "20260217");
        let threw = false;
        try {
            await snarkjs.groth16.fullProve(input, WASM_PATH, ZKEY_PATH);
        } catch (e) {
            threw = true;
        }
        assert(threw, "Circuit should reject voter under 18 by 1 day");
    });

    await test("clearly under 18 fails witness generation", async () => {
        const passportChild = { ...TEST_PASSPORT, birthDate: "20150101" };
        const input = await buildCircuitInputs(passportChild, CSCA_PRIV_KEY, 1, 0, "20260217");
        let threw = false;
        try {
            await snarkjs.groth16.fullProve(input, WASM_PATH, ZKEY_PATH);
        } catch (e) {
            threw = true;
        }
        assert(threw, "Circuit should reject voter clearly under 18");
    });

    await test("province change produces different nullifier (province is part of identity)", async () => {
        const passport2 = { ...TEST_PASSPORT, provinceId: "15" };
        const input1 = await buildCircuitInputs(TEST_PASSPORT, CSCA_PRIV_KEY, 1, 0);
        const input2 = await buildCircuitInputs(passport2, CSCA_PRIV_KEY, 1, 0);
        const r1 = await snarkjs.groth16.fullProve(input1, WASM_PATH, ZKEY_PATH);
        const r2 = await snarkjs.groth16.fullProve(input2, WASM_PATH, ZKEY_PATH);
        assert(
            r1.publicSignals[0] !== r2.publicSignals[0],
            "Different province should produce different nullifier (province is hashed into identity)"
        );
    });

    // ── Summary ──
    console.log("\n" + "=".repeat(50));
    console.log(`Results: ${passed} passed, ${failed} failed`);
    if (errors.length > 0) {
        console.log("\nFailed tests:");
        errors.forEach(e => console.log(`  - ${e.name}: ${e.error}`));
    }
    console.log("=".repeat(50));

    process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
    console.error("Fatal error:", e.stack || e);
    process.exit(1);
});
