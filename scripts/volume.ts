import { ethers } from "hardhat";
import chalk from "chalk";

const REGISTRY_ABI = [
  "function isAdult(address subject) external returns (bool)",
  "function getRecord(address subject) external view returns (tuple(bool is_adult, uint256 timestamp, uint256 proof_year))",
  "event ComplianceQueried(address indexed subject, bool result)",
];

const DAPP_NAMES = [
  "MonadSwap", "MegaDEX", "ZKBridge", "MonadLend", "CryptoKids",
  "NFTMarket", "GameFi Hub", "DeFi Vault", "Token Launchpad", "DAO Gov",
];

async function main() {
  const registryAddress = process.env.MONAD_REGISTRY_ADDRESS;
  if (!registryAddress || registryAddress === "0x...") {
    console.error(chalk.red("  MONAD_REGISTRY_ADDRESS nao configurado no .env"));
    process.exit(1);
  }

  const [signer] = await ethers.getSigners();
  const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, signer);

  // Endereços para consultar — mix de registrados e aleatorios
  const ownerAddr = signer.address;
  const randomAddrs = Array.from({ length: 20 }, () => ethers.Wallet.createRandom().address);
  const allAddrs = [ownerAddr, ...randomAddrs];

  const balance = await ethers.provider.getBalance(signer.address);

  console.log(chalk.bold.cyan("\n  ╔═══════════════════════════════════════════════════════════╗"));
  console.log(chalk.bold.cyan("  ║   DPO2U x Monad — Volume Constante de Verificacoes       ║"));
  console.log(chalk.bold.cyan("  ║   Transacoes reais on-chain (ComplianceQueried events)    ║"));
  console.log(chalk.bold.cyan("  ╚═══════════════════════════════════════════════════════════╝\n"));

  console.log(chalk.white("  Registry:"), chalk.yellow(registryAddress));
  console.log(chalk.white("  Signer:  "), chalk.yellow(signer.address));
  console.log(chalk.white("  Saldo:   "), chalk.green(ethers.formatEther(balance) + " MON"));
  console.log(chalk.white("  Mode:    "), chalk.bold.cyan("CONTINUOUS — Ctrl+C para parar"));
  console.log();

  let txCount = 0;
  let trueCount = 0;
  let falseCount = 0;
  let totalGas = 0n;
  let round = 0;
  const startTime = performance.now();

  // Graceful shutdown
  let running = true;
  process.on("SIGINT", () => {
    running = false;
    console.log(chalk.yellow("\n\n  Encerrando...\n"));
  });

  while (running) {
    round++;
    const dapp = DAPP_NAMES[(round - 1) % DAPP_NAMES.length];

    // Cada round: 5 transações isAdult() reais (não staticCall — gera tx on-chain)
    const roundAddrs = Array.from({ length: 5 }, () =>
      allAddrs[Math.floor(Math.random() * allAddrs.length)]
    );

    const roundStart = performance.now();
    let roundTrue = 0;
    let roundFalse = 0;
    let roundGas = 0n;
    const txHashes: string[] = [];

    for (const addr of roundAddrs) {
      if (!running) break;

      try {
        const tx = await registry.isAdult(addr);
        const receipt = await tx.wait();

        txCount++;
        roundGas += receipt.gasUsed;
        totalGas += receipt.gasUsed;
        txHashes.push(receipt.hash.slice(0, 14) + "...");

        // Decode event to get result
        const event = receipt.logs.find((l: any) => l.fragment?.name === "ComplianceQueried");
        const result = event ? event.args[1] : false;

        if (result) { trueCount++; roundTrue++; }
        else { falseCount++; roundFalse++; }
      } catch (err: any) {
        if (!running) break;
        console.log(chalk.red(`  ✗ Erro: ${err.message?.slice(0, 50)}`));
      }
    }

    if (!running) break;

    const roundTime = performance.now() - roundStart;
    const elapsed = (performance.now() - startTime) / 1000;
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60);
    const tps = (txCount / elapsed).toFixed(1);

    console.log(
      chalk.green(`  ✓ Round ${String(round).padStart(4)} `) +
      chalk.white(`[${chalk.bold.yellow(dapp.padEnd(16))}] `) +
      chalk.green(`${roundTrue} adult `) +
      chalk.red(`${roundFalse} unknown `) +
      chalk.gray(`gas: ${roundGas.toLocaleString()} `) +
      chalk.cyan(`${roundTime.toFixed(0)}ms `) +
      chalk.dim(`| total: ${txCount} tx | ${tps} tx/s | ${mins}m${String(secs).padStart(2, "0")}s`)
    );

    // Small delay between rounds to keep consistent pace
    await new Promise((r) => setTimeout(r, 500));
  }

  // ─── Summary ──────────────────────────────────────────────────────────
  const totalElapsed = (performance.now() - startTime) / 1000;

  console.log(chalk.bold.green("\n  ╔═══════════════════════════════════════════════════════════╗"));
  console.log(chalk.bold.green("  ║                    RESUMO FINAL                           ║"));
  console.log(chalk.bold.green("  ╠═══════════════════════════════════════════════════════════╣"));
  console.log(chalk.green(`  ║  Transacoes on-chain:    ${chalk.bold(String(txCount).padEnd(32))}║`));
  console.log(chalk.green(`  ║  ✓ Adult (true):         ${chalk.bold(String(trueCount).padEnd(32))}║`));
  console.log(chalk.green(`  ║  ✗ Unknown (false):      ${chalk.bold(String(falseCount).padEnd(32))}║`));
  console.log(chalk.green(`  ║  Gas total:              ${chalk.bold(totalGas.toLocaleString().padEnd(32))}║`));
  console.log(chalk.green(`  ║  Duracao:                ${chalk.bold((totalElapsed / 60).toFixed(1).padEnd(28) + " min")} ║`));
  console.log(chalk.green(`  ║  Throughput medio:       ${chalk.bold((txCount / totalElapsed).toFixed(1).padEnd(28) + " tx/s")} ║`));
  console.log(chalk.green(`  ║  Rounds completados:     ${chalk.bold(String(round).padEnd(32))}║`));
  console.log(chalk.green(`  ║  Consumer dApps:         ${chalk.bold(String(DAPP_NAMES.length).padEnd(32))}║`));
  console.log(chalk.green(`  ║  Dados pessoais:         ${chalk.bold("0 bytes on-chain".padEnd(32))}║`));
  console.log(chalk.bold.green("  ╚═══════════════════════════════════════════════════════════╝\n"));
}

main().catch((error) => {
  console.error(chalk.red("Erro:"), error.message || error);
  process.exit(1);
});
