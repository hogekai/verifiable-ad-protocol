import Database from "better-sqlite3";
import type { AdContent } from "@verifiable-ad-protocol/core";
import type { ScreenerAdRow } from "./types.js";

/**
 * Screener local DB — caches on-chain ad metadata.
 * Phase 1: signatures are generated at AdSlot creation time (not stored).
 */
export class ScreenerDb {
  private db: Database.Database;

  constructor(dbPath: string, readonly = false) {
    this.db = new Database(dbPath, { readonly });
    if (!readonly) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS screener_ads (
          ad_id TEXT PRIMARY KEY,
          advertiser TEXT NOT NULL,
          ad_index INTEGER NOT NULL,
          max_cpm_lamports INTEGER NOT NULL,
          max_screener_share_bps INTEGER NOT NULL DEFAULT 0,
          content_json TEXT NOT NULL DEFAULT '{}',
          context_categories_json TEXT NOT NULL DEFAULT '[]',
          is_active INTEGER NOT NULL DEFAULT 1
        )
      `);
    }
  }

  upsertAd(row: ScreenerAdRow): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO screener_ads
        (ad_id, advertiser, ad_index, max_cpm_lamports, max_screener_share_bps, content_json, context_categories_json, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.ad_id,
        row.advertiser,
        row.ad_index,
        row.max_cpm_lamports,
        row.max_screener_share_bps,
        JSON.stringify(row.content),
        JSON.stringify(row.context_categories),
        row.is_active ? 1 : 0,
      );
  }

  getByCategories(categories: string[], max: number): ScreenerAdRow[] {
    const all = this.getAll();
    const matched = all.filter(
      (ad) =>
        ad.is_active &&
        ad.context_categories.some((cat) => categories.includes(cat)),
    );
    return matched.slice(0, max);
  }

  getAll(): ScreenerAdRow[] {
    const rows = this.db
      .prepare("SELECT * FROM screener_ads WHERE is_active = 1")
      .all() as any[];

    return rows.map((row) => ({
      ad_id: row.ad_id,
      advertiser: row.advertiser,
      ad_index: row.ad_index,
      max_cpm_lamports: row.max_cpm_lamports,
      max_screener_share_bps: row.max_screener_share_bps,
      content: JSON.parse(row.content_json) as AdContent,
      context_categories: JSON.parse(row.context_categories_json) as string[],
      is_active: Boolean(row.is_active),
    }));
  }

  close(): void {
    this.db.close();
  }
}
