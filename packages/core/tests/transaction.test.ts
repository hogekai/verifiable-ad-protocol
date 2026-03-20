import { describe, it, expect } from "vitest";
import { PublicKey, Ed25519Program } from "@solana/web3.js";
import {
  buildEd25519VerifyInstructions,
  findBitmapPda,
  findScreenerPda,
  findCuratorPda,
  findDepositPda,
  findConfigPda,
  findAdPda,
} from "../src/transaction.js";
import { PROGRAM_ID } from "../src/constants.js";
import type { AdSlot } from "../src/types.js";
import nacl from "tweetnacl";
import { createHash } from "crypto";
import { serializeImpressionMessage } from "../src/message.js";
import type { ImpressionMessage } from "../src/types.js";

const ED25519_PROGRAM_ID = Ed25519Program.programId;

// Generate test keypairs
const screenerKp = nacl.sign.keyPair();
const curatorKp = nacl.sign.keyPair();
const agentKp = nacl.sign.keyPair();
const adId = new PublicKey(new Uint8Array(32).fill(1));

function makeTestSlot(agentPubkey: PublicKey): { slot: AdSlot; agentSignature: Uint8Array } {
  const msg: ImpressionMessage = {
    ad_id: adId,
    screener: new PublicKey(screenerKp.publicKey),
    curator: new PublicKey(curatorKp.publicKey),
    agent: agentPubkey,
    impression_nonce: 0n,
    context_hash: new Uint8Array(32).fill(0),
    timestamp: 1700000000n,
  };

  const serialized = serializeImpressionMessage(msg);
  const messageHash = createHash("sha256").update(serialized).digest();

  const screenerSig = nacl.sign.detached(messageHash, screenerKp.secretKey);
  const curatorSig = nacl.sign.detached(messageHash, curatorKp.secretKey);
  const agentSig = nacl.sign.detached(messageHash, agentKp.secretKey);

  const slot: AdSlot = {
    ad_id: adId.toBase58(),
    advertiser: new PublicKey(new Uint8Array(32).fill(5)).toBase58(),
    screener_pubkey: new PublicKey(screenerKp.publicKey).toBase58(),
    screener_signature: Buffer.from(screenerSig).toString("base64"),
    curator_pubkey: new PublicKey(curatorKp.publicKey).toBase58(),
    curator_signature: Buffer.from(curatorSig).toString("base64"),
    impression_nonce: 0,
    context_hash: "00".repeat(32),
    timestamp: 1700000000,
    content: { type: "text", title: "Test Ad" },
    context_categories: ["test"],
  };

  return { slot, agentSignature: agentSig };
}

describe("buildEd25519VerifyInstructions", () => {
  it("returns exactly 3 instructions", () => {
    const agentPubkey = new PublicKey(agentKp.publicKey);
    const { slot, agentSignature } = makeTestSlot(agentPubkey);

    const ixs = buildEd25519VerifyInstructions({
      slot,
      agentPubkey,
      agentSignature,
    });

    expect(ixs).toHaveLength(3);
  });

  it("all instructions target Ed25519 program", () => {
    const agentPubkey = new PublicKey(agentKp.publicKey);
    const { slot, agentSignature } = makeTestSlot(agentPubkey);

    const ixs = buildEd25519VerifyInstructions({
      slot,
      agentPubkey,
      agentSignature,
    });

    for (const ix of ixs) {
      expect(ix.programId.equals(ED25519_PROGRAM_ID)).toBe(true);
    }
  });
});

describe("PDA helpers", () => {
  it("findBitmapPda returns consistent PDA", () => {
    const [pda1, bump1] = findBitmapPda(adId, 0);
    const [pda2, bump2] = findBitmapPda(adId, 0);
    expect(pda1.equals(pda2)).toBe(true);
    expect(bump1).toBe(bump2);
  });

  it("findBitmapPda chunk index changes at BITS_PER_BITMAP boundary", () => {
    const [pda0] = findBitmapPda(adId, 0);
    const [pda8191] = findBitmapPda(adId, 8191);
    const [pda8192] = findBitmapPda(adId, 8192);

    // nonce 0 and 8191 are in the same chunk (index 0)
    expect(pda0.equals(pda8191)).toBe(true);
    // nonce 8192 is in chunk index 1
    expect(pda0.equals(pda8192)).toBe(false);
  });

  it("findScreenerPda uses correct seeds", () => {
    const key = PublicKey.default;
    const [pda] = findScreenerPda(key);
    const [expected] = PublicKey.findProgramAddressSync(
      [Buffer.from("screener"), key.toBuffer()], PROGRAM_ID,
    );
    expect(pda.equals(expected)).toBe(true);
  });

  it("findCuratorPda uses correct seeds", () => {
    const key = PublicKey.default;
    const [pda] = findCuratorPda(key);
    const [expected] = PublicKey.findProgramAddressSync(
      [Buffer.from("curator"), key.toBuffer()], PROGRAM_ID,
    );
    expect(pda.equals(expected)).toBe(true);
  });

  it("findDepositPda uses correct seeds", () => {
    const key = PublicKey.default;
    const [pda] = findDepositPda(key);
    const [expected] = PublicKey.findProgramAddressSync(
      [Buffer.from("deposit"), key.toBuffer()], PROGRAM_ID,
    );
    expect(pda.equals(expected)).toBe(true);
  });

  it("findConfigPda uses correct seeds", () => {
    const [pda] = findConfigPda();
    const [expected] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")], PROGRAM_ID,
    );
    expect(pda.equals(expected)).toBe(true);
  });

  it("findAdPda uses correct seeds", () => {
    const key = PublicKey.default;
    const adIndex = 0;
    const [pda] = findAdPda(key, adIndex);
    const indexBytes = Buffer.alloc(8);
    indexBytes.writeBigUInt64LE(BigInt(adIndex));
    const [expected] = PublicKey.findProgramAddressSync(
      [Buffer.from("ad"), key.toBuffer(), indexBytes], PROGRAM_ID,
    );
    expect(pda.equals(expected)).toBe(true);
  });

  it("findAdPda returns different PDA for different ad indices", () => {
    const key = PublicKey.default;
    const [pda0] = findAdPda(key, 0);
    const [pda1] = findAdPda(key, 1);
    expect(pda0.equals(pda1)).toBe(false);
  });
});
