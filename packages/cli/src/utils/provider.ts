import { Connection, Keypair } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import IDL from "../idl/verifiable_ad_protocol.json" with { type: "json" };
import { PROGRAM_ID } from "@verifiable-ad-protocol/core";
import { loadKeypairFromFile } from "./keypair.js";

export function createProvider(
  rpcUrl: string,
  keypairPath: string,
): { provider: AnchorProvider; keypair: Keypair } {
  const keypair = loadKeypairFromFile(keypairPath);
  const connection = new Connection(rpcUrl, "confirmed");
  const wallet = {
    publicKey: keypair.publicKey,
    signTransaction: async (tx: any) => {
      tx.sign(keypair);
      return tx;
    },
    signAllTransactions: async (txs: any[]) => {
      txs.forEach((tx) => tx.sign(keypair));
      return txs;
    },
  };
  const provider = new AnchorProvider(connection, wallet as any, {
    commitment: "confirmed",
  });
  return { provider, keypair };
}

export function createProgram(
  provider: AnchorProvider,
  programId?: string,
) {
  const pid = programId ?? PROGRAM_ID.toBase58();
  const idlWithAddr = { ...IDL, address: pid };
  return new Program(idlWithAddr as any, provider);
}
