#!/usr/bin/env node

import fs from "fs";
import path from "path";
import os from "os";
import readline from "readline";
import type { AdMcpConfig } from "../config.js";
import { getConfigPath, getConfigDir, saveConfig } from "../config.js";

/**
 * Auto-detect vaulx installation and read auth token.
 * Reads from ~/.vaulx/wallets/{active}/.env
 */
function detectVaulx(): { token: string; port: string } | null {
  const configPath = path.join(os.homedir(), ".vaulx", "config.json");
  if (!fs.existsSync(configPath)) return null;

  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const activeName = config.active || "default";
    const envPath = path.join(os.homedir(), ".vaulx", "wallets", activeName, ".env");

    if (!fs.existsSync(envPath)) return null;

    const envContent = fs.readFileSync(envPath, "utf-8");
    const lines = envContent.split("\n");
    let token = "";
    let port = "18420";

    for (const line of lines) {
      const [key, ...rest] = line.split("=");
      const value = rest.join("=").trim();
      if (key.trim() === "WALLET_AUTH_TOKEN") token = value;
      if (key.trim() === "WALLET_PORT") port = value;
    }

    if (!token) return null;
    return { token, port };
  } catch {
    return null;
  }
}

async function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log("\n  ad-mcp — Agent Ad Protocol MCP Server\n");

  // Wallet provider selection
  console.log("  Wallet provider:");
  console.log("    1. vaulx (auto-detect from ~/.vaulx/)");
  console.log("    2. Custom HTTP endpoint");
  console.log("    3. Local keypair (direct, no external wallet)");

  const walletChoice = await prompt(rl, "\n  Select (1/2/3): ");

  let walletMode: "http" | "keypair" = "http";
  let walletEndpoint = "http://127.0.0.1:18420";
  let walletAuthToken = "";
  let walletPrivateKey: string | undefined;

  if (walletChoice === "1") {
    // vaulx auto-detect
    const detected = detectVaulx();
    if (detected) {
      console.log(`\n  vaulx wallet detected (port ${detected.port})`);
      const answer = await prompt(rl, "  Read auth token from vaulx? (y/n): ");
      if (answer.toLowerCase() === "y") {
        walletAuthToken = detected.token;
        walletEndpoint = `http://127.0.0.1:${detected.port}`;
        console.log("  Token loaded from vaulx\n");
      } else {
        walletAuthToken = await prompt(rl, "  Auth token: ");
      }
    } else {
      console.log("\n  vaulx not found. Enter manually:");
      walletEndpoint =
        (await prompt(rl, "  vaulx endpoint (default http://127.0.0.1:18420): ")) ||
        "http://127.0.0.1:18420";
      walletAuthToken = await prompt(rl, "  Auth token: ");
    }
  } else if (walletChoice === "2") {
    // Custom HTTP endpoint
    walletEndpoint = await prompt(rl, "\n  Wallet endpoint: ");
    walletAuthToken = await prompt(rl, "  Auth token: ");
  } else if (walletChoice === "3") {
    // Local keypair
    walletMode = "keypair";
    walletPrivateKey = await prompt(rl, "\n  Solana private key (base64): ");
    console.log("  Warning: Private key stored in config. Use HTTP mode for production.\n");
  }

  const solanaRpc =
    (await prompt(rl, "  Solana RPC (default https://api.devnet.solana.com): ")) ||
    "https://api.devnet.solana.com";
  const programId =
    (await prompt(rl, "  Program ID (default 7Qu5B4tB23Gt4WDZoZiLJpQ8hSxK6RPXeFSCdacCPvFf): ")) ||
    "7Qu5B4tB23Gt4WDZoZiLJpQ8hSxK6RPXeFSCdacCPvFf";

  const config: AdMcpConfig = {
    wallet_mode: walletMode,
    wallet_endpoint: walletEndpoint,
    wallet_auth_token: walletAuthToken,
    ...(walletPrivateKey ? { wallet_private_key: walletPrivateKey } : {}),
    solana_rpc: solanaRpc.trim() || "https://api.devnet.solana.com",
    program_id: programId.trim() || "7Qu5B4tB23Gt4WDZoZiLJpQ8hSxK6RPXeFSCdacCPvFf",
    auto_sign: true,
    auto_submit: true,
  };

  saveConfig(config);

  console.log(`\n  Config saved to ${getConfigPath()}`);
  console.log("  ad-mcp ready\n");
  rl.close();
}

main().catch(console.error);
