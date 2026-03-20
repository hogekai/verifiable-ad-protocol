import { describe, it, expect, afterEach } from "vitest";
import { ScreenerDb } from "../src/db.js";
import { join } from "path";
import { tmpdir } from "os";
import { unlinkSync } from "fs";

function tempDb(): string {
  return join(tmpdir(), `screener-db-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

describe("ScreenerDb", () => {
  const dbs: string[] = [];

  afterEach(() => {
    for (const db of dbs) {
      try { unlinkSync(db); } catch {}
    }
    dbs.length = 0;
  });

  it("upserts and retrieves ads", () => {
    const path = tempDb();
    dbs.push(path);
    const db = new ScreenerDb(path);

    db.upsertAd({
      ad_id: "ad1",
      advertiser: "adv1",
      ad_index: 0,
      max_cpm_lamports: 10_000_000,
      max_screener_share_bps: 2000,
      content: { type: "text", title: "Test Ad" },
      context_categories: ["tech", "ai"],
      is_active: true,
    });

    const all = db.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].ad_id).toBe("ad1");
    expect(all[0].content.title).toBe("Test Ad");
    expect(all[0].context_categories).toEqual(["tech", "ai"]);

    db.close();
  });

  it("filters by categories", () => {
    const path = tempDb();
    dbs.push(path);
    const db = new ScreenerDb(path);

    db.upsertAd({
      ad_id: "ad1",
      advertiser: "adv1",
      ad_index: 0,
      max_cpm_lamports: 10_000_000,
      max_screener_share_bps: 2000,
      content: { type: "text", title: "Tech Ad" },
      context_categories: ["tech"],
      is_active: true,
    });

    db.upsertAd({
      ad_id: "ad2",
      advertiser: "adv1",
      ad_index: 1,
      max_cpm_lamports: 5_000_000,
      max_screener_share_bps: 1500,
      content: { type: "text", title: "Finance Ad" },
      context_categories: ["finance"],
      is_active: true,
    });

    const techAds = db.getByCategories(["tech"], 10);
    expect(techAds).toHaveLength(1);
    expect(techAds[0].ad_id).toBe("ad1");

    const financeAds = db.getByCategories(["finance"], 10);
    expect(financeAds).toHaveLength(1);
    expect(financeAds[0].ad_id).toBe("ad2");

    const noMatch = db.getByCategories(["sports"], 10);
    expect(noMatch).toHaveLength(0);

    db.close();
  });

  it("respects max results", () => {
    const path = tempDb();
    dbs.push(path);
    const db = new ScreenerDb(path);

    for (let i = 0; i < 5; i++) {
      db.upsertAd({
        ad_id: `ad${i}`,
        advertiser: "adv1",
        ad_index: i,
        max_cpm_lamports: 10_000_000,
        max_screener_share_bps: 2000,
        content: { type: "text", title: `Ad ${i}` },
        context_categories: ["general"],
        is_active: true,
      });
    }

    const limited = db.getByCategories(["general"], 2);
    expect(limited).toHaveLength(2);

    db.close();
  });

  it("upsert replaces existing ad", () => {
    const path = tempDb();
    dbs.push(path);
    const db = new ScreenerDb(path);

    db.upsertAd({
      ad_id: "ad1",
      advertiser: "adv1",
      ad_index: 0,
      max_cpm_lamports: 10_000_000,
      max_screener_share_bps: 2000,
      content: { type: "text", title: "Original" },
      context_categories: ["tech"],
      is_active: true,
    });

    db.upsertAd({
      ad_id: "ad1",
      advertiser: "adv1",
      ad_index: 0,
      max_cpm_lamports: 20_000_000,
      max_screener_share_bps: 3000,
      content: { type: "text", title: "Updated" },
      context_categories: ["tech", "ai"],
      is_active: true,
    });

    const all = db.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].content.title).toBe("Updated");
    expect(all[0].max_cpm_lamports).toBe(20_000_000);

    db.close();
  });
});
