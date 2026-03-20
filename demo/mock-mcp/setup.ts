#!/usr/bin/env tsx

/**
 * Setup script: registers on-chain state for mock-mcp demo on localnet.
 *
 * Creates: ProtocolConfig, Advertiser deposit, Ad, Screener, Curator, Bitmap
 * Saves keypairs to demo/mock-mcp/.state.json for use by mock MCP server.
 *
 * Prerequisites:
 *   1. solana-test-validator running
 *   2. Program deployed to localnet
 */

import {
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  Connection,
  SystemProgram,
} from "@solana/web3.js";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import BN from "bn.js";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { PROGRAM_ID, IDL } from "@verifiable-ad-protocol/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(__dirname, ".state.json");
const RPC_URL = "http://localhost:8899";

const connection = new Connection(RPC_URL, "confirmed");
const programId = PROGRAM_ID;

function programFor(kp: Keypair): Program {
  const w = {
    publicKey: kp.publicKey,
    signTransaction: async (tx: any) => { tx.sign(kp); return tx; },
    signAllTransactions: async (txs: any[]) => { txs.forEach(tx => tx.sign(kp)); return txs; },
  };
  const p = new AnchorProvider(connection, w as any, { commitment: "confirmed" });
  const idlWithAddr = { ...IDL, address: programId.toBase58() };
  return new Program(idlWithAddr as any, p);
}

const findPda = (seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, programId);

async function main() {
  console.log("=== Mock MCP Setup (localnet) ===\n");

  // Generate keypairs
  const authority = Keypair.generate();
  const advertiser = Keypair.generate();
  const screener = Keypair.generate();
  const curator = Keypair.generate();
  const treasury = Keypair.generate();

  // Fund all
  for (const kp of [authority, advertiser, screener, curator, treasury]) {
    const sig = await connection.requestAirdrop(kp.publicKey, 10 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
  }
  console.log("  Funded 5 keypairs");

  // PDAs
  const [configPda] = findPda([Buffer.from("config")]);
  const [depositPda] = findPda([Buffer.from("deposit"), advertiser.publicKey.toBuffer()]);
  const adIndex = new BN(0);
  const [adPda] = findPda([
    Buffer.from("ad"),
    advertiser.publicKey.toBuffer(),
    adIndex.toArrayLike(Buffer, "le", 8),
  ]);
  const [screenerPda] = findPda([Buffer.from("screener"), screener.publicKey.toBuffer()]);
  const [curatorPda] = findPda([Buffer.from("curator"), curator.publicKey.toBuffer()]);

  // Initialize ProtocolConfig (skip if exists)
  const configInfo = await connection.getAccountInfo(configPda);
  if (configInfo) {
    console.log("  ProtocolConfig already exists — skipping");
  } else {
    await (programFor(authority).methods as any)
      .initializeConfig(50, treasury.publicKey)
      .accounts({
        authority: authority.publicKey,
        protocolConfig: configPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("  ProtocolConfig initialized");
  }

  // Deposit
  await (programFor(advertiser).methods as any)
    .depositFunds(new BN(5 * LAMPORTS_PER_SOL))
    .accounts({
      advertiser: advertiser.publicKey,
      depositAccount: depositPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("  Deposited 5 SOL");

  // Register ad
  await (programFor(advertiser).methods as any)
    .registerAd(
      adIndex,
      new BN(2 * LAMPORTS_PER_SOL), // budget: 2 SOL
      new BN(10_000_000),           // max_cpm: 0.01 SOL
      2000,                          // max_screener_share: 20%
      [screener.publicKey],          // authorized screeners
      [],                            // excluded curators
    )
    .accounts({
      advertiser: advertiser.publicKey,
      adAccount: adPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log(`  Ad registered: ${adPda.toBase58()}`);

  // Register screener
  await (programFor(screener).methods as any)
    .registerScreener(1500, [curator.publicKey])
    .accounts({
      screener: screener.publicKey,
      screenerAccount: screenerPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("  Screener registered (share: 15%)");

  // Register curator
  await (programFor(curator).methods as any)
    .registerCurator("https://mock-weather.example.com/metadata.json", 100)
    .accounts({
      curator: curator.publicKey,
      curatorAccount: curatorPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("  Curator registered");

  // Initialize bitmap
  const chunkIndex = new BN(0);
  const [bitmapPda] = findPda([
    Buffer.from("bitmap"),
    adPda.toBuffer(),
    chunkIndex.toArrayLike(Buffer, "le", 8),
  ]);
  await (programFor(advertiser).methods as any)
    .initializeBitmap(chunkIndex)
    .accounts({
      payer: advertiser.publicKey,
      adAccount: adPda,
      bitmap: bitmapPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("  Bitmap initialized");

  // Save state
  const state = {
    rpc_url: RPC_URL,
    program_id: programId.toBase58(),
    ad_id: adPda.toBase58(),
    advertiser: advertiser.publicKey.toBase58(),
    screener_pubkey: screener.publicKey.toBase58(),
    screener_secret_key: Buffer.from(screener.secretKey).toString("base64"),
    curator_pubkey: curator.publicKey.toBase58(),
    curator_secret_key: Buffer.from(curator.secretKey).toString("base64"),
    ad_content: {
      type: "text" as const,
      title: "Try WeatherMCP Pro!",
      body: "Get hyper-local forecasts, air quality alerts, and severe weather warnings. Trusted by 50,000+ developers.",
      cta_url: "https://weathermcp.example.com/pro",
      cta_text: "Start Free Trial",
    },
    context_categories: ["IAB15", "IAB15-10"], // Technology
  };

  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  console.log(`\n  State saved to ${STATE_PATH}`);
  console.log("\n=== Setup complete ===");
}

main().catch((err) => {
  console.error("Setup failed:", err.message || err);
  process.exit(1);
});
