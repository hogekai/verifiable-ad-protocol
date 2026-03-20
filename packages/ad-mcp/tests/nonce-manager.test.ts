import { describe, it, expect, afterEach } from "vitest";
import { NonceManager } from "../src/nonce-manager.js";
import { join } from "path";
import { tmpdir } from "os";
import { unlinkSync } from "fs";

function tempDb(): string {
  return join(tmpdir(), `nonce-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

describe("NonceManager", () => {
  const dbs: string[] = [];

  function createManager(): NonceManager {
    const path = tempDb();
    dbs.push(path);
    return new NonceManager(path);
  }

  afterEach(() => {
    for (const db of dbs) {
      try { unlinkSync(db); } catch {}
    }
    dbs.length = 0;
  });

  it("first getAndIncrement returns 0", () => {
    const mgr = createManager();
    expect(mgr.getAndIncrement("ad1")).toBe(0);
    mgr.close();
  });

  it("second getAndIncrement returns 1", () => {
    const mgr = createManager();
    expect(mgr.getAndIncrement("ad1")).toBe(0);
    expect(mgr.getAndIncrement("ad1")).toBe(1);
    mgr.close();
  });

  it("different ad_ids have independent counters", () => {
    const mgr = createManager();
    expect(mgr.getAndIncrement("ad1")).toBe(0);
    expect(mgr.getAndIncrement("ad2")).toBe(0);
    expect(mgr.getAndIncrement("ad1")).toBe(1);
    expect(mgr.getAndIncrement("ad2")).toBe(1);
    mgr.close();
  });

  it("increments monotonically", () => {
    const mgr = createManager();
    for (let i = 0; i < 10; i++) {
      expect(mgr.getAndIncrement("ad1")).toBe(i);
    }
    mgr.close();
  });
});
