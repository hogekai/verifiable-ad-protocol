import { Connection, PublicKey } from "@solana/web3.js";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { IDL } from "@verifiable-ad-protocol/core";

export interface OnChainAd {
  publicKey: PublicKey;
  advertiser: PublicKey;
  adIndex: number;
  budgetLamports: number;
  spentLamports: number;
  maxCpmLamports: number;
  maxScreenerShareBps: number;
  authorizedScreeners: PublicKey[];
  excludedCurators: PublicKey[];
  isActive: boolean;
  totalImpressions: number;
}

/**
 * Fetch all active ads from on-chain program.
 */
export async function fetchAllAds(
  rpcUrl: string,
  programId: PublicKey,
): Promise<OnChainAd[]> {
  const connection = new Connection(rpcUrl);
  const dummyWallet = {
    publicKey: PublicKey.default,
    signTransaction: async (tx: any) => tx,
    signAllTransactions: async (txs: any[]) => txs,
  };
  const idlWithAddr = { ...IDL, address: programId.toBase58() };
  const provider = new AnchorProvider(connection, dummyWallet as any, {
    commitment: "confirmed",
  });
  const program = new Program(idlWithAddr as any, provider);

  const accounts = await (program.account as any).adAccount.all();

  return accounts
    .map((acc: any) => ({
      publicKey: acc.publicKey,
      advertiser: acc.account.advertiser,
      adIndex: acc.account.adIndex.toNumber(),
      budgetLamports: acc.account.budgetLamports.toNumber(),
      spentLamports: acc.account.spentLamports.toNumber(),
      maxCpmLamports: acc.account.maxCpmLamports.toNumber(),
      maxScreenerShareBps: acc.account.maxScreenerShareBps,
      authorizedScreeners: acc.account.authorizedScreeners,
      excludedCurators: acc.account.excludedCurators,
      isActive: acc.account.isActive,
      totalImpressions: acc.account.totalImpressions.toNumber(),
    }))
    .filter(
      (ad: OnChainAd) =>
        ad.isActive && ad.budgetLamports > ad.spentLamports,
    );
}
