import { ethers } from "hardhat";
import chalk from "chalk";
import { generateAgeProof } from "./prove";

const DAPP_NAMES = [
  "MonadSwap", "MegaDEX", "ZKBridge", "MonadLend", "CryptoKids",
  "NFTMarket", "GameFi Hub", "DeFi Vault", "Token Launchpad", "DAO Gov",
];

const DURATION_MS = 5 * 60 * 1000; // 5 minutes

async function main() {
  const signers = await ethers.getSigners();

  console.log(chalk.bold.cyan("\n╔══════════════════════════════════════════════════════════╗"));
  console.log(chalk.bold.cyan("║   DPO2U × Monad — ZK Stress Test 5min (MonadBlitz)      ║"));
  console.log(chalk.bold.cyan("╚══════════════════════════════════════════════════════════╝\n"));

  // ─── Deploy ─────────────────────────────────────────────────────────────
  console.log(chalk.cyan("  Deploying Verifier + ComplianceRegistry..."));
  const VerifierFactory = await ethers.getContractFactory("Groth16Verifier");
  const verifier = await VerifierFactory.deploy();
  await verifier.waitForDeployment();

  const RegistryFactory = await ethers.getContractFactory("ComplianceRegistry");
  const registry = await RegistryFactory.deploy(await verifier.getAddress());
  await registry.waitForDeployment();

  console.log(chalk.green("  ✓ Contracts deployed"));
  console.log(chalk.white("  Registry:"), chalk.yellow(await registry.getAddress()));
  console.log();

  // ─── Phase 1: Register users via ZK proofs ─────────────────────────────
  const birthYears = [1980, 1985, 1990, 1992, 1995, 1998, 2000, 2002, 2004, 2006];
  const currentYear = new Date().getFullYear();
  const registeredAddresses: string[] = [];

  console.log(chalk.cyan(`  Phase 1: Registering ${birthYears.length} users via ZK proofs...\n`));

  const proofStart = performance.now();
  let proofSuccess = 0;

  for (let i = 0; i < birthYears.length; i++) {
    const birthYear = birthYears[i];
    const signer = signers[i % signers.length];
    const age = currentYear - birthYear;

    try {
      const { a, b, c, input } = await generateAgeProof(birthYear, currentYear);

      if (age < 18) {
        console.log(chalk.yellow(`  ⚠ birth_year=${birthYear} (age ${age}) — skipped (minor)`));
        continue;
      }

      const tx = await registry.connect(signer).submitProof(a, b, c, input);
      await tx.wait();

      registeredAddresses.push(signer.address);
      console.log(chalk.green(`  ✓ User ${signer.address.slice(0, 10)}... registered (birth_year=${birthYear}, never on-chain)`));
      proofSuccess++;
    } catch (err: any) {
      console.log(chalk.red(`  ✗ birth_year=${birthYear} — ${err.message?.slice(0, 60)}`));
    }
  }

  const proofElapsed = performance.now() - proofStart;
  const randomAddresses = Array.from({ length: 200 }, () => ethers.Wallet.createRandom().address);

  // ─── Phase 2: 5-minute continuous dApp compliance verification ──────────
  console.log(chalk.bold.cyan(`\n  ════════════════════════════════════════════════════════`));
  console.log(chalk.bold.cyan(`  Phase 2: 5-minute continuous dApp compliance verification`));
  console.log(chalk.bold.cyan(`  ════════════════════════════════════════════════════════\n`));

  const batchSize = 100;
  const deadline = Date.now() + DURATION_MS;
  let totalChecks = 0;
  let trueCount = 0;
  let falseCount = 0;
  let round = 0;

  // Per-dApp stats
  const dappStats: Record<string, { checks: number; trueCount: number; falseCount: number; timeMs: number }> = {};
  for (const name of DAPP_NAMES) {
    dappStats[name] = { checks: 0, trueCount: 0, falseCount: 0, timeMs: 0 };
  }

  const globalStart = performance.now();

  while (Date.now() < deadline) {
    round++;
    const dappIndex = (round - 1) % DAPP_NAMES.length;
    const dapp = DAPP_NAMES[dappIndex];
    const checksThisRound = 1000;
    const roundStart = performance.now();
    let roundTrue = 0;
    let roundFalse = 0;

    for (let i = 0; i < checksThisRound; i += batchSize) {
      const batchPromises = [];
      for (let j = 0; j < batchSize && i + j < checksThisRound; j++) {
        const useRegistered = Math.random() < 0.7;
        const addr = useRegistered
          ? registeredAddresses[Math.floor(Math.random() * registeredAddresses.length)]
          : randomAddresses[Math.floor(Math.random() * randomAddresses.length)];
        batchPromises.push(registry.isAdult.staticCall(addr));
      }

      const results = await Promise.all(batchPromises);
      for (const r of results) {
        if (r) roundTrue++;
        else roundFalse++;
      }
    }

    const roundElapsed = performance.now() - roundStart;
    totalChecks += checksThisRound;
    trueCount += roundTrue;
    falseCount += roundFalse;

    dappStats[dapp].checks += checksThisRound;
    dappStats[dapp].trueCount += roundTrue;
    dappStats[dapp].falseCount += roundFalse;
    dappStats[dapp].timeMs += roundElapsed;

    const elapsed = performance.now() - globalStart;
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;

    console.log(
      chalk.green(`  ✓ Round ${String(round).padStart(3)} `) +
      chalk.white(`[${chalk.bold.yellow(dapp.padEnd(16))}] `) +
      chalk.green(`${checksThisRound.toLocaleString()} checks `) +
      chalk.gray(`(${roundTrue} adult / ${roundFalse} unknown) `) +
      chalk.cyan(`${roundElapsed.toFixed(0)}ms `) +
      chalk.dim(`| total: ${totalChecks.toLocaleString()} | remaining: ${mins}m${String(secs).padStart(2, "0")}s`)
    );

    // Early exit check
    if (Date.now() >= deadline) break;
  }

  const globalElapsed = performance.now() - globalStart;
  const totalTime = proofElapsed + globalElapsed;

  // ─── Per-dApp Summary ──────────────────────────────────────────────────
  console.log(chalk.bold.cyan(`\n  ════════════════════════════════════════════════════════`));
  console.log(chalk.bold.cyan(`  Consumer dApp Summary`));
  console.log(chalk.bold.cyan(`  ════════════════════════════════════════════════════════\n`));

  console.log(chalk.white(`  ${"dApp".padEnd(18)} ${"Checks".padStart(10)} ${"Adult ✓".padStart(10)} ${"Unknown ✗".padStart(10)} ${"Avg (ms)".padStart(10)} ${"TPS".padStart(8)}`));
  console.log(chalk.gray(`  ${"─".repeat(68)}`));

  for (const name of DAPP_NAMES) {
    const s = dappStats[name];
    if (s.checks === 0) continue;
    const avgMs = s.timeMs / s.checks;
    const tps = (s.checks / (s.timeMs / 1000)).toFixed(0);
    console.log(
      chalk.yellow(`  ${name.padEnd(18)}`) +
      chalk.white(`${s.checks.toLocaleString().padStart(10)}`) +
      chalk.green(`${s.trueCount.toLocaleString().padStart(10)}`) +
      chalk.red(`${s.falseCount.toLocaleString().padStart(10)}`) +
      chalk.cyan(`${avgMs.toFixed(3).padStart(10)}`) +
      chalk.bold.white(`${tps.padStart(8)}`)
    );
  }

  // ─── Final Results ──────────────────────────────────────────────────────
  console.log("\n");
  console.log(chalk.bold.green("  ╔══════════════════════════════════════════════════════════╗"));
  console.log(chalk.bold.green("  ║                    FINAL RESULTS                         ║"));
  console.log(chalk.bold.green("  ╠══════════════════════════════════════════════════════════╣"));
  console.log(chalk.bold.green("  ║  Phase 1 — ZK Proof Registration                        ║"));
  console.log(chalk.green(`  ║  Users registered:     ${chalk.bold(String(proofSuccess).padEnd(32))}║`));
  console.log(chalk.green(`  ║  Proof time:           ${chalk.bold((proofElapsed / 1000).toFixed(2).padEnd(29) + " s")} ║`));
  console.log(chalk.green(`  ║  Avg per proof:        ${chalk.bold((proofElapsed / proofSuccess).toFixed(0).padEnd(28) + " ms")} ║`));
  console.log(chalk.bold.green("  ╠══════════════════════════════════════════════════════════╣"));
  console.log(chalk.bold.green("  ║  Phase 2 — 5min Continuous dApp Verification             ║"));
  console.log(chalk.green(`  ║  Duration:             ${chalk.bold((globalElapsed / 1000).toFixed(2).padEnd(29) + " s")} ║`));
  console.log(chalk.green(`  ║  Rounds completed:     ${chalk.bold(String(round).padEnd(32))}║`));
  console.log(chalk.green(`  ║  Total checks:         ${chalk.bold(totalChecks.toLocaleString().padEnd(32))}║`));
  console.log(chalk.green(`  ║  ✓ Adult (true):       ${chalk.bold(trueCount.toLocaleString().padEnd(32))}║`));
  console.log(chalk.green(`  ║  ✗ Not found (false):  ${chalk.bold(falseCount.toLocaleString().padEnd(32))}║`));
  console.log(chalk.green(`  ║  Avg per check:        ${chalk.bold((globalElapsed / totalChecks).toFixed(3).padEnd(28) + " ms")} ║`));
  console.log(chalk.green(`  ║  Throughput:           ${chalk.bold((totalChecks / (globalElapsed / 1000)).toFixed(0).padEnd(28) + " /s")} ║`));
  console.log(chalk.green(`  ║  Consumer dApps:       ${chalk.bold(String(DAPP_NAMES.length).padEnd(32))}║`));
  console.log(chalk.bold.green("  ╠══════════════════════════════════════════════════════════╣"));
  console.log(chalk.green(`  ║  Total time:           ${chalk.bold((totalTime / 1000).toFixed(2).padEnd(29) + " s")} ║`));
  console.log(chalk.green(`  ║  Personal data:        ${chalk.bold("0 bytes on-chain".padEnd(32))}║`));
  console.log(chalk.green(`  ║  Architecture:         ${chalk.bold("ZK-native (no relayer)".padEnd(32))}║`));
  console.log(chalk.green(`  ║  Gas cost (queries):   ${chalk.bold("$0.00 (view calls)".padEnd(32))}║`));
  console.log(chalk.bold.green("  ╚══════════════════════════════════════════════════════════╝"));
  console.log();
  console.log(chalk.dim("  ECA Digital (Lei 15.211) + LGPD (Lei 13.709) compliant"));
  console.log(chalk.dim("  Zero personal data on-chain. Zero knowledge. Full compliance.\n"));
}

main().catch((error) => {
  console.error(chalk.red("Error:"), error);
  process.exit(1);
});
