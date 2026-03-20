import { describe, it, expect, afterEach } from "vitest";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import { CuratorClient } from "../src/curator-client.js";
import { ScreenerDb } from "@verifiable-ad-protocol/screener";
import { hashImpressionMessage } from "@verifiable-ad-protocol/core";
import type { ImpressionMessage } from "@verifiable-ad-protocol/core";
import { join } from "path";
import { tmpdir } from "os";
import { unlinkSync } from "fs";

function tempDb(): string {
  return join(tmpdir(), `curator-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

describe("CuratorClient", () => {
  const dbs: string[] = [];

  afterEach(() => {
    for (const db of dbs) {
      try { unlinkSync(db); } catch {}
    }
    dbs.length = 0;
  });

  it("getAds returns matching ads from DB", () => {
    const path = tempDb();
    dbs.push(path);
    const db = new ScreenerDb(path);

    db.upsertAd({
      ad_id: "11111111111111111111111111111111",
      advertiser: "22222222222222222222222222222222",
      ad_index: 0,
      max_cpm_lamports: 10_000_000,
      max_screener_share_bps: 2000,
      content: { type: "text", title: "Test Ad" },
      context_categories: ["tech"],
      is_active: true,
    });

    const client = new CuratorClient({
      curatorKeypair: nacl.sign.keyPair(),
      screenerKeypair: nacl.sign.keyPair(),
      db,
    });

    const ads = client.getAds(["tech"]);
    expect(ads).toHaveLength(1);
    expect(ads[0].ad_id).toBe("11111111111111111111111111111111");

    db.close();
  });

  it("createAdSlot produces valid signatures", () => {
    const path = tempDb();
    dbs.push(path);
    const db = new ScreenerDb(path);

    const screenerKp = nacl.sign.keyPair();
    const curatorKp = nacl.sign.keyPair();
    const agentKp = nacl.sign.keyPair();

    const adId = new PublicKey(new Uint8Array(32).fill(1)).toBase58();
    const advertiser = new PublicKey(new Uint8Array(32).fill(2)).toBase58();

    db.upsertAd({
      ad_id: adId,
      advertiser,
      ad_index: 0,
      max_cpm_lamports: 10_000_000,
      max_screener_share_bps: 2000,
      content: { type: "text", title: "Test Ad" },
      context_categories: ["tech"],
      is_active: true,
    });

    const client = new CuratorClient({
      curatorKeypair: curatorKp,
      screenerKeypair: screenerKp,
      db,
    });

    const ads = client.getAds(["tech"]);
    const agentPubkey = new PublicKey(agentKp.publicKey).toBase58();

    const slot = client.createAdSlot({
      adEntry: ads[0],
      agentPubkey,
      impressionNonce: 0,
    });

    // Verify slot fields
    expect(slot.ad_id).toBe(adId);
    expect(slot.advertiser).toBe(advertiser);
    expect(slot.screener_pubkey).toBe(new PublicKey(screenerKp.publicKey).toBase58());
    expect(slot.curator_pubkey).toBe(new PublicKey(curatorKp.publicKey).toBase58());
    expect(slot.impression_nonce).toBe(0);
    expect(slot.context_hash).toHaveLength(64); // hex
    expect(slot.content.title).toBe("Test Ad");

    // Verify screener signature
    const msg: ImpressionMessage = {
      ad_id: new PublicKey(slot.ad_id),
      screener: new PublicKey(screenerKp.publicKey),
      curator: new PublicKey(curatorKp.publicKey),
      agent: new PublicKey(agentPubkey),
      impression_nonce: BigInt(slot.impression_nonce),
      context_hash: Buffer.from(slot.context_hash, "hex"),
      timestamp: BigInt(slot.timestamp),
    };
    const messageHash = hashImpressionMessage(msg);

    const screenerSig = Buffer.from(slot.screener_signature, "base64");
    expect(nacl.sign.detached.verify(messageHash, screenerSig, screenerKp.publicKey)).toBe(true);

    // Verify curator signature
    const curatorSig = Buffer.from(slot.curator_signature, "base64");
    expect(nacl.sign.detached.verify(messageHash, curatorSig, curatorKp.publicKey)).toBe(true);

    db.close();
  });
});
