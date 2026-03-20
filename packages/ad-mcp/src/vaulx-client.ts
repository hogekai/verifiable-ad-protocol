/**
 * Client for vaulx HTTP API.
 * All communication is localhost only. Auth via WALLET_AUTH_TOKEN.
 * LLM never sees this traffic.
 */
export class VaulxClient {
  constructor(
    private endpoint: string,    // http://127.0.0.1:18420
    private authToken: string,
  ) {}

  private async request(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${this.endpoint}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`vaulx ${path} failed (${res.status}): ${text}`);
    }
    return res.json();
  }

  private authHeaders(): Record<string, string> {
    return this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {};
  }

  /** Get wallet address (Solana pubkey base58) */
  async getAddress(): Promise<string> {
    const res = await fetch(`${this.endpoint}/address`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) throw new Error(`vaulx /address failed: ${res.status}`);
    const data = await res.json() as { address: string };
    return data.address;
  }

  /** Sign arbitrary bytes with Ed25519 */
  async signBytes(messageBase64: string): Promise<{ signature: string; publicKey: string }> {
    return this.request("/api/sign-bytes", { message: messageBase64 }) as Promise<{
      signature: string;
      publicKey: string;
    }>;
  }

  /** Sign and submit a raw Solana transaction */
  async signAndSendRawTransaction(txBase64: string): Promise<{ signature: string }> {
    return this.request("/api/sign-and-send-raw-transaction", {
      transaction: txBase64,
    }) as Promise<{ signature: string }>;
  }
}
