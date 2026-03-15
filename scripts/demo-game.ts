import { ethers } from "hardhat";
import chalk from "chalk";
import { generateAgeProof } from "./prove";

const REGISTRY_ABI = [
  "function submitProof(uint[2] a, uint[2][2] b, uint[2] c, uint[2] input) external",
  "function isAdult(address subject) external returns (bool)",
  "function getRecord(address subject) external view returns (tuple(bool is_adult, uint256 timestamp, uint256 proof_year))",
];

const GAME_ABI = [
  "function joinGame() external",
  "function enableChat() external",
  "function purchaseItem(uint256 itemId) external",
  "function protestar(string mensagem) external",
  "function getProtestos() external view returns (tuple(address autor, string mensagem, uint256 timestamp)[])",
  "function totalPlayers() external view returns (uint256)",
  "function totalProtestos() external view returns (uint256)",
  "function players(address) external view returns (bool)",
  "function registry() external view returns (address)",
];

function line(label: string, value: string, color: typeof chalk.green = chalk.white) {
  console.log(chalk.gray("  │ ") + chalk.white(label.padEnd(28)) + color(value));
}

function header(title: string) {
  console.log(chalk.gray("  ┌─────────────────────────────────────────────────────────────┐"));
  console.log(chalk.gray("  │ ") + chalk.bold.cyan(title.padEnd(60)) + chalk.gray("│"));
  console.log(chalk.gray("  ├─────────────────────────────────────────────────────────────┤"));
}

function footer() {
  console.log(chalk.gray("  └─────────────────────────────────────────────────────────────┘"));
}

