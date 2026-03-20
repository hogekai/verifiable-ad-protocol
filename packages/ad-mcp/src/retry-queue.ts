import Database from "better-sqlite3";

export interface PendingImpression {
  id: number;
  tx_base64: string;
  ad_id: string;
  nonce: number;
  retry_count: number;
  created_at: number;
  last_error: string | null;
}

export class RetryQueue {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pending_impressions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tx_base64 TEXT NOT NULL,
        ad_id TEXT NOT NULL,
        nonce INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        status TEXT NOT NULL DEFAULT 'pending'
      )
    `);
  }

  add(txBase64: string, adId: string, nonce: number) {
    this.db.prepare(
      `INSERT INTO pending_impressions (tx_base64, ad_id, nonce, created_at)
       VALUES (?, ?, ?, ?)`
    ).run(txBase64, adId, nonce, Date.now());
  }

  getPending(limit = 10): PendingImpression[] {
    return this.db.prepare(
      `SELECT id, tx_base64, ad_id, nonce, retry_count, created_at, last_error
       FROM pending_impressions
       WHERE status = 'pending' AND retry_count < 10
       ORDER BY created_at ASC LIMIT ?`
    ).all(limit) as PendingImpression[];
  }

  markSuccess(id: number) {
    this.db.prepare(
      `UPDATE pending_impressions SET status = 'confirmed' WHERE id = ?`
    ).run(id);
  }

  markFailed(id: number, error: string) {
    this.db.prepare(
      `UPDATE pending_impressions SET retry_count = retry_count + 1, last_error = ? WHERE id = ?`
    ).run(error, id);
  }

  markDead(id: number) {
    this.db.prepare(
      `UPDATE pending_impressions SET status = 'dead' WHERE id = ?`
    ).run(id);
  }

  close() { this.db.close(); }
}
