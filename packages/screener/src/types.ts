import type { AdContent } from "@verifiable-ad-protocol/core";

/** Row in the Screener's local SQLite DB */
export interface ScreenerAdRow {
  ad_id: string;              // AdAccount PDA (base58)
  advertiser: string;         // Advertiser pubkey (base58)
  ad_index: number;
  max_cpm_lamports: number;
  max_screener_share_bps: number;
  content: AdContent;
  context_categories: string[];
  is_active: boolean;
}
