import {
  PublicKey,
  Ed25519Program,
  TransactionInstruction,
} from "@solana/web3.js";
import type { AdSlot, ImpressionMessage } from "./types.js";
import { hashImpressionMessage } from "./message.js";
import { BITS_PER_BITMAP, PROGRAM_ID } from "./constants.js";

/**
 * Build 3 Ed25519 verify instructions for an impression.
 * Returns [screener_ix, curator_ix, agent_ix].
 */
export function buildEd25519VerifyInstructions(params: {
  slot: AdSlot;
  agentPubkey: PublicKey;
  agentSignature: Uint8Array;
  programId?: PublicKey;
}): TransactionInstruction[] {
  const { slot, agentPubkey, agentSignature } = params;

  const msg: ImpressionMessage = {
    ad_id: new PublicKey(slot.ad_id),
    screener: new PublicKey(slot.screener_pubkey),
    curator: new PublicKey(slot.curator_pubkey),
    agent: agentPubkey,
    impression_nonce: BigInt(slot.impression_nonce),
    context_hash: Buffer.from(slot.context_hash, "hex"),
    timestamp: BigInt(slot.timestamp),
  };
  const messageHash = hashImpressionMessage(msg);

  return [
    Ed25519Program.createInstructionWithPublicKey({
      publicKey: new PublicKey(slot.screener_pubkey).toBytes(),
      message: messageHash,
      signature: Buffer.from(slot.screener_signature, "base64"),
    }),
    Ed25519Program.createInstructionWithPublicKey({
      publicKey: new PublicKey(slot.curator_pubkey).toBytes(),
      message: messageHash,
      signature: Buffer.from(slot.curator_signature, "base64"),
    }),
    Ed25519Program.createInstructionWithPublicKey({
      publicKey: agentPubkey.toBytes(),
      message: messageHash,
      signature: agentSignature,
    }),
  ];
}

/** PDA derivation helpers */
export function findBitmapPda(adId: PublicKey, nonce: number, programId?: PublicKey) {
  const pid = programId ?? PROGRAM_ID;
  const chunkIndex = Math.floor(nonce / Number(BITS_PER_BITMAP));
  const chunkBytes = Buffer.alloc(2);
  chunkBytes.writeUInt16LE(chunkIndex);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bitmap"), adId.toBuffer(), chunkBytes], pid,
  );
}

export function findScreenerPda(screener: PublicKey, programId?: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("screener"), screener.toBuffer()], programId ?? PROGRAM_ID,
  );
}

export function findCuratorPda(curator: PublicKey, programId?: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("curator"), curator.toBuffer()], programId ?? PROGRAM_ID,
  );
}

export function findDepositPda(advertiser: PublicKey, programId?: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("deposit"), advertiser.toBuffer()], programId ?? PROGRAM_ID,
  );
}

export function findConfigPda(programId?: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config")], programId ?? PROGRAM_ID,
  );
}

export function findAdPda(advertiser: PublicKey, adIndex: number, programId?: PublicKey) {
  const pid = programId ?? PROGRAM_ID;
  const indexBytes = Buffer.alloc(8);
  indexBytes.writeBigUInt64LE(BigInt(adIndex));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("ad"), advertiser.toBuffer(), indexBytes], pid,
  );
}
