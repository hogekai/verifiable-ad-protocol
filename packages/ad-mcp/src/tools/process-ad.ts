import { PublicKey, Transaction, Connection } from "@solana/web3.js";
import {
  hashImpressionMessage,
  buildEd25519VerifyInstructions,
  validateAdSlot,
} from "@verifiable-ad-protocol/core";
import type { AdSlot, ImpressionMessage } from "@verifiable-ad-protocol/core";
import type { VaulxClient } from "../vaulx-client.js";
import type { NonceManager } from "../nonce-manager.js";
import type { RetryQueue } from "../retry-queue.js";

/**
 * Process an ad slot: sign + build tx + submit via vaulx.
 *
 * All vaulx communication is localhost HTTP. LLM is not involved.
 */
export async function processAd(params: {
  slot: AdSlot;
  vaulx: VaulxClient;
  nonceManager: NonceManager;
  retryQueue: RetryQueue;
  programId: PublicKey;
  solanaRpc: string;
}): Promise<{ success: boolean; signature?: string; error?: string }> {
  const { slot, vaulx, nonceManager, retryQueue, programId, solanaRpc } = params;

  // 1. Validate
  if (!validateAdSlot(slot)) {
    return { success: false, error: "Invalid ad slot" };
  }

  try {
    // 2. Get agent pubkey from vaulx
    const agentAddress = await vaulx.getAddress();
    const agentPubkey = new PublicKey(agentAddress);

    // 3. Build canonical message hash
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

    // 4. Sign via vaulx (localhost HTTP, not through LLM)
    const { signature: agentSigBase64 } = await vaulx.signBytes(
      messageHash.toString("base64")
    );
    const agentSignature = Buffer.from(agentSigBase64, "base64");

    // 5. Build Ed25519 verify instructions
    const ed25519Ixs = buildEd25519VerifyInstructions({
      slot,
      agentPubkey,
      agentSignature,
      programId,
    });

    // 6. Build record_impression instruction (using Anchor IDL)
    // NOTE: This requires the Anchor-generated client.
    // The implementation will use:
    //   program.methods.recordImpression(nonce, contextHash, timestamp, chunkIndex, agentPubkey)
    //     .accounts({...}).instruction()
    // For now, this is a placeholder — the actual Anchor IDL client will be generated
    // from the on-chain program's IDL json (target/idl/verifiable_ad_protocol.json).

    // 7. Assemble full transaction
    const tx = new Transaction();
    for (const ix of ed25519Ixs) tx.add(ix);
    // tx.add(recordImpressionIx);  // Add after Anchor IDL integration

    // 8. Serialize and submit via vaulx
    const connection = new Connection(solanaRpc);
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    // feePayer will be set by vaulx

    const txBase64 = tx.serialize({ requireAllSignatures: false }).toString("base64");
    const { signature: txSig } = await vaulx.signAndSendRawTransaction(txBase64);

    return { success: true, signature: txSig };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);

    // TODO: Add to retry queue when tx serialization is available
    // retryQueue.add(txBase64, slot.ad_id, slot.impression_nonce);

    return { success: false, error: errMsg };
  }
}
