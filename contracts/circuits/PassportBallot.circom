pragma circom 2.1.0;

include "../node_modules/circomlib/circuits/eddsaposeidon.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

// Simplified passport verification circuit for POC.
// Proves: (1) CSCA signed the passport data, (2) computes unique nullifier,
// (3) exposes public signals for on-chain validation.
template PassportBallot() {
    // ── Private Inputs (hidden from verifier) ──
    signal input identitySecret;    // citizen's secret (prevents identity theft)
    signal input citizenship;       // ISO 3166-1 alpha-3 encoded (0x495241 = Iran)
    signal input birthDate;         // YYYYMMDD encoded as integer
    signal input expirationDate;    // YYYYMMDD encoded as integer
    signal input documentNumber;    // hashed document number
    signal input nationality;       // ISO country code
    signal input sex;               // M=1, F=2
    signal input provinceId;        // 1-31 (assigned by CSCA at registration)

    // ── CSCA EdDSA Signature (proves passport office authorized this data) ──
    signal input cscaPubKeyAx;      // CSCA public key x-coordinate (Baby Jubjub)
    signal input cscaPubKeyAy;      // CSCA public key y-coordinate
    signal input sigR8x;            // Signature R point x
    signal input sigR8y;            // Signature R point y
    signal input sigS;              // Signature scalar

    // ── Age Verification ──
    signal input currentDate;       // YYYYMMDD format (private, exposed as public output)

    // ── Election Binding ──
    signal input eventId;           // election ID
    signal input eventData;         // candidate index or vote choice

    // ── Public Outputs (23 signals, matching PublicSignalsBuilder layout) ──
    signal output out[23];

    // 1. Hash passport data into identity commitment (includes province)
    component idHasher = Poseidon(7);
    idHasher.inputs[0] <== citizenship;
    idHasher.inputs[1] <== birthDate;
    idHasher.inputs[2] <== documentNumber;
    idHasher.inputs[3] <== nationality;
    idHasher.inputs[4] <== sex;
    idHasher.inputs[5] <== provinceId;
    idHasher.inputs[6] <== identitySecret;

    // 2. Verify CSCA EdDSA signature over identity hash.
    //    This proves the passport office certified this identity data.
    component eddsaVerifier = EdDSAPoseidonVerifier();
    eddsaVerifier.enabled <== 1;
    eddsaVerifier.Ax <== cscaPubKeyAx;
    eddsaVerifier.Ay <== cscaPubKeyAy;
    eddsaVerifier.R8x <== sigR8x;
    eddsaVerifier.R8y <== sigR8y;
    eddsaVerifier.S <== sigS;
    eddsaVerifier.M <== idHasher.out;

    // 3. Compute nullifier (unique per citizen per election)
    component nullHasher = Poseidon(2);
    nullHasher.inputs[0] <== idHasher.out;
    nullHasher.inputs[1] <== eventId;

    // 4. Compute CSCA key hash (Poseidon(Ax, Ay)) for on-chain verification
    component cscaHasher = Poseidon(2);
    cscaHasher.inputs[0] <== cscaPubKeyAx;
    cscaHasher.inputs[1] <== cscaPubKeyAy;

    // 5. Age verification: voter must be >= 18 years old
    //    YYYYMMDD arithmetic: 20260217 - 20080217 = 180000 (exactly 18)
    component ageCheck = GreaterEqThan(32);
    ageCheck.in[0] <== currentDate - birthDate;
    ageCheck.in[1] <== 180000;
    ageCheck.out === 1;

    // 6. Map to 23 public outputs
    out[0] <== nullHasher.out;     // nullifier
    out[1] <== birthDate;          // birthDate
    out[2] <== expirationDate;     // expirationDate
    out[3] <== 0;                  // name (unused in POC)
    out[4] <== 0;                  // nameResidual (unused)
    out[5] <== nationality;        // nationality
    out[6] <== citizenship;        // citizenship
    out[7] <== sex;                // sex
    out[8] <== documentNumber;     // documentNumberHash
    out[9] <== eventId;            // eventId
    out[10] <== eventData;         // eventData
    out[11] <== provinceId;        // provinceId (for province-scoped elections)
    out[12] <== cscaHasher.out;     // CSCA key hash (Poseidon(Ax, Ay))
    out[13] <== currentDate;       // currentDate (YYYYMMDD, for on-chain freshness check)
    out[14] <== 0;                 // timestampLowerbound
    out[15] <== 0;                 // timestampUpperbound
    out[16] <== 0;                 // identityCounterLowerbound
    out[17] <== 0;                 // identityCounterUpperbound
    out[18] <== 0;                 // birthDateLowerbound
    out[19] <== 0;                 // birthDateUpperbound
    out[20] <== 0;                 // expirationDateLowerbound
    out[21] <== 0;                 // expirationDateUpperbound
    out[22] <== 0;                 // citizenshipMask
}

component main = PassportBallot();
