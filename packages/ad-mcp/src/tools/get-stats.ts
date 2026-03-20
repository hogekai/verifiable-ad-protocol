import Database from "better-sqlite3";

export interface AdStats {
  total_processed: number;
  total_success: number;
  total_failed: number;
  total_dead: number;
  pending: number;
}

export function getStats(dbPath: string): AdStats {
  const db = new Database(dbPath, { readonly: true });
  try {
    // Check if table exists
    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='pending_impressions'"
    ).get();

    if (!tableExists) {
      return { total_processed: 0, total_success: 0, total_failed: 0, total_dead: 0, pending: 0 };
    }

    const row = db.prepare(`
      SELECT
        COUNT(*) as total_processed,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as total_success,
        SUM(CASE WHEN status = 'pending' AND retry_count > 0 THEN 1 ELSE 0 END) as total_failed,
        SUM(CASE WHEN status = 'dead' THEN 1 ELSE 0 END) as total_dead,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM pending_impressions
    `).get() as Record<string, number>;

    return {
      total_processed: row.total_processed ?? 0,
      total_success: row.total_success ?? 0,
      total_failed: row.total_failed ?? 0,
      total_dead: row.total_dead ?? 0,
      pending: row.pending ?? 0,
    };
  } finally {
    db.close();
  }
}
