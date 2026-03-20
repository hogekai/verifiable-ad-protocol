#!/usr/bin/env tsx

/**
 * E2E Demo: Verifiable Ad Delivery Protocol
 *
 * Usage:
 *   npx tsx demo/e2e.ts              # localnet (default)
 *   npx tsx demo/e2e.ts --devnet     # devnet
 *
 * Prerequisites (localnet):
 *   1. solana-test-validator running
 *   2. anchor deploy --provider.cluster localnet
 *
 * Prerequisites (devnet):
 *   1. anchor deploy --provider.cluster devnet
 */

import {
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  Connection,
  Ed25519Program,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import BN from "bn.js";
import { createHash } from "crypto";
import IDL from "../packages/ad-mcp/src/idl/verifiable_ad_protocol.json" with { type: "json" };
import { PROGRAM_ID, BITS_PER_BITMAP } from "@verifiable-ad-protocol/core";

// ── Config ────────────────────────────────────────────────────

const isDevnet = process.argv.includes("--devnet");
const RPC_URL = isDevnet
  ? "https://api.devnet.solana.com"
  : "http://localhost:8899";
const AIRDROP_AMOUNT = isDevnet ? 2 * LAMPORTS_PER_SOL : 10 * LAMPORTS_PER_SOL;

// ── Helpers ───────────────────────────────────────────────────

function log(step: string, msg: string) {
  console.log(`\n  [${step}] ${msg}`);
}

function ok(msg: string) {
  console.log(`    ok: ${msg}`);
}

function buildCanonicalMessage(
  adId: PublicKey,
  screenerKey: PublicKey,
  curatorKey: PublicKey,
  agentKey: PublicKey,
  nonce: BN,
  contextHash: Buffer,
  timestamp: BN,
): Buffer {
  return Buffer.concat([
    adId.toBuffer(),
    screenerKey.toBuffer(),
    curatorKey.toBuffer(),
    agentKey.toBuffer(),
    nonce.toArrayLike(Buffer, "le", 8),
    contextHash,
    timestamp.toArrayLike(Buffer, "le", 8),
  ]);
}

function createEd25519Ix(secretKey: Uint8Array, message: Buffer) {
  const messageHash = createHash("sha256").update(message).digest();
  return Ed25519Program.createInstructionWithPrivateKey({
    privateKey: secretKey,
    message: Uint8Array.from(messageHash),
  });
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log("\n  === Verifiable Ad Delivery Protocol — E2E Demo ===");
  console.log(`  Cluster: ${isDevnet ? "devnet" : "localnet"} (${RPC_URL})\n`);

  const connection = new Connection(RPC_URL, "confirmed");
  const programId = PROGRAM_ID;

  // Step 1: Generate keypairs
  log("1", "Generating keypairs...");
  const authority = Keypair.generate();
  const advertiser = Keypair.generate();
  const screener = Keypair.generate();
  const curator = Keypair.generate();
  const agent = Keypair.generate();
  ok("5 keypairs generated");

  // Step 2: Airdrop
  log("2", "Funding keypairs...");
  for (const kp of [authority, advertiser, screener, curator, agent]) {
    const sig = await connection.requestAirdrop(kp.publicKey, AIRDROP_AMOUNT);
    await connection.confirmTransaction(sig, "confirmed");
  }
  ok(`All funded (${AIRDROP_AMOUNT / LAMPORTS_PER_SOL} SOL each)`);

  // Anchor program setup
  const wallet = {
    publicKey: authority.publicKey,
    signTransaction: async (tx: any) => { tx.sign(authority); return tx; },
    signAllTransactions: async (txs: any[]) => { txs.forEach(tx => tx.sign(authority)); return txs; },
  };
  const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
  const idlWithAddr = { ...IDL, address: programId.toBase58() };
  const program = new Program(idlWithAddr as any, provider);

  // PDA helpers
  const findPda = (seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, programId);
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

  // Step 3: Initialize ProtocolConfig
  log("3", "Initializing ProtocolConfig...");
  await (program.methods as any)
    .initializeConfig(50, authority.publicKey)
    .accounts({
      authority: authority.publicKey,
      protocolConfig: configPda,
      systemProgram: SystemProgram.programId,
    })
    .signers([authority])
    .rpc();
  ok("Protocol fee: 0.5%, Treasury: authority");

  // Step 4: Advertiser deposit + register ad
  log("4", "Advertiser: deposit + register ad...");
  await (program.methods as any)
    .depositFunds(new BN(LAMPORTS_PER_SOL))
    .accounts({
      advertiser: advertiser.publicKey,
      depositAccount: depositPda,
      systemProgram: SystemProgram.programId,
    })
    .signers([advertiser])
    .rpc();
  ok("Deposited 1 SOL");

  await (program.methods as any)
    .registerAd(adIndex, new BN(LAMPORTS_PER_SOL / 2), new BN(10_000_000), 2000, [screener.publicKey], [])
    .accounts({
      advertiser: advertiser.publicKey,
      adAccount: adPda,
      systemProgram: SystemProgram.programId,
    })
    .signers([advertiser])
    .rpc();
  ok(`Ad registered (budget: 0.5 SOL, max_cpm: 0.01 SOL, PDA: ${adPda.toBase58().slice(0, 12)}...)`);

  // Step 5: Register Screener
  log("5", "Registering Screener...");
  await (program.methods as any)
    .registerScreener(1500, [curator.publicKey])
    .accounts({
      screener: screener.publicKey,
      screenerAccount: screenerPda,
      systemProgram: SystemProgram.programId,
    })
    .signers([screener])
    .rpc();
  ok("Screener registered (share: 15%, endorses curator)");

  // Step 6: Register Curator
  log("6", "Registering Curator...");
  await (program.methods as any)
    .registerCurator("https://example.com/meta.json", 100)
    .accounts({
      curator: curator.publicKey,
      curatorAccount: curatorPda,
      systemProgram: SystemProgram.programId,
    })
    .signers([curator])
    .rpc();
  ok("Curator registered (rate limit: 100/window)");

  // Step 7: Initialize bitmap
  log("7", "Initializing bitmap (chunk 0)...");
  const chunkIndex = 0;
  const chunkBytes = Buffer.alloc(2);
  chunkBytes.writeUInt16LE(chunkIndex);
  const [bitmapPda] = findPda([Buffer.from("bitmap"), adPda.toBuffer(), chunkBytes]);

  await (program.methods as any)
    .initializeBitmap(chunkIndex)
    .accounts({
      adAccount: adPda,
      impressionBitmap: bitmapPda,
      payer: agent.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([agent])
    .rpc();
  ok("Bitmap initialized");

  // Step 8: Build + submit record_impression
  log("8", "Recording impression (3-party signature verification)...");

  const nonce = new BN(0);
  const contextHash = createHash("sha256").update("IAB15").digest();
  const timestamp = new BN(Math.floor(Date.now() / 1000));

  const message = buildCanonicalMessage(
    adPda, screener.publicKey, curator.publicKey, agent.publicKey,
    nonce, contextHash, timestamp,
  );

  // Get balances before
  const screenerBalBefore = await connection.getBalance(screener.publicKey);
  const curatorBalBefore = await connection.getBalance(curator.publicKey);
  const authorityBalBefore = await connection.getBalance(authority.publicKey);
  const depositBalBefore = await connection.getBalance(depositPda);

  // Build Ed25519 verify instructions + record_impression
  const ix0 = createEd25519Ix(screener.secretKey, message);
  const ix1 = createEd25519Ix(curator.secretKey, message);
  const ix2 = createEd25519Ix(agent.secretKey, message);

  const ix3 = await (program.methods as any)
    .recordImpression(nonce, Array.from(contextHash), timestamp, chunkIndex, agent.publicKey)
    .accounts({
      adAccount: adPda,
      screenerAccount: screenerPda,
      curatorAccount: curatorPda,
      impressionBitmap: bitmapPda,
      depositAccount: depositPda,
      protocolConfig: configPda,
      screenerWallet: screener.publicKey,
      curatorWallet: curator.publicKey,
      protocolTreasury: authority.publicKey,
      instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      payer: agent.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const tx = new Transaction().add(ix0, ix1, ix2, ix3);
  const txSig = await sendAndConfirmTransaction(connection, tx, [agent]);
  ok(`Transaction: ${txSig}`);

  // Step 9: Verify on-chain state
  log("9", "Verifying on-chain state...");

  const ad = await (program.account as any).adAccount.fetch(adPda);
  const perImpression = 10_000; // max_cpm / 1000
  const protocolFee = 50;       // 10_000 * 50 / 10000
  const afterFee = 9_950;
  const screenerReward = 1_492; // 9_950 * 1500 / 10000
  const curatorReward = 8_458;  // 9_950 - 1_492
  const submissionFee = 5_000;

  // Ad state
  if (ad.totalImpressions.toNumber() !== 1) throw new Error("totalImpressions should be 1");
  ok(`totalImpressions: ${ad.totalImpressions.toNumber()}`);

  if (ad.spentLamports.toNumber() !== perImpression) throw new Error("spentLamports mismatch");
  ok(`spentLamports: ${ad.spentLamports.toNumber()}`);

  // Reward distribution
  const screenerBalAfter = await connection.getBalance(screener.publicKey);
  const curatorBalAfter = await connection.getBalance(curator.publicKey);
  const authorityBalAfter = await connection.getBalance(authority.publicKey);
  const depositBalAfter = await connection.getBalance(depositPda);

  if (screenerBalAfter - screenerBalBefore !== screenerReward) throw new Error("screener reward mismatch");
  ok(`Screener reward: ${screenerReward} lamports`);

  if (curatorBalAfter - curatorBalBefore !== curatorReward) throw new Error("curator reward mismatch");
  ok(`Curator reward: ${curatorReward} lamports`);

  if (authorityBalAfter - authorityBalBefore !== protocolFee) throw new Error("protocol fee mismatch");
  ok(`Protocol fee: ${protocolFee} lamports`);

  if (depositBalBefore - depositBalAfter !== perImpression + submissionFee) throw new Error("deposit deduction mismatch");
  ok(`Deposit deduction: ${perImpression + submissionFee} lamports (impression + submission fee)`);

  // Screener + Curator counters
  const screenerAcc = await (program.account as any).screenerAccount.fetch(screenerPda);
  if (screenerAcc.totalScreened.toNumber() !== 1) throw new Error("screener totalScreened mismatch");
  ok(`Screener totalScreened: ${screenerAcc.totalScreened.toNumber()}`);

  const curatorAcc = await (program.account as any).curatorAccount.fetch(curatorPda);
  if (curatorAcc.totalVerifiedImpressions.toNumber() !== 1) throw new Error("curator totalVerifiedImpressions mismatch");
  ok(`Curator totalVerifiedImpressions: ${curatorAcc.totalVerifiedImpressions.toNumber()}`);

  console.log("\n  ==========================================");
  console.log("  Phase 1 PoC — E2E Demo Complete.");
  console.log("  ==========================================\n");
}

main().catch((err) => {
  console.error("\n  Demo failed:", err.message || err);
  process.exit(1);
});
