import { ethers } from "hardhat";
import chalk from "chalk";
import { generateAgeProof } from "./prove";

// ─── ABI ──────────────────────────────────────────────────────────────────────
const REGISTRY_ABI = [
  "function submitProof(uint[2] a, uint[2][2] b, uint[2] c, uint[2] input) external",
  "function isAdult(address subject) external returns (bool)",
  "function getRecord(address subject) external view returns (tuple(bool is_adult, uint256 timestamp, uint256 proof_year))",
  "function verifier() external view returns (address)",
  "event ComplianceQueried(address indexed subject, bool result)",
];

// ─── ANSI Helpers ─────────────────────────────────────────────────────────────
const ESC = "\x1b";
const clearScreen = () => process.stdout.write(`${ESC}[2J${ESC}[H`);
const hideCursor = () => process.stdout.write(`${ESC}[?25l`);
const showCursor = () => process.stdout.write(`${ESC}[?25h`);
const moveTo = (row: number, col: number) => process.stdout.write(`${ESC}[${row};${col}H`);
const clearLine = () => process.stdout.write(`${ESC}[2K`);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function visibleLength(str: string): number {
  // Strip ANSI escape codes to get visible character count
  return str.replace(/\x1b\[[0-9;]*m/g, "").length;
}

function padVisible(str: string, width: number): string {
  const vlen = visibleLength(str);
  return vlen >= width ? str : str + " ".repeat(width - vlen);
}

async function typewriter(text: string, row: number, col: number, delayMs: number = 30) {
  for (let i = 0; i < text.length; i++) {
    moveTo(row, col + i);
    process.stdout.write(text[i]);
    await sleep(delayMs);
  }
}

function progressBar(current: number, total: number, width: number = 30): string {
  const ratio = Math.min(current / total, 1);
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  const pct = Math.round(ratio * 100);
  return chalk.green("█".repeat(filled)) + chalk.gray("░".repeat(empty)) + chalk.white(` ${pct}%`);
}

// ─── DAPP Config ──────────────────────────────────────────────────────────────
const DAPP_NAMES = ["MonadSwap", "MegaDEX", "ZKBridge", "MonadLend", "CryptoKids"];
const DAPP_COLORS = [chalk.cyan, chalk.magenta, chalk.yellow, chalk.blue, chalk.red];

// ─── State ────────────────────────────────────────────────────────────────────
interface DAppState {
  name: string;
  checks: number;
  adults: number;
  unknown: number;
  gas: bigint;
  lastTxMs: number;
}

let running = true;
let dashboardInterval: ReturnType<typeof setInterval> | null = null;

// ═══════════════════════════════════════════════════════════════════════════════
// ACT 1 — The Pitch
// ═══════════════════════════════════════════════════════════════════════════════
async function act1() {
  clearScreen();
  hideCursor();

  const logo = [
    "  ╔══════════════════════════════════════════════════════════════╗",
    "  ║                                                              ║",
    "  ║     ██████╗ ██████╗  ██████╗ ██████╗ ██╗   ██╗              ║",
    "  ║     ██╔══██╗██╔══██╗██╔═══██╗╚════██╗██║   ██║              ║",
    "  ║     ██║  ██║██████╔╝██║   ██║ █████╔╝██║   ██║              ║",
    "  ║     ██║  ██║██╔═══╝ ██║   ██║██╔═══╝ ██║   ██║              ║",
    "  ║     ██████╔╝██║     ╚██████╔╝███████╗╚██████╔╝              ║",
    "  ║     ╚═════╝ ╚═╝      ╚═════╝ ╚══════╝ ╚═════╝              ║",
    "  ║                                                              ║",
    "  ║              ×   M O N A D   T E S T N E T                   ║",
    "  ║                                                              ║",
    "  ╚══════════════════════════════════════════════════════════════╝",
  ];

  for (let i = 0; i < logo.length; i++) {
    moveTo(2 + i, 1);
    process.stdout.write(chalk.bold.cyan(logo[i]));
    await sleep(60);
  }

  await sleep(800);

  const row1 = 16;
  await typewriter("PROBLEMA:", row1, 4, 40);
  moveTo(row1, 14);
  process.stdout.write(chalk.white(" ECA Digital (Lei 15.211) exige verificacao de idade"));
  await sleep(400);
  moveTo(row1 + 1, 14);
  process.stdout.write(chalk.white(" LGPD (Lei 13.709) proibe expor dados pessoais"));
  await sleep(800);

  const row2 = row1 + 3;
  await typewriter("SOLUCAO:", row2, 4, 40);
  moveTo(row2, 13);
  process.stdout.write(chalk.bold.green(" ZK Proofs — provar maioridade SEM revelar birth_year"));
  await sleep(400);
  moveTo(row2 + 1, 13);
  process.stdout.write(chalk.green(" Zero dados pessoais on-chain. Full compliance."));

  await sleep(2000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACT 2 — The ZK Proof
// ═══════════════════════════════════════════════════════════════════════════════
async function act2() {
  clearScreen();
  moveTo(2, 4);
  process.stdout.write(chalk.bold.cyan("ACT 2 — GERACAO DA PROVA ZK"));
  moveTo(3, 4);
  process.stdout.write(chalk.gray("─".repeat(50)));

  // Input
  moveTo(5, 4);
  process.stdout.write(chalk.white("  birth_year = "));
  await typewriter("1990", 5, 19, 100);
  await sleep(600);

  // Redaction animation
  moveTo(5, 19);
  process.stdout.write(chalk.yellow("19██"));
  await sleep(400);
  moveTo(5, 19);
  process.stdout.write(chalk.red("████"));
  await sleep(400);
  moveTo(5, 19);
  process.stdout.write(chalk.bold.red("████") + chalk.red(" [REDACTED — NUNCA EXPOSTO]"));
  await sleep(300);

  moveTo(7, 4);
  process.stdout.write(chalk.white("  current_year = ") + chalk.cyan("2026") + chalk.gray(" (publico)"));

  // Progress bar while generating real proof
  moveTo(9, 4);
  process.stdout.write(chalk.white("  Gerando prova Groth16 via snarkjs..."));

  let proofDone = false;
  let proofResult: Awaited<ReturnType<typeof generateAgeProof>> | null = null;
  const proofStart = performance.now();

  // Launch proof generation concurrently
  const proofPromise = generateAgeProof(1990, 2026).then((r) => {
    proofResult = r;
    proofDone = true;
  });

  // Animate progress bar while waiting
  let tick = 0;
  while (!proofDone) {
    tick++;
    moveTo(10, 4);
    clearLine();
    moveTo(10, 4);
    // Fake progress that never reaches 100% until done
    const fakePct = Math.min(tick * 3, 95);
    process.stdout.write("  " + progressBar(fakePct, 100, 40));
    await sleep(100);
  }
  await proofPromise; // ensure resolved

  const proofTime = performance.now() - proofStart;

  // Show 100%
  moveTo(10, 4);
  clearLine();
  moveTo(10, 4);
  process.stdout.write("  " + progressBar(100, 100, 40));

  await sleep(300);

  // Results
  moveTo(12, 4);
  process.stdout.write(chalk.gray("  ┌─────────────────────────────────────────────────┐"));
  moveTo(13, 4);
  process.stdout.write(chalk.gray("  │ ") + chalk.white("is_adult  = ") + chalk.bold.green("1 (VERDADEIRO)") + chalk.gray("                   │"));
  moveTo(14, 4);
  process.stdout.write(chalk.gray("  │ ") + chalk.white("year      = ") + chalk.cyan("2026") + chalk.gray("                               │"));
  moveTo(15, 4);
  process.stdout.write(chalk.gray("  │ ") + chalk.white("birth_year= ") + chalk.bold.red("NUNCA EXPOSTO") + chalk.gray("                    │"));
  moveTo(16, 4);
  process.stdout.write(chalk.gray("  │ ") + chalk.white("tamanho   = ") + chalk.cyan("192 bytes (constante)") + chalk.gray("            │"));
  moveTo(17, 4);
  process.stdout.write(chalk.gray("  │ ") + chalk.white("tempo     = ") + chalk.green(proofTime.toFixed(0) + " ms") + chalk.gray(" ".repeat(Math.max(0, 31 - (proofTime.toFixed(0).length + 3))) + "│"));
  moveTo(18, 4);
  process.stdout.write(chalk.gray("  └─────────────────────────────────────────────────┘"));

  await sleep(2000);

  return proofResult!;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACT 3 — On-Chain Submission
// ═══════════════════════════════════════════════════════════════════════════════
async function act3(
  registry: ethers.Contract,
  proofData: Awaited<ReturnType<typeof generateAgeProof>>
) {
  clearScreen();
  moveTo(2, 4);
  process.stdout.write(chalk.bold.cyan("ACT 3 — SUBMISSAO ON-CHAIN (Monad Testnet)"));
  moveTo(3, 4);
  process.stdout.write(chalk.gray("─".repeat(50)));

  // Spinner while tx pending
  const spinChars = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let spinIdx = 0;
  let txDone = false;

  moveTo(5, 4);
  process.stdout.write(chalk.white("  Enviando submitProof() para a Monad..."));

  const txStart = performance.now();
  let tx: any;
  let receipt: any;

  const txPromise = (async () => {
    tx = await registry.submitProof(proofData.a, proofData.b, proofData.c, proofData.input);
    // Show hash with typewriter as soon as we have it
    moveTo(7, 4);
    process.stdout.write(chalk.white("  TX Hash: "));
    await typewriter(tx.hash, 7, 15, 15);
    moveTo(9, 4);
    process.stdout.write(chalk.dim("  Aguardando confirmacao..."));
    receipt = await tx.wait();
    txDone = true;
  })();

  // Spinner animation
  while (!txDone) {
    moveTo(5, 2);
    process.stdout.write(chalk.cyan(spinChars[spinIdx % spinChars.length]));
    spinIdx++;
    await sleep(80);
  }
  await txPromise;

  const txTime = performance.now() - txStart;

  moveTo(5, 2);
  process.stdout.write(chalk.green("✓"));

  // Confirmation box
  moveTo(11, 4);
  process.stdout.write(chalk.gray("  ┌─────────────────────────────────────────────────┐"));
  moveTo(12, 4);
  process.stdout.write(chalk.gray("  │ ") + chalk.white("Bloco:   ") + chalk.cyan(String(receipt.blockNumber)) + chalk.gray(" ".repeat(Math.max(0, 36 - String(receipt.blockNumber).length)) + "│"));
  moveTo(13, 4);
  process.stdout.write(chalk.gray("  │ ") + chalk.white("Gas:     ") + chalk.cyan(receipt.gasUsed.toLocaleString()) + chalk.gray(" ".repeat(Math.max(0, 36 - receipt.gasUsed.toLocaleString().length)) + "│"));
  moveTo(14, 4);
  const costStr = ethers.formatEther(receipt.gasUsed * (receipt.gasPrice || 0n));
  process.stdout.write(chalk.gray("  │ ") + chalk.white("Custo:   ") + chalk.cyan(costStr.slice(0, 12) + " MON") + chalk.gray(" ".repeat(Math.max(0, 36 - Math.min(costStr.length, 12) - 4)) + "│"));
  moveTo(15, 4);
  process.stdout.write(chalk.gray("  │ ") + chalk.white("Tempo:   ") + chalk.green(txTime.toFixed(0) + " ms") + chalk.gray(" ".repeat(Math.max(0, 36 - txTime.toFixed(0).length - 3)) + "│"));
  moveTo(16, 4);
  process.stdout.write(chalk.gray("  └─────────────────────────────────────────────────┘"));

  await sleep(500);

  // Big verified box
  moveTo(18, 2);
  process.stdout.write(chalk.bold.green("  ╔══════════════════════════════════════════════════════╗"));
  moveTo(19, 2);
  process.stdout.write(chalk.bold.green("  ║   ✓ VERIFIED — is_adult = true | 0 bytes pessoais   ║"));
  moveTo(20, 2);
  process.stdout.write(chalk.bold.green("  ╚══════════════════════════════════════════════════════╝"));

  await sleep(2500);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACT 4 — Live Dashboard
// ═══════════════════════════════════════════════════════════════════════════════
async function act4(registry: ethers.Contract, signerAddr: string, registryAddr: string) {
  clearScreen();

  const startTime = performance.now();
  const dapps: DAppState[] = DAPP_NAMES.map((name) => ({
    name,
    checks: 0,
    adults: 0,
    unknown: 0,
    gas: 0n,
    lastTxMs: 0,
  }));

  // Generate addresses to query — mix of signer (adult=true) and random
  const randomAddrs = Array.from({ length: 10 }, () => ethers.Wallet.createRandom().address);
  const allAddrs = [signerAddr, signerAddr, signerAddr, ...randomAddrs]; // weighted towards adult

  let totalTx = 0;
  let totalGas = 0n;
  let totalAdults = 0;
  let totalUnknown = 0;

  // ─── Transaction Queue (single nonce) ─────────────────────────────────
  type TxJob = { dappIdx: number; addr: string };
  const txQueue: TxJob[] = [];
  let queueRunning = true;

  // Consumer: processes queue sequentially
  const consumer = (async () => {
    while (queueRunning || txQueue.length > 0) {
      if (txQueue.length === 0) {
        await sleep(50);
        continue;
      }
      const job = txQueue.shift()!;
      try {
        const txStart = performance.now();
        const tx = await registry.isAdult(job.addr);
        const receipt = await tx.wait();
        const txMs = performance.now() - txStart;

        const event = receipt.logs.find((l: any) => l.fragment?.name === "ComplianceQueried");
        const result = event ? event.args[1] : false;

        dapps[job.dappIdx].checks++;
        dapps[job.dappIdx].gas += receipt.gasUsed;
        dapps[job.dappIdx].lastTxMs = txMs;
        totalTx++;
        totalGas += receipt.gasUsed;

        if (result) {
          dapps[job.dappIdx].adults++;
          totalAdults++;
        } else {
          dapps[job.dappIdx].unknown++;
          totalUnknown++;
        }
      } catch {
        // skip failed tx silently
      }
    }
  })();

  // Producers: 5 dApp loops pushing to queue
  const producers = DAPP_NAMES.map((_, idx) =>
    (async () => {
      const stagger = 200 + Math.random() * 300; // 200-500ms per dApp
      while (running) {
        const addr = allAddrs[Math.floor(Math.random() * allAddrs.length)];
        txQueue.push({ dappIdx: idx, addr });
        await sleep(stagger + Math.random() * 500);
      }
    })()
  );

  // ─── Render Dashboard ─────────────────────────────────────────────────
  const render = () => {
    const elapsed = (performance.now() - startTime) / 1000;
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60);
    const tps = elapsed > 0 ? (totalTx / elapsed).toFixed(2) : "0.00";

    moveTo(1, 1);

    // Header
    process.stdout.write(chalk.bold.cyan("  ╔════════════════════════════════════════════════════════════════╗\n"));
    process.stdout.write(chalk.bold.cyan("  ║     DPO2U x Monad — LIVE DASHBOARD (Monad Testnet)           ║\n"));
    process.stdout.write(chalk.bold.cyan("  ╚════════════════════════════════════════════════════════════════╝\n"));

    // dApp table header
    process.stdout.write(chalk.gray("  ┌──────────────────┬────────┬──────────────────────────────────────┐\n"));
    process.stdout.write(chalk.gray("  │ ") + chalk.bold.white("dApp             ") + chalk.gray("│ ") + chalk.bold.white("Checks ") + chalk.gray("│ ") + chalk.bold.white("Volume                               ") + chalk.gray("│\n"));
    process.stdout.write(chalk.gray("  ├──────────────────┼────────┼──────────────────────────────────────┤\n"));

    // dApp rows
    const maxChecks = Math.max(...dapps.map((d) => d.checks), 1);
    for (let i = 0; i < dapps.length; i++) {
      const d = dapps[i];
      const barWidth = 28;
      const filled = Math.round((d.checks / maxChecks) * barWidth);
      const bar = DAPP_COLORS[i]("█".repeat(filled)) + chalk.gray("░".repeat(barWidth - filled));
      const checksStr = String(d.checks).padStart(5);
      const nameStr = padVisible(DAPP_COLORS[i](d.name), 17);

      clearLine();
      process.stdout.write(
        chalk.gray("  │ ") +
        nameStr +
        chalk.gray("│ ") +
        chalk.white(checksStr) + " " +
        chalk.gray("│ ") +
        bar + " " +
        chalk.dim(d.lastTxMs > 0 ? `${d.lastTxMs.toFixed(0)}ms` : "     ") +
        chalk.gray(" │\n")
      );
    }

    process.stdout.write(chalk.gray("  └──────────────────┴────────┴──────────────────────────────────────┘\n"));

    // Stats box
    process.stdout.write("\n");
    process.stdout.write(chalk.gray("  ┌────────────────────────────────────────────────────────────────┐\n"));

    const statsLines = [
      chalk.gray("  │ ") + chalk.white("  Total TX:       ") + chalk.bold.green(String(totalTx).padEnd(10)) + chalk.white("Throughput:  ") + chalk.bold.cyan((tps + " tx/s").padEnd(14)) + chalk.gray("      │"),
      chalk.gray("  │ ") + chalk.white("  Adults (true):  ") + chalk.bold.green(String(totalAdults).padEnd(10)) + chalk.white("Unknown:     ") + chalk.red(String(totalUnknown).padEnd(14)) + chalk.gray("      │"),
      chalk.gray("  │ ") + chalk.white("  Gas Total:      ") + chalk.cyan(totalGas.toLocaleString().padEnd(24)) + chalk.gray("              │"),
      chalk.gray("  │ ") + chalk.white("  Elapsed:        ") + chalk.cyan(`${mins}m${String(secs).padStart(2, "0")}s`.padEnd(24)) + chalk.gray("              │"),
    ];
    for (const sl of statsLines) {
      clearLine();
      process.stdout.write(sl + "\n");
    }

    process.stdout.write(chalk.gray("  └────────────────────────────────────────────────────────────────┘\n"));

    // Zero data highlight
    process.stdout.write("\n");
    process.stdout.write(chalk.bold.green("  ╔════════════════════════════════════════════════════════════════╗\n"));
    process.stdout.write(chalk.bold.green("  ║          PERSONAL DATA ON-CHAIN:  0  B Y T E S               ║\n"));
    process.stdout.write(chalk.bold.green("  ╚════════════════════════════════════════════════════════════════╝\n"));

    // Footer info
    process.stdout.write("\n");
    process.stdout.write(chalk.dim(`  Registry: ${registryAddr}\n`));
    process.stdout.write(chalk.dim(`  Chain: Monad Testnet (10143) | Queue: ${txQueue.length} pending\n`));
    process.stdout.write(chalk.dim("  Press Ctrl+C to stop\n"));
  };

  // Render loop
  dashboardInterval = setInterval(render, 500);
  render(); // initial render

  // Wait for SIGINT
  await Promise.race([
    ...producers,
    consumer,
    new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (!running) {
          clearInterval(check);
          resolve();
        }
      }, 100);
    }),
  ]);

  // Cleanup
  queueRunning = false;
  if (dashboardInterval) clearInterval(dashboardInterval);

  // Wait for consumer to drain
  await sleep(200);

  // Final summary
  const totalElapsed = (performance.now() - startTime) / 1000;
  clearScreen();
  moveTo(2, 1);
  process.stdout.write(chalk.bold.green("  ╔════════════════════════════════════════════════════════════════╗\n"));
  process.stdout.write(chalk.bold.green("  ║                      RESUMO FINAL                             ║\n"));
  process.stdout.write(chalk.bold.green("  ╠════════════════════════════════════════════════════════════════╣\n"));
  process.stdout.write(chalk.green(`  ║  TX on-chain:         ${chalk.bold(String(totalTx).padEnd(40))}║\n`));
  process.stdout.write(chalk.green(`  ║  Adults (true):       ${chalk.bold(String(totalAdults).padEnd(40))}║\n`));
  process.stdout.write(chalk.green(`  ║  Unknown (false):     ${chalk.bold(String(totalUnknown).padEnd(40))}║\n`));
  process.stdout.write(chalk.green(`  ║  Gas total:           ${chalk.bold(totalGas.toLocaleString().padEnd(40))}║\n`));
  process.stdout.write(chalk.green(`  ║  Duracao:             ${chalk.bold((totalElapsed / 60).toFixed(1) + " min").padEnd(40)}║\n`));
  process.stdout.write(chalk.green(`  ║  Throughput:          ${chalk.bold((totalTx / totalElapsed).toFixed(2) + " tx/s").padEnd(40)}║\n`));
  process.stdout.write(chalk.green(`  ║  Consumer dApps:      ${chalk.bold("5").padEnd(40)}║\n`));
  process.stdout.write(chalk.green(`  ║  Dados pessoais:      ${chalk.bold("0 bytes on-chain").padEnd(40)}║\n`));
  process.stdout.write(chalk.bold.green("  ╚════════════════════════════════════════════════════════════════╝\n\n"));
  process.stdout.write(chalk.dim("  ECA Digital (Lei 15.211) + LGPD (Lei 13.709) compliant\n"));
  process.stdout.write(chalk.dim("  Zero dados pessoais. Zero knowledge. Full compliance.\n\n"));
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
  const registryAddress = process.env.MONAD_REGISTRY_ADDRESS;
  if (!registryAddress || registryAddress === "0x...") {
    console.error(chalk.red("  MONAD_REGISTRY_ADDRESS nao configurado no .env"));
    process.exit(1);
  }

  const [signer] = await ethers.getSigners();
  const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, signer);

  // Graceful shutdown
  process.on("SIGINT", () => {
    running = false;
  });

  // Restore cursor on exit
  process.on("exit", () => {
    showCursor();
  });

  try {
    // Act 1 — The Pitch
    await act1();

    // Act 2 — ZK Proof Generation
    const proofData = await act2();

    // Act 3 — On-Chain Submission
    await act3(registry, proofData);

    // Act 4 — Live Dashboard (runs until Ctrl+C)
    await act4(registry, signer.address, registryAddress);
  } finally {
    showCursor();
  }
}

main().catch((error) => {
  showCursor();
  console.error(chalk.red("\n  Erro:"), error.message || error);
  process.exit(1);
});
