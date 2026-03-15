import { ethers } from "hardhat";
import chalk from "chalk";

async function main() {
  const registryAddress = process.env.MONAD_REGISTRY_ADDRESS;
  if (!registryAddress || registryAddress === "0x...") {
    console.error(chalk.red("  MONAD_REGISTRY_ADDRESS nao configurado no .env"));
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();
  console.log(chalk.cyan("\n  Deploying AgeGatedGame (Case Roblox x Lei FELCA)"));
  console.log(chalk.gray("  Deployer:"), deployer.address);
  console.log(chalk.gray("  Registry:"), registryAddress);

  const GameFactory = await ethers.getContractFactory("AgeGatedGame");
  const game = await GameFactory.deploy(registryAddress);
  await game.waitForDeployment();
  const gameAddress = await game.getAddress();

  console.log(chalk.bold.green("\n  ✅ AgeGatedGame deployed to:"), gameAddress);
  console.log(chalk.gray("\n  📋 Update your .env with:"));
  console.log(`     MONAD_GAME_ADDRESS=${gameAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
