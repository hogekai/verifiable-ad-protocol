import { PublicKey } from "@solana/web3.js";
import { createHash } from "crypto";
import nacl from "tweetnacl";
import { hashImpressionMessage } from "@verifiable-ad-protocol/core";
import type { AdSlot, ImpressionMessage } from "@verifiable-ad-protocol/core";
import type { ScreenerAdRow } from "@verifiable-ad-protocol/screener";
import type { CuratorClientConfig } from "./types.js";

/**
 * Curator client — builds fully-signed AdSlots.
 *
 * Phase 1: Screener and Curator are co-located, so both keypairs are available.
 * Both sign at AdSlot creation time because the canonical message includes
 * agent_pubkey, impression_nonce, and timestamp (unknown until creation time).
 */
export class CuratorClient {
  private curatorKeypair: { publicKey: Uint8Array; secretKey: Uint8Array };
  private screenerKeypair: { publicKey: Uint8Array; secretKey: Uint8Array };
  private db: CuratorClientConfig["db"];

  constructor(config: CuratorClientConfig) {
    this.curatorKeypair = config.curatorKeypair;
    this.screenerKeypair = config.screenerKeypair;
    this.db = config.db;
  }

  get curatorPubkey(): string {
    return new PublicKey(this.curatorKeypair.publicKey).toBase58();
  }

  get screenerPubkey(): string {
    return new PublicKey(this.screenerKeypair.publicKey).toBase58();
  }

  /**
   * Get ads matching the given context categories.
   */
  getAds(
    categories: string[],
    maxResults = 5,
  ): ScreenerAdRow[] {
    return this.db.getByCategories(categories, maxResults);
  }

  /**
   * Build a complete AdSlot with Screener + Curator signatures.
   */
  createAdSlot(params: {
    adEntry: ScreenerAdRow;
    agentPubkey: string;
    impressionNonce: number;
  }): AdSlot {
    const { adEntry, agentPubkey, impressionNonce } = params;

    const timestamp = Math.floor(Date.now() / 1000);
    const contextHash = createHash("sha256")
      .update(adEntry.context_categories.sort().join(","))
      .digest();

    const msg: ImpressionMessage = {
      ad_id: new PublicKey(adEntry.ad_id),
      screener: new PublicKey(this.screenerKeypair.publicKey),
      curator: new PublicKey(this.curatorKeypair.publicKey),
      agent: new PublicKey(agentPubkey),
      impression_nonce: BigInt(impressionNonce),
      context_hash: contextHash,
      timestamp: BigInt(timestamp),
    };

    const messageHash = hashImpressionMessage(msg);

    const screenerSig = nacl.sign.detached(
      messageHash,
      this.screenerKeypair.secretKey,
    );
    const curatorSig = nacl.sign.detached(
      messageHash,
      this.curatorKeypair.secretKey,
    );

    return {
      ad_id: adEntry.ad_id,
      advertiser: adEntry.advertiser,
      screener_pubkey: this.screenerPubkey,
      screener_signature: Buffer.from(screenerSig).toString("base64"),
      curator_pubkey: this.curatorPubkey,
      curator_signature: Buffer.from(curatorSig).toString("base64"),
      impression_nonce: impressionNonce,
      context_hash: contextHash.toString("hex"),
      timestamp,
      content: adEntry.content,
      context_categories: adEntry.context_categories,
    };
  }
}
