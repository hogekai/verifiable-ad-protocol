import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import { signImpression } from "../src/signer.js";
import { hashImpressionMessage } from "@verifiable-ad-protocol/core";
import type { ImpressionMessage } from "@verifiable-ad-protocol/core";

describe("signImpression", () => {
  it("produces a valid Ed25519 signature", () => {
    const kp = nacl.sign.keyPair();

    const msg: ImpressionMessage = {
      ad_id: new PublicKey(new Uint8Array(32).fill(1)),
      screener: new PublicKey(kp.publicKey),
      curator: new PublicKey(new Uint8Array(32).fill(3)),
      agent: new PublicKey(new Uint8Array(32).fill(4)),
      impression_nonce: 42n,
      context_hash: new Uint8Array(32).fill(0xab),
      timestamp: 1700000000n,
    };

    const sigBase64 = signImpression({
      screenerKeypair: kp,
      msg,
    });

    const sigBytes = Buffer.from(sigBase64, "base64");
    expect(sigBytes).toHaveLength(64);

    // Verify the signature
    const messageHash = hashImpressionMessage(msg);
    const valid = nacl.sign.detached.verify(messageHash, sigBytes, kp.publicKey);
    expect(valid).toBe(true);
  });

  it("signature differs for different messages", () => {
    const kp = nacl.sign.keyPair();

    const baseMsg: ImpressionMessage = {
      ad_id: new PublicKey(new Uint8Array(32).fill(1)),
      screener: new PublicKey(kp.publicKey),
      curator: new PublicKey(new Uint8Array(32).fill(3)),
      agent: new PublicKey(new Uint8Array(32).fill(4)),
      impression_nonce: 0n,
      context_hash: new Uint8Array(32).fill(0),
      timestamp: 1700000000n,
    };

    const sig1 = signImpression({ screenerKeypair: kp, msg: baseMsg });
    const sig2 = signImpression({
      screenerKeypair: kp,
      msg: { ...baseMsg, impression_nonce: 1n },
    });

    expect(sig1).not.toBe(sig2);
  });
});
