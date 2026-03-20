import type { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { findConfigPda, findScreenerPda, findCuratorPda, findDepositPda } from "@verifiable-ad-protocol/core";
import { createProvider, createProgram } from "../utils/provider.js";
import { display } from "../utils/display.js";

export function registerInspectCommands(parent: Command) {
  const cmd = parent.command("inspect").description("Inspect on-chain accounts");

  cmd
    .command("ad <pubkey>")
    .description("Show AdAccount details")
    .action(async (pubkey: string) => {
      const root = cmd.parent!.opts();
      const { provider } = createProvider(root.rpc, root.keypair);
      const program = createProgram(provider, root.programId);
      const ad = await (program.account as any).adAccount.fetch(new PublicKey(pubkey));

      display(root.json, {
        advertiser: ad.advertiser.toBase58(),
        ad_index: ad.adIndex.toNumber(),
        budget_lamports: ad.budgetLamports.toNumber(),
        spent_lamports: ad.spentLamports.toNumber(),
        max_cpm_lamports: ad.maxCpmLamports.toNumber(),
        max_screener_share_bps: ad.maxScreenerShareBps,
        is_active: ad.isActive,
        total_impressions: ad.totalImpressions.toNumber(),
        impressions_last_hour: ad.impressionsLastHour,
        max_impressions_per_hour: ad.maxImpressionsPerHour,
        authorized_screeners: ad.authorizedScreeners.map((s: PublicKey) => s.toBase58()),
        excluded_curators: ad.excludedCurators.map((c: PublicKey) => c.toBase58()),
      });
    });

  cmd
    .command("config")
    .description("Show ProtocolConfig")
    .action(async () => {
      const root = cmd.parent!.opts();
      const { provider } = createProvider(root.rpc, root.keypair);
      const program = createProgram(provider, root.programId);
      const [configPda] = findConfigPda(program.programId);
      const config = await (program.account as any).protocolConfig.fetch(configPda);

      display(root.json, {
        authority: config.authority.toBase58(),
        protocol_fee_bps: config.protocolFeeBps,
        treasury: config.treasury.toBase58(),
      });
    });

  cmd
    .command("screener <pubkey>")
    .description("Show ScreenerAccount details")
    .action(async (pubkey: string) => {
      const root = cmd.parent!.opts();
      const { provider } = createProvider(root.rpc, root.keypair);
      const program = createProgram(provider, root.programId);
      const [pda] = findScreenerPda(new PublicKey(pubkey), program.programId);
      const acc = await (program.account as any).screenerAccount.fetch(pda);

      display(root.json, {
        screener: acc.screener.toBase58(),
        declared_share_bps: acc.declaredShareBps,
        endorsed_curators: acc.endorsedCurators.map((c: PublicKey) => c.toBase58()),
        is_active: acc.isActive,
        total_screened: acc.totalScreened.toNumber(),
      });
    });

  cmd
    .command("curator <pubkey>")
    .description("Show CuratorAccount details")
    .action(async (pubkey: string) => {
      const root = cmd.parent!.opts();
      const { provider } = createProvider(root.rpc, root.keypair);
      const program = createProgram(provider, root.programId);
      const [pda] = findCuratorPda(new PublicKey(pubkey), program.programId);
      const acc = await (program.account as any).curatorAccount.fetch(pda);

      display(root.json, {
        curator: acc.curator.toBase58(),
        metadata_uri: acc.metadataUri,
        total_verified_impressions: acc.totalVerifiedImpressions.toNumber(),
        rate_limit_max_per_window: acc.rateLimitMaxPerWindow,
      });
    });

  cmd
    .command("deposit <pubkey>")
    .description("Show deposit balance for advertiser")
    .action(async (pubkey: string) => {
      const root = cmd.parent!.opts();
      const { provider } = createProvider(root.rpc, root.keypair);
      const program = createProgram(provider, root.programId);
      const [pda] = findDepositPda(new PublicKey(pubkey), program.programId);
      const balance = await provider.connection.getBalance(pda);

      display(root.json, {
        advertiser: pubkey,
        deposit_pda: pda.toBase58(),
        balance_lamports: balance,
      });
    });
}
