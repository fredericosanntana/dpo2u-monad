import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "MON");

  // 1. Deploy Verifier
  const VerifierFactory = await ethers.getContractFactory("Groth16Verifier");
  const verifier = await VerifierFactory.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log("\n✅ Verifier deployed to:", verifierAddress);

  // 2. Deploy ComplianceRegistry
  const RegistryFactory = await ethers.getContractFactory("ComplianceRegistry");
  const registry = await RegistryFactory.deploy(verifierAddress);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("✅ ComplianceRegistry deployed to:", registryAddress);

  console.log("\n   Owner:", await registry.owner());
  console.log("   Verifier:", await registry.verifier());
  console.log("\n📋 Update your .env with:");
  console.log(`   MONAD_REGISTRY_ADDRESS=${registryAddress}`);
  console.log(`   MONAD_VERIFIER_ADDRESS=${verifierAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
