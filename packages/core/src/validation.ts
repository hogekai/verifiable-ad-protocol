import { PublicKey } from "@solana/web3.js";
import type { AdSlot } from "./types.js";

export function validateAdSlot(slot: unknown): slot is AdSlot {
  if (!slot || typeof slot !== "object") return false;
  const s = slot as Record<string, unknown>;

  // Required string fields
  for (const key of ["ad_id", "screener_pubkey", "screener_signature",
                      "curator_pubkey", "curator_signature", "context_hash"]) {
    if (typeof s[key] !== "string") return false;
  }

  // Pubkey format check
  try {
    new PublicKey(s.ad_id as string);
    new PublicKey(s.screener_pubkey as string);
    new PublicKey(s.curator_pubkey as string);
  } catch { return false; }

  // context_hash = 64 hex chars
  if ((s.context_hash as string).length !== 64) return false;
  if (!/^[0-9a-f]+$/i.test(s.context_hash as string)) return false;

  // Numbers
  if (typeof s.impression_nonce !== "number") return false;
  if (typeof s.timestamp !== "number") return false;

  // Content
  if (!s.content || typeof s.content !== "object") return false;

  return true;
}
