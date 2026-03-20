import type { Command } from "commander";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { findConfigPda } from "@verifiable-ad-protocol/core";
import { createProvider, createProgram } from "../utils/provider.js";
import { display } from "../utils/display.js";

export function registerConfigCommands(parent: Command) {
  const cmd = parent.command("config").description("Protocol config operations");

  cmd
    .command("init")
    .description("Initialize protocol config")
    .requiredOption("--fee-bps <n>", "Protocol fee in basis points")
    .requiredOption("--treasury <pubkey>", "Treasury pubkey")
    .action(async (opts) => {
      const root = cmd.parent!.opts();
      const { provider, keypair } = createProvider(root.rpc, root.keypair);
      const program = createProgram(provider, root.programId);
      const [configPda] = findConfigPda(program.programId);

      const sig = await (program.methods as any)
        .initializeConfig(parseInt(opts.feeBps), new PublicKey(opts.treasury))
        .accounts({
          authority: keypair.publicKey,
          protocolConfig: configPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([keypair])
        .rpc();

      display(root.json, { message: "Protocol config initialized", signature: sig });
    });

  cmd
    .command("show")
    .description("Show protocol config")
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
}
