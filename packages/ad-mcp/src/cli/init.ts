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

  let vaulxEndpoint = "http://127.0.0.1:18420";
  let vaulxAuthToken = "";

  // Try auto-detect
  const detected = detectVaulx();
  if (detected) {
    console.log(`  vaulx wallet detected (port ${detected.port})`);
    const answer = await prompt(rl, "  Read auth token from vaulx? (y/n): ");
    if (answer.toLowerCase() === "y") {
      vaulxAuthToken = detected.token;
      vaulxEndpoint = `http://127.0.0.1:${detected.port}`;
      console.log("  Token loaded from vaulx\n");
    }
  }

  if (!vaulxAuthToken) {
    vaulxAuthToken = await prompt(rl, "  vaulx auth token: ");
    const ep = await prompt(rl, "  vaulx endpoint (default http://127.0.0.1:18420): ");
    if (ep.trim()) vaulxEndpoint = ep.trim();
  }

  const solanaRpc = await prompt(rl, "  Solana RPC (default https://api.devnet.solana.com): ")
    || "https://api.devnet.solana.com";
  const programId = await prompt(rl, "  Program ID (default 7Qu5B4tB23Gt4WDZoZiLJpQ8hSxK6RPXeFSCdacCPvFf): ")
    || "7Qu5B4tB23Gt4WDZoZiLJpQ8hSxK6RPXeFSCdacCPvFf";

  const config: AdMcpConfig = {
    vaulx_endpoint: vaulxEndpoint,
    vaulx_auth_token: vaulxAuthToken,
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
