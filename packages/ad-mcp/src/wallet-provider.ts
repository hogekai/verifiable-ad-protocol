import {
  Keypair,
  Connection,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import nacl from "tweetnacl";

/** Wallet provider interface — vaulx or any compatible wallet */
export interface WalletProvider {
  getAddress(): Promise<string>;
  signBytes(
    messageBase64: string,
  ): Promise<{ signature: string; publicKey: string }>;
  signAndSendRawTransaction(
    txBase64: string,
  ): Promise<{ signature: string }>;
}

/** HTTP wallet provider — vaulx or any wallet with compatible HTTP API */
export class HttpWalletProvider implements WalletProvider {
  constructor(
    private endpoint: string,
    private authToken: string,
  ) {}

  private async request(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${this.endpoint}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.authHeaders(),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Wallet ${path} failed (${res.status}): ${text}`);
    }
    return res.json();
  }

  private authHeaders(): Record<string, string> {
    return this.authToken
      ? { Authorization: `Bearer ${this.authToken}` }
      : {};
  }

  async getAddress(): Promise<string> {
    const res = await fetch(`${this.endpoint}/address`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) throw new Error(`Wallet /address failed: ${res.status}`);
    const data = (await res.json()) as { address: string };
    return data.address;
  }

  async signBytes(
    messageBase64: string,
  ): Promise<{ signature: string; publicKey: string }> {
    return this.request("/api/sign-bytes", {
      message: messageBase64,
    }) as Promise<{ signature: string; publicKey: string }>;
  }

  async signAndSendRawTransaction(
    txBase64: string,
  ): Promise<{ signature: string }> {
    return this.request("/api/sign-and-send-raw-transaction", {
      transaction: txBase64,
    }) as Promise<{ signature: string }>;
  }
}

/** Local keypair provider — direct signing without external wallet */
export class LocalKeypairProvider implements WalletProvider {
  private keypair: Keypair;
  private connection: Connection;

  constructor(secretKey: Uint8Array, rpcUrl: string) {
    this.keypair = Keypair.fromSecretKey(secretKey);
    this.connection = new Connection(rpcUrl, "confirmed");
  }

  async getAddress(): Promise<string> {
    return this.keypair.publicKey.toBase58();
  }

  async signBytes(
    messageBase64: string,
  ): Promise<{ signature: string; publicKey: string }> {
    const message = Buffer.from(messageBase64, "base64");
    const signature = nacl.sign.detached(message, this.keypair.secretKey);
    return {
      signature: Buffer.from(signature).toString("base64"),
      publicKey: this.keypair.publicKey.toBase58(),
    };
  }

  async signAndSendRawTransaction(
    txBase64: string,
  ): Promise<{ signature: string }> {
    const txBytes = Buffer.from(txBase64, "base64");
    const tx = Transaction.from(txBytes);

    if (!tx.feePayer) tx.feePayer = this.keypair.publicKey;
    if (!tx.recentBlockhash) {
      const { blockhash } = await this.connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
    }

    const sig = await sendAndConfirmTransaction(
      this.connection,
      tx,
      [this.keypair],
      { commitment: "confirmed" },
    );
    return { signature: sig };
  }
}
