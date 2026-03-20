import { createHash } from "crypto";
import type { ImpressionMessage } from "./types.js";

/**
 * Borsh serialize ImpressionMessage.
 * Field order MUST match Rust ImpressionMessage in state.rs:
 *   ad_id(32) + screener(32) + curator(32) + agent(32) +
 *   impression_nonce(u64 LE 8) + context_hash(32) + timestamp(i64 LE 8)
 * Total: 176 bytes fixed.
 */
export function serializeImpressionMessage(msg: ImpressionMessage): Buffer {
  const buf = Buffer.alloc(176);
  let offset = 0;
  buf.set(msg.ad_id.toBuffer(), offset); offset += 32;
  buf.set(msg.screener.toBuffer(), offset); offset += 32;
  buf.set(msg.curator.toBuffer(), offset); offset += 32;
  buf.set(msg.agent.toBuffer(), offset); offset += 32;
  buf.writeBigUInt64LE(msg.impression_nonce, offset); offset += 8;
  buf.set(msg.context_hash, offset); offset += 32;
  buf.writeBigInt64LE(msg.timestamp, offset); offset += 8;
  return buf;
}

/**
 * SHA-256 hash of serialized message.
 * Matches Rust: anchor_lang::solana_program::hash::hash(&message_bytes)
 * This hash is what gets signed by Ed25519.
 */
export function hashImpressionMessage(msg: ImpressionMessage): Buffer {
  const serialized = serializeImpressionMessage(msg);
  return createHash("sha256").update(serialized).digest();
}