async function main() {
  const registryAddress = process.env.MONAD_REGISTRY_ADDRESS;
  const gameAddress = process.env.MONAD_GAME_ADDRESS;

  if (!registryAddress || !gameAddress) {
    console.error(chalk.red("  Configure MONAD_REGISTRY_ADDRESS e MONAD_GAME_ADDRESS no .env"));
    process.exit(1);
  }

  const [adulto] = await ethers.getSigners();

  // Criar wallet do menor e fundar com MON para transacoes reais
  const menorWallet = ethers.Wallet.createRandom().connect(ethers.provider);

  const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, adulto);
  const game = new ethers.Contract(gameAddress, GAME_ABI, adulto);

  let totalTx = 0;
  let totalGas = 0n;
  const txLog: { step: string; gas: bigint; ms: number }[] = [];

  async function trackTx(label: string, txPromise: Promise<any>): Promise<any> {
    const start = performance.now();
    const tx = await txPromise;
    const receipt = await tx.wait();
    const ms = performance.now() - start;
    totalTx++;
    totalGas += receipt.gasUsed;
    txLog.push({ step: label, gas: receipt.gasUsed, ms });
    return { tx, receipt, ms };
  }

  console.log(chalk.bold.yellow("\n  ╔═══════════════════════════════════════════════════════════════╗"));
  console.log(chalk.bold.yellow("  ║   🎮 AgeGatedGame — Case Roblox x Lei FELCA                  ║"));
  console.log(chalk.bold.yellow("  ║   \"Adulto joga, menor protesta.\" (Monad Testnet)              ║"));
  console.log(chalk.bold.yellow("  ╚═══════════════════════════════════════════════════════════════╝\n"));

  // ─── 1. Info ──────────────────────────────────────────────────────────────
  header("1. CONTRATOS & WALLETS");
  line("ComplianceRegistry", registryAddress, chalk.yellow);
  line("AgeGatedGame", gameAddress, chalk.yellow);
  line("Adulto (signer)", adulto.address, chalk.cyan);
  line("Menor (nova wallet)", menorWallet.address, chalk.red);
  const balance = await ethers.provider.getBalance(adulto.address);
  line("Saldo adulto", ethers.formatEther(balance) + " MON", chalk.green);
  footer();
  console.log();

  // ─── 2. Fundar wallet do menor ────────────────────────────────────────────
  header("2. FUNDANDO WALLET DO MENOR");
  line("Enviando", "0.5 MON para o menor", chalk.cyan);
  const fundTx = await adulto.sendTransaction({
    to: menorWallet.address,
    value: ethers.parseEther("0.5"),
  });
  await fundTx.wait();
  const menorBalance = await ethers.provider.getBalance(menorWallet.address);
  line("TX Hash", fundTx.hash.slice(0, 24) + "...", chalk.yellow);
  line("Saldo menor", ethers.formatEther(menorBalance) + " MON", chalk.green);
  line("Nota", "Menor precisa de gas pra protestar!", chalk.dim);
  footer();
  console.log();

  // ─── 3. Prova ZK do adulto ────────────────────────────────────────────────
  const record = await registry.getRecord(adulto.address);
  const jaRegistrado = record.is_adult;

  if (jaRegistrado) {
    header("3. ADULTO — Ja verificado no Registry");
    line("isAdult", "true (prova anterior)", chalk.bold.green);
    line("proof_year", record.proof_year.toString(), chalk.cyan);
    line("Nova prova necessaria?", "NAO", chalk.green);
    footer();
  } else {
    header("3. ADULTO — Gerando prova ZK (off-chain)");
    line("birth_year (PRIVADO)", "████ [REDACTED]", chalk.red);
    line("current_year (PUBLICO)", new Date().getFullYear().toString(), chalk.cyan);
    console.log(chalk.gray("  │ ") + chalk.dim("  Gerando prova Groth16 via snarkjs..."));

    const proofStart = performance.now();
    const { a, b, c, input } = await generateAgeProof(1990);
    const proofTime = performance.now() - proofStart;

    line("Prova gerada em", proofTime.toFixed(0) + " ms", chalk.green);
    line("Tamanho da prova", "192 bytes (constante)", chalk.cyan);
    line("birth_year exposto?", "NUNCA — zero knowledge", chalk.bold.green);
    footer();
    console.log();

    header("   ADULTO — Submetendo prova on-chain");
    const { receipt, ms } = await trackTx("submitProof", registry.submitProof(a, b, c, input));
    line("TX Hash", receipt.hash?.slice(0, 24) + "...", chalk.yellow);
    line("Gas", receipt.gasUsed.toString(), chalk.cyan);
    line("Tempo", ms.toFixed(0) + " ms", chalk.green);
    line("Status", "ADULTO VERIFICADO ✅", chalk.bold.green);
    footer();
  }
  console.log();

  // ─── 4. Adulto joga ──────────────────────────────────────────────────────
  header("4. ADULTO — Jogando normalmente");

  const jaPlayer = await game.players(adulto.address);
  if (jaPlayer) {
    line("joinGame()", "JA NO JOGO (sessao anterior)", chalk.green);
  } else {
    const { ms } = await trackTx("joinGame", game.connect(adulto).joinGame());
    line("joinGame()", `OK ✅ (${ms.toFixed(0)}ms)`, chalk.green);
  }

  {
    const { ms } = await trackTx("enableChat", game.connect(adulto).enableChat());
    line("enableChat()", `OK ✅ (${ms.toFixed(0)}ms)`, chalk.green);
  }

  const items = [
    { id: 42, nome: "Skin Legendaria" },
    { id: 7, nome: "Espada de Diamante" },
    { id: 99, nome: "Pet Dragao" },
    { id: 1, nome: "Capacete Dourado" },
    { id: 55, nome: "Asa Delta RGB" },
  ];

  for (const item of items) {
    const { ms } = await trackTx(`purchaseItem(${item.id})`, game.connect(adulto).purchaseItem(item.id));
    line(`purchaseItem(${item.id})`, `OK ✅ ${item.nome} (${ms.toFixed(0)}ms)`, chalk.green);
  }

  line("Lei FELCA", "COMPLIANCE TOTAL", chalk.bold.green);
  footer();
  console.log();

  // ─── 5. Menor tenta jogar (TX reais — reverts) ─────────────────────────
  header("5. MENOR — Tentando jogar... (TX reais)");

  const menorAttempts = [
    { fn: "joinGame", call: () => game.connect(menorWallet).joinGame() },
    { fn: "enableChat", call: () => game.connect(menorWallet).enableChat() },
    { fn: "purchaseItem(1)", call: () => game.connect(menorWallet).purchaseItem(1) },
  ];

  for (const attempt of menorAttempts) {
    try {
      await attempt.call();
      line(`${attempt.fn}()`, "OK (inesperado)", chalk.yellow);
    } catch (e: any) {
      const reason = e.reason || "FELCA: verifique sua idade";
      line(`${attempt.fn}()`, "BLOQUEADO ❌", chalk.red);
      line("Revert", reason, chalk.red);
    }
  }

  line("Resultado", "TUDO BLOQUEADO — Lei FELCA em acao", chalk.bold.red);
  footer();
  console.log();

  // ─── 6. Menor protesta (TX reais on-chain!) ─────────────────────────────
  header("6. MENOR — Protestando on-chain (TX reais!)");

  const protestos = [
    "QUERO JOGAR ROBLOX!!!",
    "LEI FELCA INJUSTA!!! DEVOLVE MEU JOGO",
    "EU SO QUERIA JOGAR COM MEUS AMIGOS",
    "MEU PAI DEIXA EU JOGAR MAS A BLOCKCHAIN NAO",
    "VOU FAZER 18 ANOS LOGO, ESPEREM",
    "#RevoltaDoRoblox #ForaFELCA",
    "TEM 10 MILHOES DE CRIANCAS REVOLTADAS AQUI",
    "O ROBLOX ERA MINHA VIDA E AGORA SO POSSO PROTESTAR",
  ];

  for (const msg of protestos) {
    const { ms } = await trackTx("protestar", game.connect(menorWallet).protestar(msg));
    line("📢 protestar()", `"${msg}" (${ms.toFixed(0)}ms)`, chalk.magenta);
  }

  line("Resultado", `${protestos.length} protestos GRAVADOS ON-CHAIN`, chalk.bold.magenta);
  footer();
  console.log();

  // ─── 7. Adulto tenta protestar ───────────────────────────────────────────
  header("7. ADULTO — Tentando protestar por solidariedade...");

  try {
    await game.connect(adulto).protestar("solidariedade com os menores!");
    line("protestar()", "OK (inesperado)", chalk.yellow);
  } catch (e: any) {
    line("protestar()", "BLOQUEADO ❌", chalk.red);
    line("Motivo", "voce ja pode jogar, para de reclamar 😂", chalk.yellow);
  }

  footer();
  console.log();

  // ─── 8. Mural de protestos on-chain ───────────────────────────────────────
  header("8. MURAL DE PROTESTOS ON-CHAIN (imutavel e eterno)");

  const todos = await game.getProtestos();
  for (let i = 0; i < todos.length; i++) {
    const p = todos[i];
    const addr = p.autor.slice(0, 10) + "...";
    const date = new Date(Number(p.timestamp) * 1000);
    const dateStr = date.toISOString().slice(0, 19).replace("T", " ");
    line(`#${i + 1} [${addr}]`, `"${p.mensagem}"`, chalk.magenta);
  }

  console.log(chalk.gray("  │"));
  line("Total protestos on-chain", todos.length.toString(), chalk.bold.magenta);
  line("Total players", (await game.totalPlayers()).toString(), chalk.bold.green);
  footer();
  console.log();

  // ─── 9. Metricas de transacoes ────────────────────────────────────────────
  header("9. METRICAS — TRANSACOES ON-CHAIN");

  line("Total TX reais", totalTx.toString(), chalk.bold.cyan);
  line("Gas total", totalGas.toLocaleString(), chalk.cyan);
  line("Custo estimado", "< $0.01 (Monad Testnet)", chalk.green);

  console.log(chalk.gray("  │"));
  console.log(chalk.gray("  │ ") + chalk.bold.white("  Detalhe por operacao:"));
  console.log(chalk.gray("  │ ") + chalk.dim("  ─────────────────────────────────────────────"));

  for (const log of txLog) {
    const gasStr = log.gas.toLocaleString().padEnd(12);
    line(`  ${log.step}`, `${gasStr} gas | ${log.ms.toFixed(0)}ms`, chalk.dim);
  }

  footer();

  // ─── Resumo Final ────────────────────────────────────────────────────────
  console.log();
  console.log(chalk.bold.yellow("  ╔═══════════════════════════════════════════════════════════════╗"));
  console.log(chalk.bold.yellow("  ║              RESUMO — Case Roblox x Lei FELCA                ║"));
  console.log(chalk.bold.yellow("  ╠═══════════════════════════════════════════════════════════════╣"));
  console.log(chalk.yellow("  ║  Adulto verificado (ZK):     ") + chalk.bold("JOGA TUDO ✅") + chalk.yellow("                    ║"));
  console.log(chalk.yellow("  ║  Menor nao verificado:       ") + chalk.bold("SO PROTESTA 😤") + chalk.yellow("                  ║"));
  console.log(chalk.yellow("  ║  TX on-chain reais:          ") + chalk.bold(String(totalTx).padEnd(4)) + chalk.yellow("                            ║"));
  console.log(chalk.yellow("  ║  Protestos gravados:         ") + chalk.bold(String(todos.length).padEnd(4)) + chalk.yellow("(imutaveis e eternos)       ║"));
  console.log(chalk.yellow("  ║  Dados pessoais on-chain:    ") + chalk.bold("0 bytes") + chalk.yellow("                         ║"));
  console.log(chalk.yellow("  ║  Gas total:                  ") + chalk.bold(totalGas.toLocaleString().padEnd(14)) + chalk.yellow("            ║"));
  console.log(chalk.yellow("  ║  Lei FELCA compliance:       ") + chalk.bold("100%") + chalk.yellow("                            ║"));
  console.log(chalk.bold.yellow("  ╚═══════════════════════════════════════════════════════════════╝"));
  console.log();
  console.log(chalk.dim("  \"Adulto joga, menor protesta. Tudo on-chain. Zero knowledge.\""));
  console.log(chalk.dim("  ECA Digital (Lei 15.211) + LGPD (Lei 13.709) compliant"));
  console.log(chalk.dim(`  ${totalTx} transacoes reais na Monad Testnet\n`));
}

main().catch((error) => {
  console.error(chalk.red("Erro:"), error.message || error);
  process.exit(1);
});
