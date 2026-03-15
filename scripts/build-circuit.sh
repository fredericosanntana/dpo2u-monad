#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

CIRCUIT=circuits/age_check.circom
BUILD=build
CONTRACTS=contracts

echo "=== DPO2U ZK Circuit Build Pipeline ==="

# 1. Create build directory
mkdir -p "$BUILD"

# 2. Compile circuit
echo "[1/6] Compiling circuit..."
npx circom2 "$CIRCUIT" --r1cs --wasm --sym -o "$BUILD" -l node_modules

# 3. Powers of Tau (Phase 1)
echo "[2/6] Powers of Tau ceremony (phase 1)..."
npx snarkjs powersoftau new bn128 12 "$BUILD/pot12_0000.ptau" -v
npx snarkjs powersoftau contribute "$BUILD/pot12_0000.ptau" "$BUILD/pot12_0001.ptau" \
  --name="DPO2U contribution" -e="random entropy for dpo2u"
npx snarkjs powersoftau prepare phase2 "$BUILD/pot12_0001.ptau" "$BUILD/pot12_final.ptau" -v

# 4. Circuit setup (Phase 2)
echo "[3/6] Groth16 setup (phase 2)..."
npx snarkjs groth16 setup "$BUILD/age_check.r1cs" "$BUILD/pot12_final.ptau" "$BUILD/age_check_0000.zkey"
npx snarkjs zkey contribute "$BUILD/age_check_0000.zkey" "$BUILD/age_check_final.zkey" \
  --name="DPO2U phase2" -e="more random entropy"

# 5. Export verification key
echo "[4/6] Exporting verification key..."
npx snarkjs zkey export verificationkey "$BUILD/age_check_final.zkey" "$BUILD/verification_key.json"

# 6. Export Verifier.sol
echo "[5/6] Generating Verifier.sol..."
npx snarkjs zkey export solidityverifier "$BUILD/age_check_final.zkey" "$CONTRACTS/Verifier.sol"

# Fix pragma if needed (snarkjs may generate ^0.6.11)
echo "[6/6] Fixing Solidity pragma..."
sed -i 's/pragma solidity \^0\.6\.11;/pragma solidity ^0.8.20;/' "$CONTRACTS/Verifier.sol"

echo ""
echo "=== Build complete ==="
echo "  Circuit WASM: $BUILD/age_check_js/age_check.wasm"
echo "  ZKey:         $BUILD/age_check_final.zkey"
echo "  Verifier:     $CONTRACTS/Verifier.sol"
