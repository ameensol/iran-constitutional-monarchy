/**
 * PassportBallot proof generator for Foundry FFI.
 *
 * Same proof generation logic as prove.js, but outputs ABI-encoded hex
 * instead of JSON, so Foundry can decode it directly with abi.decode().
 *
 * Usage: node circuits/prove-ffi.js '{"identitySecret":"...", ...}'
 *
 * Output format (0x-prefixed hex, 992 bytes):
 *   a[0], a[1],                       // uint256[2]
 *   b[0][0], b[0][1], b[1][0], b[1][1], // uint256[2][2] (with snarkJS B swap)
 *   c[0], c[1],                       // uint256[2]
 *   pubSignals[0..22]                 // uint256[23]
 */

const snarkjs = require("snarkjs");
const path = require("path");

function toHex256(val) {
    return BigInt(val).toString(16).padStart(64, '0');
}

async function main() {
    const { buildEddsa, buildPoseidon } = await import("circomlibjs");

    const args = JSON.parse(process.argv[2]);

    const eddsa = await buildEddsa();
    const poseidon = await buildPoseidon();
    const F = poseidon.F;

    // 1. Create identity hash from passport data (includes province)
    const idHash = poseidon([
        BigInt(args.citizenship),
        BigInt(args.birthDate),
        BigInt(args.documentNumber),
        BigInt(args.nationality),
        BigInt(args.sex),
        BigInt(args.provinceId),
        BigInt(args.identitySecret)
    ]);

    // 2. Sign with CSCA (EdDSA over Baby Jubjub)
    const cscaPrivKey = Buffer.from(args.cscaPrivKey, "hex");
    const signature = eddsa.signPoseidon(cscaPrivKey, idHash);
    const pubKey = eddsa.prv2pub(cscaPrivKey);

    // 3. Build circuit inputs (all values as strings for snarkJS)
    const input = {
        identitySecret: args.identitySecret.toString(),
        citizenship: args.citizenship.toString(),
        birthDate: args.birthDate.toString(),
        expirationDate: args.expirationDate.toString(),
        documentNumber: args.documentNumber.toString(),
        nationality: args.nationality.toString(),
        sex: args.sex.toString(),
        provinceId: args.provinceId.toString(),
        cscaPubKeyAx: F.toObject(pubKey[0]).toString(),
        cscaPubKeyAy: F.toObject(pubKey[1]).toString(),
        sigR8x: F.toObject(signature.R8[0]).toString(),
        sigR8y: F.toObject(signature.R8[1]).toString(),
        sigS: signature.S.toString(),
        currentDate: args.currentDate.toString(),
        eventId: args.eventId.toString(),
        eventData: args.eventData.toString()
    };

    // 4. Generate Groth16 proof
    const wasmPath = path.join(__dirname, "build/PassportBallot_js/PassportBallot.wasm");
    const zkeyPath = path.join(__dirname, "build/PassportBallot_final.zkey");

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);

    // 5. Output as ABI-encoded hex for Foundry FFI
    //    Layout matches: abi.decode(result, (uint256[2], uint256[2][2], uint256[2], uint256[23]))
    //
    //    Note: snarkJS outputs B coordinates in a different order than Solidity expects.
    //    The [1][0]/[0][1] swap is standard and documented in snarkJS.
    let hex = "0x";

    // a[2]
    hex += toHex256(proof.pi_a[0]);
    hex += toHex256(proof.pi_a[1]);

    // b[2][2] (with coordinate swap for Solidity)
    hex += toHex256(proof.pi_b[0][1]);
    hex += toHex256(proof.pi_b[0][0]);
    hex += toHex256(proof.pi_b[1][1]);
    hex += toHex256(proof.pi_b[1][0]);

    // c[2]
    hex += toHex256(proof.pi_c[0]);
    hex += toHex256(proof.pi_c[1]);

    // pubSignals[23]
    for (let i = 0; i < 23; i++) {
        hex += toHex256(publicSignals[i]);
    }

    process.stdout.write(hex);
    process.exit(0);
}

main().catch(e => { process.stderr.write(e.stack || e.toString()); process.exit(1); });
