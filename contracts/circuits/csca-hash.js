/**
 * Compute Poseidon(Ax, Ay) for the test CSCA key.
 * Used to hardcode the expected hash in ZKIntegration.t.sol.
 *
 * Run: node circuits/csca-hash.js
 */

const CSCA_PRIV_KEY = "0001020304050607080900010203040506070809000102030405060708090001";

async function main() {
    const { buildEddsa, buildPoseidon } = await import("circomlibjs");

    const eddsa = await buildEddsa();
    const poseidon = await buildPoseidon();
    const F = poseidon.F;

    const cscaPrivKey = Buffer.from(CSCA_PRIV_KEY, "hex");
    const pubKey = eddsa.prv2pub(cscaPrivKey);

    const ax = F.toObject(pubKey[0]);
    const ay = F.toObject(pubKey[1]);
    const hash = F.toObject(poseidon([pubKey[0], pubKey[1]]));

    console.log("CSCA Public Key Ax:", ax.toString());
    console.log("CSCA Public Key Ay:", ay.toString());
    console.log("CSCA Key Hash (Poseidon(Ax, Ay)):", hash.toString());
    console.log("CSCA Key Hash (hex):", "0x" + hash.toString(16));
}

main().catch(e => { console.error(e); process.exit(1); });
