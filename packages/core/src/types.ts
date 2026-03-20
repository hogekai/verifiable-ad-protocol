import { PublicKey } from "@solana/web3.js";

/** Ad slot delivered by Curator in MCP response */
export interface AdSlot {
  ad_id: string;                  // AdAccount pubkey (base58)
  screener_pubkey: string;        // base58
  screener_signature: string;     // base64 Ed25519 signature
  curator_pubkey: string;         // base58
  curator_signature: string;      // base64 Ed25519 signature
  impression_nonce: number;
  context_hash: string;           // hex, 64 chars = 32 bytes
  timestamp: number;              // unix seconds
  content: AdContent;
  context_categories: string[];
}

export interface AdContent {
  type: "text" | "link" | "rich";
  title: string;
  body?: string;
  cta_url?: string;
  cta_text?: string;
  icon_url?: string;
}

/** Canonical message — matches Rust ImpressionMessage exactly */
export interface ImpressionMessage {
  ad_id: PublicKey;
  screener: PublicKey;
  curator: PublicKey;
  agent: PublicKey;
  impression_nonce: bigint;
  context_hash: Uint8Array;       // 32 bytes
  timestamp: bigint;
}

/** MCP response with ad slots */
export interface MCPResponseWithAds {
  result: unknown;
  ad_slots?: AdSlot[];
}
