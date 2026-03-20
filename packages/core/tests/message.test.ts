import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { serializeImpressionMessage, hashImpressionMessage } from "../src/message.js";
import type { ImpressionMessage } from "../src/types.js";

// Known test vector: matches Rust unit test in state.rs
const TEST_MSG: ImpressionMessage = {
  ad_id: new PublicKey(new Uint8Array(32).fill(1)),
  screener: new PublicKey(new Uint8Array(32).fill(2)),
  curator: new PublicKey(new Uint8Array(32).fill(3)),
  agent: new PublicKey(new Uint8Array(32).fill(4)),
  impression_nonce: 42n,
  context_hash: new Uint8Array(32).fill(0xab),
  timestamp: 1700000000n,
};

describe("serializeImpressionMessage", () => {
  it("produces exactly 176 bytes", () => {
    const buf = serializeImpressionMessage(TEST_MSG);
    expect(buf.length).toBe(176);
  });

  it("matches expected Borsh layout", () => {
    const buf = serializeImpressionMessage(TEST_MSG);

    // ad_id: 32 bytes of 0x01
    expect(Buffer.from(buf.subarray(0, 32))).toEqual(Buffer.alloc(32, 1));
    // screener: 32 bytes of 0x02
    expect(Buffer.from(buf.subarray(32, 64))).toEqual(Buffer.alloc(32, 2));
    // curator: 32 bytes of 0x03
    expect(Buffer.from(buf.subarray(64, 96))).toEqual(Buffer.alloc(32, 3));
    // agent: 32 bytes of 0x04
    expect(Buffer.from(buf.subarray(96, 128))).toEqual(Buffer.alloc(32, 4));
    // impression_nonce: u64 LE = 42
    expect(buf.readBigUInt64LE(128)).toBe(42n);
    // context_hash: 32 bytes of 0xAB
    expect(Buffer.from(buf.subarray(136, 168))).toEqual(Buffer.alloc(32, 0xab));
    // timestamp: i64 LE = 1700000000
    expect(buf.readBigInt64LE(168)).toBe(1700000000n);
  });

  it("produces known hex (cross-verify with Rust)", () => {
    const buf = serializeImpressionMessage(TEST_MSG);
    const hex = buf.toString("hex");

    // Expected hex:
    //   01*32 + 02*32 + 03*32 + 04*32 + 2a00000000000000 + ab*32 + 0046d965_00000000
    const expected =
      "01".repeat(32) +
      "02".repeat(32) +
      "03".repeat(32) +
      "04".repeat(32) +
      "2a00000000000000" +
      "ab".repeat(32) +
      "00f1536500000000"; // 1700000000 = 0x65_53_f1_00 → LE bytes

    expect(hex).toBe(expected);
  });
});

describe("hashImpressionMessage", () => {
  it("produces 32 bytes", () => {
    const hash = hashImpressionMessage(TEST_MSG);
    expect(hash.length).toBe(32);
  });

  it("is deterministic", () => {
    const h1 = hashImpressionMessage(TEST_MSG);
    const h2 = hashImpressionMessage(TEST_MSG);
    expect(h1).toEqual(h2);
  });

  it("matches Rust SHA-256 (cross-verified)", () => {
    const hash = hashImpressionMessage(TEST_MSG);
    // Matches Rust: anchor_lang::solana_program::hash::hash() output
    // base58: DpBZKqoPkypZ8txKna9sc9Hw9xPHvdBX7RJfFuG4w6RU
    expect(hash.toString("hex")).toBe(
      "be627a750754abffc66f8439ee6cfa033e7d4f5d0148ac46c7f962c4a3243f3f"
    );
  });
});
