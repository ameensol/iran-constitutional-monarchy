/**
 * PassportBallot proof generator.
 * Called via Foundry FFI: node circuits/prove.js '{"identitySecret":"...", ...}'
 *
 * Takes passport data + CSCA private key, signs the identity hash with EdDSA,
 * generates a Groth16 proof, and outputs the proof + public signals as JSON.
 */

const snarkjs = require("snarkjs");
const path = require("path");

async function main() {
    const { buildEddsa, buildPoseidon } = await import("circomlibjs");

    const args = JSON.parse(process.argv[2]);

    const eddsa = await buildEddsa();
    const poseidon = await buildPoseidon();
    const F = poseidon.F;

    // 1. Create identity hash from passport data (includes province)
    //    Poseidon returns a field element (Uint8Array in circomlibjs)
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
    //    signPoseidon expects the message as a field element (Uint8Array), not BigInt
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

    // 5. Output as JSON for Foundry FFI
    // Note: snarkJS outputs B coordinates in a different order than Solidity expects.
    // The [1][0]/[0][1] swap is standard and documented in snarkJS.
    const result = {
        a: [proof.pi_a[0], proof.pi_a[1]],
        b: [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]],
        c: [proof.pi_c[0], proof.pi_c[1]],
        pubSignals: publicSignals
    };

    process.stdout.write(JSON.stringify(result));
}

main().catch(e => { process.stderr.write(e.stack || e.toString()); process.exit(1); });
