import nacl from "tweetnacl";
import { hashImpressionMessage } from "@verifiable-ad-protocol/core";
import type { ImpressionMessage } from "@verifiable-ad-protocol/core";

/**
 * Sign an impression message with a Screener keypair.
 * Returns base64-encoded Ed25519 signature.
 */
export function signImpression(params: {
  screenerKeypair: { publicKey: Uint8Array; secretKey: Uint8Array };
  msg: ImpressionMessage;
}): string {
  const messageHash = hashImpressionMessage(params.msg);
  const signature = nacl.sign.detached(messageHash, params.screenerKeypair.secretKey);
  return Buffer.from(signature).toString("base64");
}
