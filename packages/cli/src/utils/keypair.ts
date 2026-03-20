import { Keypair } from "@solana/web3.js";
import { readFileSync } from "fs";
import { homedir } from "os";

export function loadKeypairFromFile(path: string): Keypair {
  const resolved = path.replace(/^~/, homedir());
  const raw = readFileSync(resolved, "utf-8");
  const secretKey = Uint8Array.from(JSON.parse(raw));
  return Keypair.fromSecretKey(secretKey);
}
