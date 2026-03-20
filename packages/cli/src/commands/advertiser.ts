import type { Command } from "commander";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import BN from "bn.js";
import { findDepositPda, findAdPda } from "@verifiable-ad-protocol/core";
import { createProvider, createProgram } from "../utils/provider.js";
import { display } from "../utils/display.js";

export function registerAdvertiserCommands(parent: Command) {
  const cmd = parent.command("advertiser").description("Advertiser operations");

  cmd
    .command("deposit")
    .description("Deposit SOL to advertiser pool")
    .requiredOption("--amount <sol>", "Amount in SOL (e.g. 1, 0.5)")
    .action(async (opts) => {
      const root = cmd.parent!.opts();
      const { provider, keypair } = createProvider(root.rpc, root.keypair);
      const program = createProgram(provider, root.programId);
      const [depositPda] = findDepositPda(keypair.publicKey, program.programId);

      const lamports = Math.round(parseFloat(opts.amount) * LAMPORTS_PER_SOL);
      const sig = await (program.methods as any)
        .depositFunds(new BN(lamports))
        .accounts({
          advertiser: keypair.publicKey,
          depositAccount: depositPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([keypair])
        .rpc();

      display(root.json, {
        message: `Deposited ${opts.amount} SOL`,
        deposit_pda: depositPda.toBase58(),
        signature: sig,
      });
    });

  cmd
    .command("register-ad")
    .description("Register a new ad")
    .requiredOption("--index <n>", "Ad index")
    .requiredOption("--budget <sol>", "Budget in SOL (e.g. 0.5)")
    .requiredOption("--max-cpm <sol>", "Max CPM in SOL per 1000 impressions (e.g. 0.01)")
    .requiredOption("--max-screener-share <bps>", "Max screener share in bps")
    .requiredOption("--screeners <pubkeys>", "Comma-separated screener pubkeys")
    .option("--excluded-curators <pubkeys>", "Comma-separated excluded curator pubkeys", "")
    .action(async (opts) => {
      const root = cmd.parent!.opts();
      const { provider, keypair } = createProvider(root.rpc, root.keypair);
      const program = createProgram(provider, root.programId);

      const adIndex = parseInt(opts.index);
      const [adPda] = findAdPda(keypair.publicKey, adIndex, program.programId);
      const screeners = opts.screeners.split(",").map((s: string) => new PublicKey(s.trim()));
      const excluded = opts.excludedCurators
        ? opts.excludedCurators.split(",").filter(Boolean).map((s: string) => new PublicKey(s.trim()))
        : [];

      const sig = await (program.methods as any)
        .registerAd(
          new BN(adIndex),
          new BN(Math.round(parseFloat(opts.budget) * LAMPORTS_PER_SOL)),
          new BN(Math.round(parseFloat(opts.maxCpm) * LAMPORTS_PER_SOL)),
          parseInt(opts.maxScreenerShare),
          screeners,
          excluded,
        )
        .accounts({
          advertiser: keypair.publicKey,
          adAccount: adPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([keypair])
        .rpc();

      display(root.json, {
        message: "Ad registered",
        ad_pda: adPda.toBase58(),
        ad_index: adIndex,
        signature: sig,
      });
    });

  cmd
    .command("list-ads")
    .description("List all ads for this advertiser")
    .action(async () => {
      const root = cmd.parent!.opts();
      const { provider, keypair } = createProvider(root.rpc, root.keypair);
      const program = createProgram(provider, root.programId);

      const accounts = await (program.account as any).adAccount.all([
        { memcmp: { offset: 8, bytes: keypair.publicKey.toBase58() } },
      ]);

      display(root.json, {
        count: accounts.length,
        ads: accounts.map((a: any) => ({
          pda: a.publicKey.toBase58(),
          index: a.account.adIndex.toNumber(),
          budget: a.account.budgetLamports.toNumber(),
          spent: a.account.spentLamports.toNumber(),
          impressions: a.account.totalImpressions.toNumber(),
          active: a.account.isActive,
        })),
      });
    });
}
