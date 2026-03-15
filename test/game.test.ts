import { expect } from "chai";
import { ethers } from "hardhat";
import { ComplianceRegistry, Groth16Verifier, AgeGatedGame } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import * as snarkjs from "snarkjs";
import path from "path";

const WASM_PATH = path.join(__dirname, "..", "build", "age_check_js", "age_check.wasm");
const ZKEY_PATH = path.join(__dirname, "..", "build", "age_check_final.zkey");

async function generateProof(birthYear: number, currentYear: number) {
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    { birth_year: birthYear, current_year: currentYear },
    WASM_PATH,
    ZKEY_PATH
  );
  const calldataRaw = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const [a, b, c, input] = JSON.parse(`[${calldataRaw}]`);
  return { a, b, c, input };
}

describe("AgeGatedGame (Case Roblox x Lei FELCA)", function () {
  this.timeout(60000);

  let verifier: Groth16Verifier;
  let registry: ComplianceRegistry;
  let game: AgeGatedGame;
  let owner: HardhatEthersSigner;
  let adulto: HardhatEthersSigner;
  let menor: HardhatEthersSigner;
  let menor2: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, adulto, menor, menor2] = await ethers.getSigners();

    const VerifierFactory = await ethers.getContractFactory("Groth16Verifier");
    verifier = await VerifierFactory.deploy();
    await verifier.waitForDeployment();

    const RegistryFactory = await ethers.getContractFactory("ComplianceRegistry");
    registry = await RegistryFactory.deploy(await verifier.getAddress());
    await registry.waitForDeployment();

    const GameFactory = await ethers.getContractFactory("AgeGatedGame");
    game = await GameFactory.deploy(await registry.getAddress());
    await game.waitForDeployment();

    // Registrar adulto com prova ZK real
    const { a, b, c, input } = await generateProof(1990, 2025);
    await registry.connect(adulto).submitProof(a, b, c, input);
  });

  // ─── Deploy ─────────────────────────────────────────────────────────────

  describe("Deploy", function () {
    it("1. deploys with correct registry address", async function () {
      expect(await game.registry()).to.equal(await registry.getAddress());
    });
  });

  // ─── Adulto joga ────────────────────────────────────────────────────────

  describe("Adulto verificado — joga normalmente", function () {
    it("2. joinGame() OK, emite PlayerJoined", async function () {
      await expect(game.connect(adulto).joinGame())
        .to.emit(game, "PlayerJoined")
        .withArgs(adulto.address);
      expect(await game.players(adulto.address)).to.be.true;
      expect(await game.totalPlayers()).to.equal(1);
    });

    it("3. enableChat() OK apos joinGame", async function () {
      await game.connect(adulto).joinGame();
      await expect(game.connect(adulto).enableChat())
        .to.emit(game, "ChatEnabled")
        .withArgs(adulto.address);
    });

    it("4. purchaseItem(42) OK, emite ItemPurchased", async function () {
      await game.connect(adulto).joinGame();
      await expect(game.connect(adulto).purchaseItem(42))
        .to.emit(game, "ItemPurchased")
        .withArgs(adulto.address, 42);
    });

    it("5. enableChat() sem joinGame reverte", async function () {
      await expect(
        game.connect(adulto).enableChat()
      ).to.be.revertedWith("FELCA: entre no jogo antes de ativar o chat");
    });

    it("6. joinGame() duplicado reverte", async function () {
      await game.connect(adulto).joinGame();
      await expect(
        game.connect(adulto).joinGame()
      ).to.be.revertedWith("FELCA: voce ja esta no jogo");
    });
  });

  // ─── Menor protesta ─────────────────────────────────────────────────────

  describe("Menor — so pode protestar", function () {
    it("7. joinGame() reverte com mensagem FELCA", async function () {
      await expect(
        game.connect(menor).joinGame()
      ).to.be.revertedWith("FELCA: verifique sua idade primeiro");
    });

    it("8. protestar() OK, salva on-chain", async function () {
      await expect(game.connect(menor).protestar("QUERO JOGAR ROBLOX"))
        .to.emit(game, "ProtestoRegistrado")
        .withArgs(menor.address, "QUERO JOGAR ROBLOX");
      expect(await game.totalProtestos()).to.equal(1);
    });

    it("9. multiplos protestos de diferentes menores", async function () {
      await game.connect(menor).protestar("LEI FELCA INJUSTA");
      await game.connect(menor2).protestar("DEVOLVE MEU ROBLOX");

      const todos = await game.getProtestos();
      expect(todos.length).to.equal(2);
      expect(todos[0].mensagem).to.equal("LEI FELCA INJUSTA");
      expect(todos[1].mensagem).to.equal("DEVOLVE MEU ROBLOX");
      expect(todos[0].autor).to.equal(menor.address);
      expect(todos[1].autor).to.equal(menor2.address);
    });
  });

  // ─── Adulto NAO pode protestar ──────────────────────────────────────────

  describe("Adulto nao pode protestar", function () {
    it("10. protestar() reverte — 'para de reclamar'", async function () {
      await expect(
        game.connect(adulto).protestar("quero protestar tambem")
      ).to.be.revertedWith("FELCA: voce ja pode jogar, para de reclamar");
    });
  });
});
