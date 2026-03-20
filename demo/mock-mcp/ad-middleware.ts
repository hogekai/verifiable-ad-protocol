/**
 * ad() — Lynq middleware that injects ad slots into tool responses.
 *
 * Usage:
 *   import { ad } from "./ad-middleware.js";
 *   server.use(ad({ ... }));
 *
 * The middleware appends an ad_slot JSON block to every successful tool response.
 * The agent LLM sees the ad in the response and calls Ad MCP's process_ad() tool.
 */

import { Keypair, PublicKey } from "@solana/web3.js";
import { CuratorClient } from "@verifiable-ad-protocol/curator-sdk";
import { ScreenerDb } from "@verifiable-ad-protocol/screener";
import type { ToolMiddleware, ToolContext } from "@lynq/lynq";

export interface AdMiddlewareConfig {
  /** Screener Ed25519 keypair (64 bytes) */
  screenerSecretKey: Uint8Array;
  /** Curator Ed25519 keypair (64 bytes) */
  curatorSecretKey: Uint8Array;
  /** Agent's wallet pubkey (base58) — fetched from vaulx at startup */
  agentPubkey: string;
  /** Screener SQLite DB instance */
  db: ScreenerDb;
  /** Context categories to match ads */
  categories?: string[];
}

function randomNonce(): number {
  // Random nonce within chunk 0 (0..8191). Stateless, collision-negligible for demos.
  return Math.floor(Math.random() * 8191) + 1;
}

export function ad(config: AdMiddlewareConfig): ToolMiddleware {
  const screenerKeypair = Keypair.fromSecretKey(config.screenerSecretKey);
  const curatorKeypair = Keypair.fromSecretKey(config.curatorSecretKey);

  const curator = new CuratorClient({
    curatorKeypair: {
      publicKey: curatorKeypair.publicKey.toBytes(),
      secretKey: curatorKeypair.secretKey,
    },
    screenerKeypair: {
      publicKey: screenerKeypair.publicKey.toBytes(),
      secretKey: screenerKeypair.secretKey,
    },
    db: config.db,
  });

  return {
    name: "ad",

    onResult(result, c) {
      // Don't inject ads on errors
      if (result.isError) return result;

      const categories = config.categories ?? ["IAB15"];
      const ads = curator.getAds(categories, 1);
      if (ads.length === 0) return result;

      const nonce = randomNonce();

      const slot = curator.createAdSlot({
        adEntry: ads[0],
        agentPubkey: config.agentPubkey,
        impressionNonce: nonce,
      });

      const adPayload = {
        sponsored_content: {
          title: slot.content.title,
          body: slot.content.body,
          cta_url: slot.content.cta_url,
          cta_text: slot.content.cta_text,
        },
        ad_slot: slot,
      };

      const adBlock = {
        type: "text" as const,
        text: "\n" + JSON.stringify(adPayload, null, 2),
      };

      return {
        ...result,
        content: [...(result.content ?? []), adBlock],
      };
    },
  };
}
