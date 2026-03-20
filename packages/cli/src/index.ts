#!/usr/bin/env node

import { Command } from "commander";
import { registerConfigCommands } from "./commands/config.js";
import { registerAdvertiserCommands } from "./commands/advertiser.js";
import { registerScreenerCommands } from "./commands/screener.js";
import { registerCuratorCommands } from "./commands/curator.js";
import { registerInspectCommands } from "./commands/inspect.js";

const program = new Command();

program
  .name("ad-protocol")
  .description("Verifiable Ad Delivery Protocol CLI")
  .version("0.1.0");

program
  .option("--keypair <path>", "Solana keypair file", "~/.config/solana/id.json")
  .option("--rpc <url>", "Solana RPC URL", "https://api.devnet.solana.com")
  .option("--program-id <pubkey>", "Program ID override")
  .option("--json", "Output as JSON");

registerConfigCommands(program);
registerAdvertiserCommands(program);
registerScreenerCommands(program);
registerCuratorCommands(program);
registerInspectCommands(program);

program.parse();
