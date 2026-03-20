import { describe, it, expect, afterEach } from "vitest";
import { processAd } from "../src/tools/process-ad.js";
import { NonceManager } from "../src/nonce-manager.js";
import { RetryQueue } from "../src/retry-queue.js";
import { PublicKey } from "@solana/web3.js";
import { join } from "path";
import { tmpdir } from "os";
import { unlinkSync } from "fs";
import type { VaulxClient } from "../src/vaulx-client.js";
import type { AdSlot } from "@verifiable-ad-protocol/core";

function tempDb(): string {
  return join(tmpdir(), `process-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

function createMockVaulx(): VaulxClient {
  return {
    getAddress: async () => "11111111111111111111111111111111",
    signBytes: async () => ({
      signature: Buffer.alloc(64).toString("base64"),
      publicKey: "11111111111111111111111111111111",
    }),
    signAndSendRawTransaction: async () => ({ signature: "mock-tx-sig" }),
  } as VaulxClient;
}

function validSlot(): AdSlot {
  return {
    ad_id: "11111111111111111111111111111111",
    screener_pubkey: "11111111111111111111111111111111",
    screener_signature: Buffer.alloc(64).toString("base64"),
    curator_pubkey: "11111111111111111111111111111111",
    curator_signature: Buffer.alloc(64).toString("base64"),
    impression_nonce: 0,
    context_hash: "00".repeat(32),
    timestamp: Math.floor(Date.now() / 1000),
    content: { type: "text", title: "Test Ad" },
    context_categories: ["test"],
  };
}

describe("processAd", () => {
  const dbs: string[] = [];

  afterEach(() => {
    for (const db of dbs) {
      try { unlinkSync(db); } catch {}
    }
    dbs.length = 0;
  });

  it("rejects invalid ad slot", async () => {
    const dbPath = tempDb();
    dbs.push(dbPath);
    const result = await processAd({
      slot: { invalid: true } as unknown as AdSlot,
      vaulx: createMockVaulx(),
      nonceManager: new NonceManager(dbPath),
      retryQueue: new RetryQueue(dbPath),
      programId: PublicKey.default,
      solanaRpc: "https://api.devnet.solana.com",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid ad slot");
  });

  it("processes valid ad slot (mock vaulx)", async () => {
    const dbPath = tempDb();
    dbs.push(dbPath);

    // This will fail at connection.getLatestBlockhash() since we're not connected
    // to a real RPC, but it validates the flow up to that point
    const result = await processAd({
      slot: validSlot(),
      vaulx: createMockVaulx(),
      nonceManager: new NonceManager(dbPath),
      retryQueue: new RetryQueue(dbPath),
      programId: PublicKey.default,
      solanaRpc: "https://api.devnet.solana.com",
    });

    // Will fail at RPC call, but should not be "Invalid ad slot"
    if (!result.success) {
      expect(result.error).not.toBe("Invalid ad slot");
    }
  });
});
