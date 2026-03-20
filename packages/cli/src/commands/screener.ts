import type { Command } from "commander";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { findScreenerPda } from "@verifiable-ad-protocol/core";
import { createProvider, createProgram } from "../utils/provider.js";
import { display } from "../utils/display.js";

export function registerScreenerCommands(parent: Command) {
  const cmd = parent.command("screener").description("Screener operations");

  cmd
    .command("register")
    .description("Register as a screener")
    .requiredOption("--share-bps <n>", "Declared share in basis points")
    .option("--endorsed-curators <pubkeys>", "Comma-separated curator pubkeys", "")
    .action(async (opts) => {
      const root = cmd.parent!.opts();
      const { provider, keypair } = createProvider(root.rpc, root.keypair);
      const program = createProgram(provider, root.programId);
      const [screenerPda] = findScreenerPda(keypair.publicKey, program.programId);

      const curators = opts.endorsedCurators
        ? opts.endorsedCurators.split(",").filter(Boolean).map((s: string) => new PublicKey(s.trim()))
        : [];

      const sig = await (program.methods as any)
        .registerScreener(parseInt(opts.shareBps), curators)
        .accounts({
          screener: keypair.publicKey,
          screenerAccount: screenerPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([keypair])
        .rpc();

      display(root.json, {
        message: "Screener registered",
        screener_pda: screenerPda.toBase58(),
        signature: sig,
      });
    });

  cmd
    .command("sync-ads")
    .description("Sync ads from on-chain to local DB")
    .requiredOption("--db-path <path>", "SQLite DB path")
    .action(async (opts) => {
      const root = cmd.parent!.opts();
      const { provider, keypair } = createProvider(root.rpc, root.keypair);
      const program = createProgram(provider, root.programId);

      const { fetchAllAds } = await import("@verifiable-ad-protocol/screener");
      const { ScreenerDb } = await import("@verifiable-ad-protocol/screener");

      const ads = await fetchAllAds(root.rpc, program.programId);
      const db = new ScreenerDb(opts.dbPath);

      for (const ad of ads) {
        db.upsertAd({
          ad_id: ad.publicKey.toBase58(),
          advertiser: ad.advertiser.toBase58(),
          ad_index: ad.adIndex,
          max_cpm_lamports: ad.maxCpmLamports,
          max_screener_share_bps: ad.maxScreenerShareBps,
          content: { type: "text", title: `Ad #${ad.adIndex}` },
          context_categories: ["general"],
          is_active: ad.isActive,
        });
      }

      db.close();
      display(root.json, { message: `Synced ${ads.length} ads`, db_path: opts.dbPath });
    });
}
