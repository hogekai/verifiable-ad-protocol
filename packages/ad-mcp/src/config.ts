import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface AdMcpConfig {
  wallet_mode: "http" | "keypair";
  wallet_endpoint: string;
  wallet_auth_token: string;
  wallet_private_key?: string;
  solana_rpc: string;
  program_id: string;
  auto_sign: boolean;
  auto_submit: boolean;
}

const CONFIG_DIR = join(homedir(), ".config", "ad-mcp");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function loadConfig(): AdMcpConfig {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(`Config not found at ${CONFIG_PATH}. Run 'ad-mcp' to initialize.`);
  }
  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
}

export function saveConfig(config: AdMcpConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  chmodSync(CONFIG_PATH, 0o600);
}

export function defaultConfig(): AdMcpConfig {
  return {
    wallet_mode: "http",
    wallet_endpoint: "http://127.0.0.1:18420",
    wallet_auth_token: "",
    solana_rpc: "https://api.devnet.solana.com",
    program_id: "7Qu5B4tB23Gt4WDZoZiLJpQ8hSxK6RPXeFSCdacCPvFf",
    auto_sign: true,
    auto_submit: true,
  };
}
