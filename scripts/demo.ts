import { ethers } from "hardhat";
import chalk from "chalk";
import { generateAgeProof } from "./prove";

const REGISTRY_ABI = [
  "function submitProof(uint[2] a, uint[2][2] b, uint[2] c, uint[2] input) external",
  "function isAdult(address subject) external returns (bool)",
  "function getRecord(address subject) external view returns (tuple(bool is_adult, uint256 timestamp, uint256 proof_year))",
  "function verifier() external view returns (address)",
  "function owner() external view returns (address)",
];

function line(label: string, value: string, color: typeof chalk.green = chalk.white) {
  console.log(chalk.gray("  │ ") + chalk.white(label.padEnd(24)) + color(value));
}

function header(title: string) {
  console.log(chalk.gray("  ┌─────────────────────────────────────────────────────────┐"));
  console.log(chalk.gray("  │ ") + chalk.bold.cyan(title.padEnd(56)) + chalk.gray("│"));
  console.log(chalk.gray("  ├─────────────────────────────────────────────────────────┤"));
}

function footer() {
  console.log(chalk.gray("  └─────────────────────────────────────────────────────────┘"));
}

async function main() {
  const registryAddress = process.env.MONAD_REGISTRY_ADDRESS;
  if (!registryAddress || registryAddress === "0x...") {
    console.error(chalk.red("  MONAD_REGISTRY_ADDRESS nao configurado no .env"));
    process.exit(1);
  }

  const [signer] = await ethers.getSigners();
  const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, signer);
  const currentYear = new Date().getFullYear();
  const birthYear = 1990;

  console.log(chalk.bold.cyan("\n  ╔═══════════════════════════════════════════════════════════╗"));
  console.log(chalk.bold.cyan("  ║     DPO2U x Monad — Demo Funcional (Monad Testnet)       ║"));
  console.log(chalk.bold.cyan("  ║     Verificacao de Maioridade com ZK Proofs Nativos       ║"));
  console.log(chalk.bold.cyan("  ╚═══════════════════════════════════════════════════════════╝\n"));

  // ─── Info ───────────────────────────────────────────────────────────────
  header("1. INFORMACOES DO CONTRATO");
  line("Registry", registryAddress, chalk.yellow);
  line("Verifier", await registry.verifier(), chalk.yellow);
  line("Owner", await registry.owner(), chalk.yellow);
  line("Rede", "Monad Testnet (chainId 10143)", chalk.cyan);
  line("Signer", signer.address, chalk.yellow);
  const balance = await ethers.provider.getBalance(signer.address);
  line("Saldo", ethers.formatEther(balance) + " MON", chalk.green);
  footer();
  console.log();

  // ─── Step 1: Check before ──────────────────────────────────────────────
  header("2. CONSULTA ANTES DA PROVA");
  const recordBefore = await registry.getRecord(signer.address);
  line("isAdult (antes)", recordBefore.is_adult ? "true" : "false", recordBefore.is_adult ? chalk.green : chalk.red);
  line("timestamp", recordBefore.timestamp.toString());
  line("proof_year", recordBefore.proof_year.toString());
  line("Dados pessoais on-chain", "0 bytes", chalk.bold.green);
  footer();
  console.log();

  // ─── Step 2: Generate ZK Proof ─────────────────────────────────────────
  header("3. GERACAO DA PROVA ZK (off-chain)");
  line("birth_year (PRIVADO)", "****", chalk.red);
  line("current_year (PUBLICO)", currentYear.toString(), chalk.cyan);
  console.log(chalk.gray("  │"));
  console.log(chalk.gray("  │ ") + chalk.dim("  Gerando prova Groth16 via snarkjs..."));

  const proofStart = performance.now();
  const { a, b, c, input, publicSignals } = await generateAgeProof(birthYear, currentYear);
  const proofTime = performance.now() - proofStart;

  console.log(chalk.gray("  │"));
  line("Prova gerada em", proofTime.toFixed(0) + " ms", chalk.green);
  line("is_adult_bit (output)", publicSignals[0], publicSignals[0] === "1" ? chalk.bold.green : chalk.red);
  line("current_year (public)", publicSignals[1], chalk.cyan);
  line("birth_year no output?", "NAO — zero knowledge", chalk.bold.green);
  line("Tamanho da prova", "192 bytes (constante)", chalk.cyan);
  footer();
  console.log();

  // ─── Step 3: Submit on-chain ───────────────────────────────────────────
  header("4. SUBMISSAO ON-CHAIN (Monad Testnet)");
  console.log(chalk.gray("  │ ") + chalk.dim("  Enviando submitProof() para a Monad..."));

  const txStart = performance.now();
  const tx = await registry.submitProof(a, b, c, input);
  console.log(chalk.gray("  │"));
  line("TX Hash", tx.hash, chalk.yellow);
  console.log(chalk.gray("  │ ") + chalk.dim("  Aguardando confirmacao..."));

  const receipt = await tx.wait();
  const txTime = performance.now() - txStart;

  line("Bloco", receipt.blockNumber.toString(), chalk.cyan);
  line("Gas usado", receipt.gasUsed.toString(), chalk.cyan);
  line("Tempo total", txTime.toFixed(0) + " ms", chalk.green);
  line("Status", "CONFIRMADO", chalk.bold.green);
  footer();
  console.log();

  // ─── Step 4: Verify on-chain ──────────────────────────────────────────
  header("5. VERIFICACAO POS-REGISTRO");
  const recordAfter = await registry.getRecord(signer.address);
  line("isAdult (depois)", recordAfter.is_adult ? "true" : "false", recordAfter.is_adult ? chalk.bold.green : chalk.red);
  line("timestamp", recordAfter.timestamp.toString(), chalk.cyan);
  line("proof_year", recordAfter.proof_year.toString(), chalk.cyan);
  line("Dados pessoais on-chain", "0 bytes", chalk.bold.green);
  footer();
  console.log();

  // ─── Step 5: Simulate dApp queries ────────────────────────────────────
  header("6. SIMULACAO — dApps CONSULTANDO isAdult()");
  const dapps = ["MonadSwap", "MegaDEX", "ZKBridge", "MonadLend", "CryptoKids"];

  for (const dapp of dapps) {
    const queryStart = performance.now();
    const result = await registry.isAdult.staticCall(signer.address);
    const queryTime = performance.now() - queryStart;
    line(
      `[${dapp}]`,
      `isAdult = ${result} (${queryTime.toFixed(0)}ms)`,
      result ? chalk.green : chalk.red
    );
  }

  // Query random address (should be false)
  const randomAddr = ethers.Wallet.createRandom().address;
  const result = await registry.isAdult.staticCall(randomAddr);
  line(
    `[Addr desconhecido]`,
    `isAdult = ${result} (nao registrado)`,
    chalk.red
  );
  footer();

  // ─── Summary ──────────────────────────────────────────────────────────
  console.log();
  console.log(chalk.bold.green("  ╔═══════════════════════════════════════════════════════════╗"));
  console.log(chalk.bold.green("  ║                    DEMO COMPLETA                          ║"));
  console.log(chalk.bold.green("  ╠═══════════════════════════════════════════════════════════╣"));
  console.log(chalk.green("  ║  Prova ZK gerada:        " + chalk.bold("off-chain (snarkjs Groth16)") + "       ║"));
  console.log(chalk.green("  ║  Verificacao on-chain:    " + chalk.bold("Verifier.sol (matematica)") + "        ║"));
  console.log(chalk.green("  ║  Registro on-chain:       " + chalk.bold("ComplianceRegistry.sol") + "           ║"));
  console.log(chalk.green("  ║  birth_year exposto:      " + chalk.bold("NUNCA") + "                            ║"));
  console.log(chalk.green("  ║  Dados pessoais on-chain: " + chalk.bold("0 bytes") + "                          ║"));
  console.log(chalk.green("  ║  Autoridade central:      " + chalk.bold("NENHUMA") + "                          ║"));
  console.log(chalk.bold.green("  ╚═══════════════════════════════════════════════════════════╝"));
  console.log();
  console.log(chalk.dim("  ECA Digital (Lei 15.211) + LGPD (Lei 13.709) compliant"));
  console.log(chalk.dim("  Zero dados pessoais. Zero knowledge. Full compliance.\n"));
}

main().catch((error) => {
  console.error(chalk.red("Erro:"), error.message || error);
  process.exit(1);
});
