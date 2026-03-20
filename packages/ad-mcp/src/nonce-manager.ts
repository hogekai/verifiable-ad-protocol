import Database from "better-sqlite3";

export class NonceManager {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS impression_nonces (
        ad_id TEXT PRIMARY KEY,
        next_nonce INTEGER NOT NULL DEFAULT 0
      )
    `);
  }

  getAndIncrement(adId: string): number {
    const stmt = this.db.prepare(
      `INSERT INTO impression_nonces (ad_id, next_nonce) VALUES (?, 1)
       ON CONFLICT(ad_id) DO UPDATE SET next_nonce = next_nonce + 1
       RETURNING next_nonce - 1 AS nonce`
    );
    const row = stmt.get(adId) as { nonce: number };
    return row.nonce;
  }

  close() { this.db.close(); }
}
