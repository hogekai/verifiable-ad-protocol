import type { Command } from "commander";
import { SystemProgram } from "@solana/web3.js";
import { findCuratorPda } from "@verifiable-ad-protocol/core";
import { createProvider, createProgram } from "../utils/provider.js";
import { display } from "../utils/display.js";

export function registerCuratorCommands(parent: Command) {
  const cmd = parent.command("curator").description("Curator operations");

  cmd
    .command("register")
    .description("Register as a curator")
    .requiredOption("--metadata-uri <uri>", "Metadata URI")
    .option("--rate-limit <n>", "Max impressions per rate limit window", "100")
    .action(async (opts) => {
      const root = cmd.parent!.opts();
      const { provider, keypair } = createProvider(root.rpc, root.keypair);
      const program = createProgram(provider, root.programId);
      const [curatorPda] = findCuratorPda(keypair.publicKey, program.programId);

      const sig = await (program.methods as any)
        .registerCurator(opts.metadataUri, parseInt(opts.rateLimit))
        .accounts({
          curator: keypair.publicKey,
          curatorAccount: curatorPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([keypair])
        .rpc();

      display(root.json, {
        message: "Curator registered",
        curator_pda: curatorPda.toBase58(),
        signature: sig,
      });
    });
}
