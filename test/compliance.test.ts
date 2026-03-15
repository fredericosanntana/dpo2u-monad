import { expect } from "chai";
import { ethers } from "hardhat";
import { ComplianceRegistry, Groth16Verifier } from "../typechain-types";
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
  return { a, b, c, input, proof, publicSignals };
}

describe("ComplianceRegistry (ZK v3)", function () {
  this.timeout(60000);

  let verifier: Groth16Verifier;
  let registry: ComplianceRegistry;
  let owner: HardhatEthersSigner;
  let user: HardhatEthersSigner;
  let other: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, user, other] = await ethers.getSigners();

    const VerifierFactory = await ethers.getContractFactory("Groth16Verifier");
    verifier = await VerifierFactory.deploy();
    await verifier.waitForDeployment();

    const RegistryFactory = await ethers.getContractFactory("ComplianceRegistry");
    registry = await RegistryFactory.deploy(await verifier.getAddress());
    await registry.waitForDeployment();
  });

  // ─── Deployment ─────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("1. deploys Verifier + Registry correctly", async function () {
      expect(await registry.owner()).to.equal(owner.address);
      expect(await registry.verifier()).to.equal(await verifier.getAddress());
    });
  });

  // ─── submitProof ──────────────────────────────────────────────────────────

  describe("submitProof", function () {
    it("2. accepts valid proof (birth_year=1990) → is_adult=true", async function () {
      const { a, b, c, input } = await generateProof(1990, 2025);
      await registry.connect(user).submitProof(a, b, c, input);
      const record = await registry.getRecord(user.address);
      expect(record.is_adult).to.be.true;
    });

    it("3. emits AdultVerified with correct proof_year", async function () {
      const { a, b, c, input } = await generateProof(1990, 2025);
      await expect(registry.connect(user).submitProof(a, b, c, input))
        .to.emit(registry, "AdultVerified")
        .withArgs(user.address, 2025);
    });

    it("4. getRecord returns full struct after valid proof", async function () {
      const { a, b, c, input } = await generateProof(1990, 2025);
      await registry.connect(user).submitProof(a, b, c, input);
      const record = await registry.getRecord(user.address);
      expect(record.is_adult).to.be.true;
      expect(record.proof_year).to.equal(2025);
      expect(record.timestamp).to.be.gt(0);
    });

    it("5. reverts with invalid proof (fabricated data)", async function () {
      const fakeA: [bigint, bigint] = [1n, 2n];
      const fakeB: [[bigint, bigint], [bigint, bigint]] = [[1n, 2n], [3n, 4n]];
      const fakeC: [bigint, bigint] = [1n, 2n];
      const fakeInput: [bigint, bigint] = [2025n, 1n];
      await expect(
        registry.connect(user).submitProof(fakeA, fakeB, fakeC, fakeInput)
      ).to.be.reverted;
    });

    it("6. reverts if is_adult_bit != 1 (minor, birth_year=2015)", async function () {
      const { a, b, c, input } = await generateProof(2015, 2025);
      // is_adult_bit (input[0]) should be 0 for a minor
      expect(BigInt(input[0])).to.equal(0n);
      await expect(
        registry.connect(user).submitProof(a, b, c, input)
      ).to.be.revertedWith("DPO2U: not adult");
    });

    it("7. reverts if year out of range [2024, 2030]", async function () {
      const { a, b, c, input } = await generateProof(1990, 2025);
      // Tamper with the year in input to be out of range
      const badInput = [2020n, 1n] as [bigint, bigint];
      await expect(
        registry.connect(user).submitProof(a, b, c, badInput)
      ).to.be.revertedWith("DPO2U: year out of range");
    });
  });

  // ─── isAdult ────────────────────────────────────────────────────────────

  describe("isAdult", function () {
    it("8. returns true after valid submitProof", async function () {
      const { a, b, c, input } = await generateProof(1990, 2025);
      await registry.connect(user).submitProof(a, b, c, input);
      const result = await registry.isAdult.staticCall(user.address);
      expect(result).to.be.true;
    });

    it("9. returns false for unregistered address", async function () {
      const result = await registry.isAdult.staticCall(other.address);
      expect(result).to.be.false;
    });

    it("10. emits ComplianceQueried", async function () {
      const { a, b, c, input } = await generateProof(1990, 2025);
      await registry.connect(user).submitProof(a, b, c, input);
      await expect(registry.isAdult(user.address))
        .to.emit(registry, "ComplianceQueried")
        .withArgs(user.address, true);
    });
  });

  // ─── getRecord ──────────────────────────────────────────────────────────

  describe("getRecord", function () {
    it("11. returns zeros for unregistered address", async function () {
      const record = await registry.getRecord(other.address);
      expect(record.is_adult).to.be.false;
      expect(record.timestamp).to.equal(0);
      expect(record.proof_year).to.equal(0);
    });
  });

  // ─── revokeAdult ────────────────────────────────────────────────────────

  describe("revokeAdult", function () {
    it("12. sets is_adult=false and emits AdultRevoked", async function () {
      const { a, b, c, input } = await generateProof(1990, 2025);
      await registry.connect(user).submitProof(a, b, c, input);

      await expect(registry.revokeAdult(user.address, "LGPD Art. 18 request"))
        .to.emit(registry, "AdultRevoked")
        .withArgs(user.address, "LGPD Art. 18 request");

      const record = await registry.getRecord(user.address);
      expect(record.is_adult).to.be.false;
    });

    it("13. reverts for non-owner", async function () {
      await expect(
        registry.connect(other).revokeAdult(user.address, "unauthorized")
      ).to.be.revertedWith("DPO2U: only owner");
    });
  });

  // ─── setVerifier ──────────────────────────────────────────────────────

  describe("setVerifier", function () {
    it("14. updates verifier (only owner)", async function () {
      await registry.setVerifier(other.address);
      expect(await registry.verifier()).to.equal(other.address);
    });
  });

  // ─── Integration ──────────────────────────────────────────────────────

  describe("Integration", function () {
    it("15. isAdult returns false after revocation (full lifecycle)", async function () {
      const { a, b, c, input } = await generateProof(1990, 2025);
      await registry.connect(user).submitProof(a, b, c, input);

      let result = await registry.isAdult.staticCall(user.address);
      expect(result).to.be.true;

      await registry.revokeAdult(user.address, "revoked");
      result = await registry.isAdult.staticCall(user.address);
      expect(result).to.be.false;
    });
  });
});
