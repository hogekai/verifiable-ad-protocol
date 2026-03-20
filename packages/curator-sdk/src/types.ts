import type { ScreenerDb } from "@verifiable-ad-protocol/screener";

export interface CuratorClientConfig {
  curatorKeypair: { publicKey: Uint8Array; secretKey: Uint8Array };
  screenerKeypair: { publicKey: Uint8Array; secretKey: Uint8Array };
  db: ScreenerDb;
}
