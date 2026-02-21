#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "=== 1. Compiling circuit ==="
circom circuits/PassportBallot.circom \
  --r1cs --wasm --sym \
  -o circuits/build/ \
  -l node_modules

echo "=== 2. Powers of Tau (Phase 1) ==="
npx snarkjs powersoftau new bn128 14 circuits/build/pot14_0.ptau -v
npx snarkjs powersoftau contribute circuits/build/pot14_0.ptau circuits/build/pot14_1.ptau \
  --name="POC ceremony" -e="random entropy for shah governance POC"
npx snarkjs powersoftau prepare phase2 circuits/build/pot14_1.ptau circuits/build/pot14_final.ptau -v

echo "=== 3. Circuit-specific setup (Phase 2) ==="
npx snarkjs groth16 setup circuits/build/PassportBallot.r1cs \
  circuits/build/pot14_final.ptau circuits/build/PassportBallot_0.zkey
npx snarkjs zkey contribute circuits/build/PassportBallot_0.zkey \
  circuits/build/PassportBallot_final.zkey --name="POC" -e="more entropy for shah governance POC"

echo "=== 4. Export verification key ==="
npx snarkjs zkey export verificationkey circuits/build/PassportBallot_final.zkey \
  circuits/build/verification_key.json

echo "=== 5. Export Solidity verifier ==="
npx snarkjs zkey export solidityverifier circuits/build/PassportBallot_final.zkey \
  src/verifiers/GeneratedBallotVerifier.sol

# Patch the generated verifier:
# 1. Change pragma to ^0.8.20 (snarkjs generates >=0.7.0)
# 2. Rename contract to GeneratedBallotVerifier (snarkjs names it Groth16Verifier)
sed -i '' 's/pragma solidity >=0.7.0;/pragma solidity ^0.8.20;/' src/verifiers/GeneratedBallotVerifier.sol
sed -i '' 's/contract Groth16Verifier/contract GeneratedBallotVerifier/' src/verifiers/GeneratedBallotVerifier.sol

echo "=== Done! ==="
echo "Circuit WASM: circuits/build/PassportBallot_js/PassportBallot.wasm"
echo "Proving key:  circuits/build/PassportBallot_final.zkey"
echo "Verifier:     src/verifiers/GeneratedBallotVerifier.sol"
