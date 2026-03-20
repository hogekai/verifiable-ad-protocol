import {
  PublicKey,
  Transaction,
  Connection,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
} from "@solana/web3.js";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  hashImpressionMessage,
  buildEd25519VerifyInstructions,
  validateAdSlot,
  findBitmapPda,
  findScreenerPda,
  findCuratorPda,
  findDepositPda,
  findConfigPda,
  BITS_PER_BITMAP,
} from "@verifiable-ad-protocol/core";
import type { AdSlot, ImpressionMessage } from "@verifiable-ad-protocol/core";
import { IDL } from "@verifiable-ad-protocol/core";
import type { WalletProvider } from "../wallet-provider.js";
import type { RetryQueue } from "../retry-queue.js";

/**
 * Process an ad slot: sign + build tx + submit via wallet.
 *
 * All wallet communication is localhost HTTP. LLM is not involved.
 */
export async function processAd(params: {
  slot: AdSlot;
  wallet: WalletProvider;
  retryQueue: RetryQueue;
  programId: PublicKey;
  solanaRpc: string;
}): Promise<{ success: boolean; signature?: string; error?: string }> {
  const { slot, wallet, retryQueue, programId, solanaRpc } = params;

  // 1. Validate
  if (!validateAdSlot(slot)) {
    return { success: false, error: "Invalid ad slot" };
  }

  try {
    // 2. Get agent pubkey from wallet
    const agentAddress = await wallet.getAddress();
    const agentPubkey = new PublicKey(agentAddress);

    // 3. Build canonical message hash
    const msg: ImpressionMessage = {
      ad_id: new PublicKey(slot.ad_id),
      screener: new PublicKey(slot.screener_pubkey),
      curator: new PublicKey(slot.curator_pubkey),
      agent: agentPubkey,
      impression_nonce: BigInt(slot.impression_nonce),
      context_hash: Buffer.from(slot.context_hash, "hex"),
      timestamp: BigInt(slot.timestamp),
    };
    const messageHash = hashImpressionMessage(msg);

    // 4. Sign via wallet (localhost HTTP, not through LLM)
    const { signature: agentSigBase64 } = await wallet.signBytes(
      messageHash.toString("base64"),
    );
    const agentSignature = Buffer.from(agentSigBase64, "base64");

    // 5. Build Ed25519 verify instructions
    const ed25519Ixs = buildEd25519VerifyInstructions({
      slot,
      agentPubkey,
      agentSignature,
      programId,
    });

    // 6. Derive PDAs (reuse core helpers)
    const adAccountPubkey = new PublicKey(slot.ad_id);
    const advertiserPubkey = new PublicKey(slot.advertiser);
    const screenerPubkey = new PublicKey(slot.screener_pubkey);
    const curatorPubkey = new PublicKey(slot.curator_pubkey);
    const chunkIndex = Math.floor(slot.impression_nonce / Number(BITS_PER_BITMAP));

    const [screenerPda] = findScreenerPda(screenerPubkey, programId);
    const [curatorPda] = findCuratorPda(curatorPubkey, programId);
    const [bitmapPda] = findBitmapPda(adAccountPubkey, slot.impression_nonce, programId);
    const [depositPda] = findDepositPda(advertiserPubkey, programId);
    const [configPda] = findConfigPda(programId);

    // 6.5 Read-only Anchor provider (signing is done by wallet provider)
    const connection = new Connection(solanaRpc);
    const dummyWallet = {
      publicKey: agentPubkey,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any[]) => txs,
    };
    const idlWithAddr = { ...IDL, address: programId.toBase58() };
    const provider = new AnchorProvider(connection, dummyWallet as any, {
      commitment: "confirmed",
    });
    const program = new Program(idlWithAddr as any, provider);

    // 7. Bitmap initialization check (separate tx if needed)
    const bitmapAccountInfo = await connection.getAccountInfo(bitmapPda);
    if (!bitmapAccountInfo) {
      const initBitmapIx = await (program.methods as any)
        .initializeBitmap(chunkIndex)
        .accounts({
          adAccount: adAccountPubkey,
          impressionBitmap: bitmapPda,
          payer: agentPubkey,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const initTx = new Transaction();
      initTx.add(initBitmapIx);
      initTx.feePayer = agentPubkey;
      initTx.recentBlockhash = PublicKey.default.toBase58();

      const initTxBase64 = initTx
        .serialize({ requireAllSignatures: false, verifySignatures: false })
        .toString("base64");
      await wallet.signAndSendRawTransaction(initTxBase64);
    }

    // 8. Fetch treasury from on-chain ProtocolConfig
    const configAccount = await (program.account as any).protocolConfig.fetch(configPda);
    const treasury = configAccount.treasury as PublicKey;

    // 9. Build record_impression instruction
    const recordIx = await (program.methods as any)
      .recordImpression(
        new BN(slot.impression_nonce),
        Array.from(Buffer.from(slot.context_hash, "hex")),
        new BN(slot.timestamp),
        chunkIndex,
        agentPubkey,
      )
      .accounts({
        adAccount: adAccountPubkey,
        screenerAccount: screenerPda,
        curatorAccount: curatorPda,
        impressionBitmap: bitmapPda,
        depositAccount: depositPda,
        protocolConfig: configPda,
        screenerWallet: screenerPubkey,
        curatorWallet: curatorPubkey,
        protocolTreasury: treasury,
        instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        payer: agentPubkey,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    // 10. Assemble full transaction
    const tx = new Transaction();
    for (const ix of ed25519Ixs) tx.add(ix);
    tx.add(recordIx);
    tx.feePayer = agentPubkey;
    // Dummy blockhash — wallet provider overwrites with fresh one
    tx.recentBlockhash = PublicKey.default.toBase58();

    // 11. Serialize and submit via wallet
    const txBase64 = tx
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString("base64");
    const { signature: txSig } = await wallet.signAndSendRawTransaction(txBase64);

    return { success: true, signature: txSig };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);

    // TODO: Add to retry queue when retry logic is implemented
    // retryQueue.add(txBase64, slot.ad_id, slot.impression_nonce);

    return { success: false, error: errMsg };
  }
}
