import * as snarkjs from "snarkjs";
import path from "path";

const WASM_PATH = path.join(__dirname, "..", "build", "age_check_js", "age_check.wasm");
const ZKEY_PATH = path.join(__dirname, "..", "build", "age_check_final.zkey");

export async function generateAgeProof(birthYear: number, currentYear: number = new Date().getFullYear()) {
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    { birth_year: birthYear, current_year: currentYear },
    WASM_PATH,
    ZKEY_PATH
  );

  const calldataRaw = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const [a, b, c, input] = JSON.parse(`[${calldataRaw}]`);

  return { proof, publicSignals, a, b, c, input };
}

export async function submitToMonad(
  birthYear: number,
  registry: any,
  currentYear: number = new Date().getFullYear()
) {
  const { a, b, c, input } = await generateAgeProof(birthYear, currentYear);
  const tx = await registry.submitProof(a, b, c, input);
  const receipt = await tx.wait();
  return { tx, receipt, input };
}
