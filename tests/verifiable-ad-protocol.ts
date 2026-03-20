import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { VerifiableAdProtocol } from "../target/types/verifiable_ad_protocol";
import { expect } from "chai";
import {
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  Ed25519Program,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import BN from "bn.js";
import { createHash } from "crypto";

describe("verifiable-ad-protocol", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace
    .VerifiableAdProtocol as Program<VerifiableAdProtocol>;

  const authority = Keypair.generate();
  const advertiser = Keypair.generate();
  const screener = Keypair.generate();
  const curator = Keypair.generate();
  const agent = Keypair.generate();
  const treasury = Keypair.generate();

  // PDA helpers
  const findConfigPda = () =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );

  const findDepositPda = (advertiserKey: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("deposit"), advertiserKey.toBuffer()],
      program.programId
    );

  const findAdPda = (advertiserKey: PublicKey, adIndex: number) =>
    PublicKey.findProgramAddressSync(
      [
        Buffer.from("ad"),
        advertiserKey.toBuffer(),
        new BN(adIndex).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

  const findScreenerPda = (screenerKey: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("screener"), screenerKey.toBuffer()],
      program.programId
    );

  const findCuratorPda = (curatorKey: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("curator"), curatorKey.toBuffer()],
      program.programId
    );

  async function airdrop(key: PublicKey, amount = 10 * LAMPORTS_PER_SOL) {
    const sig = await provider.connection.requestAirdrop(key, amount);
    await provider.connection.confirmTransaction(sig, "confirmed");
  }

  before(async () => {
    await Promise.all([
      airdrop(authority.publicKey),
      airdrop(advertiser.publicKey),
      airdrop(screener.publicKey),
      airdrop(curator.publicKey),
      airdrop(agent.publicKey),
      airdrop(treasury.publicKey),
    ]);
  });

  // ─── 1. initialize_config ─────────────────────────────────────────────────

  describe("initialize_config", () => {
    it("initializes protocol config successfully", async () => {
      const [configPda] = findConfigPda();

      await program.methods
        .initializeConfig(50, treasury.publicKey, new BN(5_000))
        .accounts({
          authority: authority.publicKey,
          protocolConfig: configPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      const config = await program.account.protocolConfig.fetch(configPda);
      expect(config.authority.toString()).to.equal(
        authority.publicKey.toString()
      );
      expect(config.protocolFeeBps).to.equal(50);
      expect(config.treasury.toString()).to.equal(
        treasury.publicKey.toString()
      );
      expect(config.submissionFeeLamports.toNumber()).to.equal(5_000);
    });

    it("fails when called a second time (PDA already exists)", async () => {
      const [configPda] = findConfigPda();

      try {
        await program.methods
          .initializeConfig(50, treasury.publicKey, new BN(5_000))
          .accounts({
            authority: authority.publicKey,
            protocolConfig: configPda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).to.exist;
      }
    });

    it("fails with protocol_fee_bps > 10000", async () => {
      const newAuthority = Keypair.generate();
      await airdrop(newAuthority.publicKey);

      try {
        await program.methods
          .initializeConfig(10001, treasury.publicKey, new BN(5_000))
          .accounts({
            authority: newAuthority.publicKey,
            protocolConfig: findConfigPda()[0],
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([newAuthority])
          .rpc();
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err).to.exist;
      }
    });
  });

  // ─── 2. deposit_funds ─────────────────────────────────────────────────────

  describe("deposit_funds", () => {
    it("deposits 1 SOL successfully", async () => {
      const [depositPda] = findDepositPda(advertiser.publicKey);

      await program.methods
        .depositFunds(new BN(LAMPORTS_PER_SOL))
        .accounts({
          advertiser: advertiser.publicKey,
          depositAccount: depositPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([advertiser])
        .rpc();

      const balance = await provider.connection.getBalance(depositPda);
      expect(balance).to.be.greaterThan(LAMPORTS_PER_SOL);
    });

    it("deposits additional 0.5 SOL", async () => {
      const [depositPda] = findDepositPda(advertiser.publicKey);
      const balanceBefore = await provider.connection.getBalance(depositPda);

      await program.methods
        .depositFunds(new BN(LAMPORTS_PER_SOL / 2))
        .accounts({
          advertiser: advertiser.publicKey,
          depositAccount: depositPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([advertiser])
        .rpc();

      const balanceAfter = await provider.connection.getBalance(depositPda);
      expect(balanceAfter - balanceBefore).to.equal(LAMPORTS_PER_SOL / 2);
    });

    it("fails with amount_lamports = 0", async () => {
      const [depositPda] = findDepositPda(advertiser.publicKey);

      try {
        await program.methods
          .depositFunds(new BN(0))
          .accounts({
            advertiser: advertiser.publicKey,
            depositAccount: depositPda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([advertiser])
          .rpc();
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("ZeroBudget");
      }
    });
  });

  // ─── 3. register_ad ───────────────────────────────────────────────────────

  describe("register_ad", () => {
    const adIndex = 0;

    it("registers an ad successfully", async () => {
      const [adPda] = findAdPda(advertiser.publicKey, adIndex);

      await program.methods
        .registerAd(
          new BN(adIndex),
          new BN(LAMPORTS_PER_SOL / 2),
          new BN(10_000_000),
          2000,
          [screener.publicKey],
          []
        )
        .accounts({
          advertiser: advertiser.publicKey,
          adAccount: adPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([advertiser])
        .rpc();

      const ad = await program.account.adAccount.fetch(adPda);
      expect(ad.advertiser.toString()).to.equal(
        advertiser.publicKey.toString()
      );
      expect(ad.adIndex.toNumber()).to.equal(adIndex);
      expect(ad.budgetLamports.toNumber()).to.equal(LAMPORTS_PER_SOL / 2);
      expect(ad.spentLamports.toNumber()).to.equal(0);
      expect(ad.maxCpmLamports.toNumber()).to.equal(10_000_000);
      expect(ad.maxScreenerShareBps).to.equal(2000);
      expect(ad.authorizedScreeners.length).to.equal(1);
      expect(ad.authorizedScreeners[0].toString()).to.equal(
        screener.publicKey.toString()
      );
      expect(ad.excludedCurators.length).to.equal(0);
      expect(ad.isActive).to.equal(true);
      expect(ad.totalImpressions.toNumber()).to.equal(0);
      expect(ad.createdAt.toNumber()).to.be.greaterThan(0);
    });

    it("fails with budget_lamports = 0", async () => {
      const [adPda] = findAdPda(advertiser.publicKey, 1);

      try {
        await program.methods
          .registerAd(new BN(1), new BN(0), new BN(10_000_000), 2000, [], [])
          .accounts({
            advertiser: advertiser.publicKey,
            adAccount: adPda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([advertiser])
          .rpc();
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("ZeroBudget");
      }
    });

    it("fails with max_screener_share_bps > 10000", async () => {
      const [adPda] = findAdPda(advertiser.publicKey, 2);

      try {
        await program.methods
          .registerAd(
            new BN(2),
            new BN(LAMPORTS_PER_SOL),
            new BN(10_000_000),
            10001,
            [],
            []
          )
          .accounts({
            advertiser: advertiser.publicKey,
            adAccount: adPda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([advertiser])
          .rpc();
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("InvalidShareBps");
      }
    });

    it("fails with too many authorized_screeners (11)", async () => {
      const [adPda] = findAdPda(advertiser.publicKey, 3);
      const tooManyScreeners = Array.from({ length: 11 }, () =>
        Keypair.generate().publicKey
      );

      try {
        await program.methods
          .registerAd(
            new BN(3),
            new BN(LAMPORTS_PER_SOL),
            new BN(10_000_000),
            2000,
            tooManyScreeners,
            []
          )
          .accounts({
            advertiser: advertiser.publicKey,
            adAccount: adPda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([advertiser])
          .rpc();
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("TooManyScreeners");
      }
    });
  });

  // ─── 4. register_screener ─────────────────────────────────────────────────

  describe("register_screener", () => {
    it("registers a screener successfully", async () => {
      const [screenerPda] = findScreenerPda(screener.publicKey);

      await program.methods
        .registerScreener(1500, [curator.publicKey])
        .accounts({
          screener: screener.publicKey,
          screenerAccount: screenerPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([screener])
        .rpc();

      const screenerAccount =
        await program.account.screenerAccount.fetch(screenerPda);
      expect(screenerAccount.screener.toString()).to.equal(
        screener.publicKey.toString()
      );
      expect(screenerAccount.declaredShareBps).to.equal(1500);
      expect(screenerAccount.endorsedCurators.length).to.equal(1);
      expect(screenerAccount.endorsedCurators[0].toString()).to.equal(
        curator.publicKey.toString()
      );
      expect(screenerAccount.stakedAmount.toNumber()).to.equal(0);
      expect(screenerAccount.slashable).to.equal(false);
      expect(screenerAccount.isActive).to.equal(true);
      expect(screenerAccount.totalScreened.toNumber()).to.equal(0);
    });

    it("fails with declared_share_bps > 10000", async () => {
      const newScreener = Keypair.generate();
      await airdrop(newScreener.publicKey);
      const [screenerPda] = findScreenerPda(newScreener.publicKey);

      try {
        await program.methods
          .registerScreener(10001, [])
          .accounts({
            screener: newScreener.publicKey,
            screenerAccount: screenerPda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([newScreener])
          .rpc();
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("InvalidShareBps");
      }
    });

    it("fails with too many endorsed_curators (21)", async () => {
      const newScreener = Keypair.generate();
      await airdrop(newScreener.publicKey);
      const [screenerPda] = findScreenerPda(newScreener.publicKey);
      const tooManyCurators = Array.from({ length: 21 }, () =>
        Keypair.generate().publicKey
      );

      try {
        await program.methods
          .registerScreener(1500, tooManyCurators)
          .accounts({
            screener: newScreener.publicKey,
            screenerAccount: screenerPda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([newScreener])
          .rpc();
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("TooManyEndorsedCurators");
      }
    });
  });

  // ─── 5. register_curator ──────────────────────────────────────────────────

  describe("register_curator", () => {
    it("registers a curator successfully", async () => {
      const [curatorPda] = findCuratorPda(curator.publicKey);

      await program.methods
        .registerCurator("https://example.com/meta.json")
        .accounts({
          curator: curator.publicKey,
          curatorAccount: curatorPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([curator])
        .rpc();

      const curatorAccount =
        await program.account.curatorAccount.fetch(curatorPda);
      expect(curatorAccount.curator.toString()).to.equal(
        curator.publicKey.toString()
      );
      expect(curatorAccount.metadataUri).to.equal(
        "https://example.com/meta.json"
      );
      expect(curatorAccount.registeredAt.toNumber()).to.be.greaterThan(0);
      expect(curatorAccount.totalVerifiedImpressions.toNumber()).to.equal(0);
    });

    it("fails with metadata_uri > 200 characters", async () => {
      const newCurator = Keypair.generate();
      await airdrop(newCurator.publicKey);
      const [curatorPda] = findCuratorPda(newCurator.publicKey);
      const longUri = "x".repeat(201);

      try {
        await program.methods
          .registerCurator(longUri)
          .accounts({
            curator: newCurator.publicKey,
            curatorAccount: curatorPda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([newCurator])
          .rpc();
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("MetadataUriTooLong");
      }
    });
  });

  // ─── 6. update_ad ─────────────────────────────────────────────────────────

  describe("update_ad", () => {
    it("updates ad fields successfully", async () => {
      const [adPda] = findAdPda(advertiser.publicKey, 0);

      await program.methods
        .updateAd(new BN(20_000_000), 3000, [screener.publicKey], [], false)
        .accounts({
          advertiser: advertiser.publicKey,
          adAccount: adPda,
        })
        .signers([advertiser])
        .rpc();

      const ad = await program.account.adAccount.fetch(adPda);
      expect(ad.maxCpmLamports.toNumber()).to.equal(20_000_000);
      expect(ad.maxScreenerShareBps).to.equal(3000);
      expect(ad.isActive).to.equal(false);
    });

    it("re-activates the ad", async () => {
      const [adPda] = findAdPda(advertiser.publicKey, 0);

      await program.methods
        .updateAd(
          new BN(20_000_000),
          3000,
          [screener.publicKey],
          [],
          true
        )
        .accounts({
          advertiser: advertiser.publicKey,
          adAccount: adPda,
        })
        .signers([advertiser])
        .rpc();

      const ad = await program.account.adAccount.fetch(adPda);
      expect(ad.isActive).to.equal(true);
    });

    it("fails when a different keypair tries to update (Unauthorized)", async () => {
      const [adPda] = findAdPda(advertiser.publicKey, 0);
      const imposter = Keypair.generate();
      await airdrop(imposter.publicKey);

      try {
        await program.methods
          .updateAd(new BN(20_000_000), 3000, [], [], true)
          .accounts({
            advertiser: imposter.publicKey,
            adAccount: adPda,
          })
          .signers([imposter])
          .rpc();
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err).to.exist;
      }
    });
  });

  // ─── 8. update_screener ───────────────────────────────────────────────────

  describe("update_screener", () => {
    it("updates screener fields successfully", async () => {
      const [screenerPda] = findScreenerPda(screener.publicKey);

      await program.methods
        .updateScreener(2000, [])
        .accounts({
          screener: screener.publicKey,
          screenerAccount: screenerPda,
        })
        .signers([screener])
        .rpc();

      const screenerAccount =
        await program.account.screenerAccount.fetch(screenerPda);
      expect(screenerAccount.declaredShareBps).to.equal(2000);
      expect(screenerAccount.endorsedCurators.length).to.equal(0);
    });

    it("fails when a different keypair tries to update (Unauthorized)", async () => {
      const [screenerPda] = findScreenerPda(screener.publicKey);
      const imposter = Keypair.generate();
      await airdrop(imposter.publicKey);

      try {
        await program.methods
          .updateScreener(2000, [])
          .accounts({
            screener: imposter.publicKey,
            screenerAccount: screenerPda,
          })
          .signers([imposter])
          .rpc();
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err).to.exist;
      }
    });
  });

  // ─── 9. update_curator ────────────────────────────────────────────────────

  describe("update_curator", () => {
    it("updates curator metadata_uri successfully", async () => {
      const [curatorPda] = findCuratorPda(curator.publicKey);

      await program.methods
        .updateCurator("https://example.com/updated-meta.json")
        .accounts({
          curator: curator.publicKey,
          curatorAccount: curatorPda,
        })
        .signers([curator])
        .rpc();

      const curatorAccount =
        await program.account.curatorAccount.fetch(curatorPda);
      expect(curatorAccount.metadataUri).to.equal(
        "https://example.com/updated-meta.json"
      );
    });
  });

  // ─── 10. update_config ──────────────────────────────────────────────────

  describe("update_config", () => {
    it("updates config successfully", async () => {
      const [configPda] = findConfigPda();
      const newTreasury = Keypair.generate();

      await program.methods
        .updateConfig(100, newTreasury.publicKey, new BN(10_000))
        .accounts({
          authority: authority.publicKey,
          protocolConfig: configPda,
        })
        .signers([authority])
        .rpc();

      const config = await program.account.protocolConfig.fetch(configPda);
      expect(config.protocolFeeBps).to.equal(100);
      expect(config.treasury.toString()).to.equal(newTreasury.publicKey.toString());
      expect(config.submissionFeeLamports.toNumber()).to.equal(10_000);

      // Restore original values for subsequent tests
      await program.methods
        .updateConfig(50, treasury.publicKey, new BN(5_000))
        .accounts({
          authority: authority.publicKey,
          protocolConfig: configPda,
        })
        .signers([authority])
        .rpc();
    });

    it("fails when non-authority tries to update", async () => {
      const [configPda] = findConfigPda();
      const imposter = Keypair.generate();
      await airdrop(imposter.publicKey);

      try {
        await program.methods
          .updateConfig(50, treasury.publicKey, new BN(5_000))
          .accounts({
            authority: imposter.publicKey,
            protocolConfig: configPda,
          })
          .signers([imposter])
          .rpc();
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err).to.exist;
      }
    });

    it("fails with protocol_fee_bps > 10000", async () => {
      const [configPda] = findConfigPda();

      try {
        await program.methods
          .updateConfig(10001, treasury.publicKey, new BN(5_000))
          .accounts({
            authority: authority.publicKey,
            protocolConfig: configPda,
          })
          .signers([authority])
          .rpc();
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("InvalidShareBps");
      }
    });

    it("fails with submission_fee_lamports = 0", async () => {
      const [configPda] = findConfigPda();

      try {
        await program.methods
          .updateConfig(50, treasury.publicKey, new BN(0))
          .accounts({
            authority: authority.publicKey,
            protocolConfig: configPda,
          })
          .signers([authority])
          .rpc();
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal("ZeroBudget");
      }
    });
  });

  // ─── 11. record_impression (Sub-phase 2) ──────────────────────────────────

  describe("record_impression", () => {
    const BITS_PER_BITMAP = 8192;

    const findBitmapPda = (adKey: PublicKey, nonce: number) => {
      const chunkIndex = Math.floor(nonce / BITS_PER_BITMAP);
      const chunkBytes = Buffer.alloc(2);
      chunkBytes.writeUInt16LE(chunkIndex);
      return PublicKey.findProgramAddressSync(
        [Buffer.from("bitmap"), adKey.toBuffer(), chunkBytes],
        program.programId
      );
    };

    function buildCanonicalMessage(
      adId: PublicKey,
      screenerKey: PublicKey,
      curatorKey: PublicKey,
      agentKey: PublicKey,
      impressionNonce: BN,
      contextHash: Buffer,
      timestamp: BN
    ): Buffer {
      return Buffer.concat([
        adId.toBuffer(),
        screenerKey.toBuffer(),
        curatorKey.toBuffer(),
        agentKey.toBuffer(),
        impressionNonce.toArrayLike(Buffer, "le", 8),
        contextHash,
        timestamp.toArrayLike(Buffer, "le", 8),
      ]);
    }

    function createEd25519Ix(secretKey: Uint8Array, message: Buffer) {
      // Sign the SHA-256 hash of the message (matches Rust side)
      const messageHash = createHash("sha256").update(message).digest();
      return Ed25519Program.createInstructionWithPrivateKey({
        privateKey: secretKey,
        message: Uint8Array.from(messageHash),
      });
    }

    // Restore screener's endorsed_curators (cleared by update_screener test)
    // and reset ad to known state for impression tests
    before(async () => {
      const [screenerPda] = findScreenerPda(screener.publicKey);
      await program.methods
        .updateScreener(1500, [curator.publicKey])
        .accounts({
          screener: screener.publicKey,
          screenerAccount: screenerPda,
        })
        .signers([screener])
        .rpc();

      // Reset ad: max_cpm=10M, max_screener_share=2000, active, screener authorized
      const [adPda] = findAdPda(advertiser.publicKey, 0);
      await program.methods
        .updateAd(
          new BN(10_000_000),
          2000,
          [screener.publicKey],
          [],
          true
        )
        .accounts({
          advertiser: advertiser.publicKey,
          adAccount: adPda,
        })
        .signers([advertiser])
        .rpc();
    });

    it("initializes bitmap for chunk 0", async () => {
      const [adPda] = findAdPda(advertiser.publicKey, 0);
      const [bitmapPda] = findBitmapPda(adPda, 0);

      await program.methods
        .initializeBitmap(0)
        .accounts({
          adAccount: adPda,
          impressionBitmap: bitmapPda,
          payer: advertiser.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([advertiser])
        .rpc();

      const bitmap = await program.account.impressionBitmap.fetch(bitmapPda);
      expect(bitmap.adId.toString()).to.equal(adPda.toString());
      expect(bitmap.chunkIndex).to.equal(0);
    });

    it("records impression successfully with correct reward distribution", async () => {
      const [adPda] = findAdPda(advertiser.publicKey, 0);
      const [screenerPda] = findScreenerPda(screener.publicKey);
      const [curatorPda] = findCuratorPda(curator.publicKey);

      const [bitmapPda] = findBitmapPda(adPda, 0);
      const [depositPda] = findDepositPda(advertiser.publicKey);
      const [configPda] = findConfigPda();

      const nonce = new BN(0);
      const contextHash = Buffer.alloc(32, 0xab);
      const timestamp = new BN(Math.floor(Date.now() / 1000));
      const chunkIndex = 0;

      const message = buildCanonicalMessage(
        adPda, screener.publicKey, curator.publicKey, agent.publicKey,
        nonce, contextHash, timestamp
      );

      // Get balances before
      const screenerBalBefore = await provider.connection.getBalance(screener.publicKey);
      const curatorBalBefore = await provider.connection.getBalance(curator.publicKey);
      const treasuryBalBefore = await provider.connection.getBalance(treasury.publicKey);
      const depositBalBefore = await provider.connection.getBalance(depositPda);

      const ix0 = createEd25519Ix(screener.secretKey, message);
      const ix1 = createEd25519Ix(curator.secretKey, message);
      const ix2 = createEd25519Ix(agent.secretKey, message);

      const ix3 = await program.methods
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
          protocolTreasury: treasury.publicKey,
          instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          payer: (provider.wallet as any).payer.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .instruction();

      const tx = new Transaction().add(ix0, ix1, ix2, ix3);
      await sendAndConfirmTransaction(provider.connection, tx, [(provider.wallet as any).payer]);

      // Verify reward distribution
      // per_impression = 10_000_000 / 1000 = 10_000
      // protocol_fee = 10_000 * 50 / 10000 = 50
      // after_fee = 9_950
      // screener_reward = 9_950 * 1500 / 10000 = 1_492
      // curator_reward = 9_950 - 1_492 = 8_458
      const perImpression = 10_000;
      const protocolFee = 50;
      const screenerReward = 1_492;
      const curatorReward = 8_458;
      const submissionFee = 5_000;

      const screenerBalAfter = await provider.connection.getBalance(screener.publicKey);
      const curatorBalAfter = await provider.connection.getBalance(curator.publicKey);
      const treasuryBalAfter = await provider.connection.getBalance(treasury.publicKey);
      const depositBalAfter = await provider.connection.getBalance(depositPda);

      expect(screenerBalAfter - screenerBalBefore).to.equal(screenerReward);
      expect(curatorBalAfter - curatorBalBefore).to.equal(curatorReward);
      expect(treasuryBalAfter - treasuryBalBefore).to.equal(protocolFee);
      expect(depositBalBefore - depositBalAfter).to.equal(perImpression + submissionFee);

      // Verify state updates
      const ad = await program.account.adAccount.fetch(adPda);
      expect(ad.spentLamports.toNumber()).to.equal(perImpression);
      expect(ad.totalImpressions.toNumber()).to.equal(1);

      const curatorAcc = await program.account.curatorAccount.fetch(curatorPda);
      expect(curatorAcc.totalVerifiedImpressions.toNumber()).to.equal(1);

      const screenerAcc = await program.account.screenerAccount.fetch(screenerPda);
      expect(screenerAcc.totalScreened.toNumber()).to.equal(1);
    });

    it("fails with duplicate nonce", async () => {
      const [adPda] = findAdPda(advertiser.publicKey, 0);
      const [screenerPda] = findScreenerPda(screener.publicKey);
      const [curatorPda] = findCuratorPda(curator.publicKey);

      const [bitmapPda] = findBitmapPda(adPda, 0);
      const [depositPda] = findDepositPda(advertiser.publicKey);
      const [configPda] = findConfigPda();

      const nonce = new BN(0); // same as before
      const contextHash = Buffer.alloc(32, 0xab);
      const timestamp = new BN(Math.floor(Date.now() / 1000));

      const message = buildCanonicalMessage(
        adPda, screener.publicKey, curator.publicKey, agent.publicKey,
        nonce, contextHash, timestamp
      );

      const tx = new Transaction().add(
        createEd25519Ix(screener.secretKey, message),
        createEd25519Ix(curator.secretKey, message),
        createEd25519Ix(agent.secretKey, message),
        await program.methods
          .recordImpression(nonce, Array.from(contextHash), timestamp, 0, agent.publicKey)
          .accounts({
            adAccount: adPda,
            screenerAccount: screenerPda,
            curatorAccount: curatorPda,

            impressionBitmap: bitmapPda,
            depositAccount: depositPda,
            protocolConfig: configPda,
            screenerWallet: screener.publicKey,
            curatorWallet: curator.publicKey,
            protocolTreasury: treasury.publicKey,
            instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .instruction()
      );

      try {
        await sendAndConfirmTransaction(provider.connection, tx, [(provider.wallet as any).payer]);
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("DuplicateImpression");
      }
    });

    it("succeeds with different nonce (second impression)", async () => {
      const [adPda] = findAdPda(advertiser.publicKey, 0);
      const [screenerPda] = findScreenerPda(screener.publicKey);
      const [curatorPda] = findCuratorPda(curator.publicKey);

      const [bitmapPda] = findBitmapPda(adPda, 1);
      const [depositPda] = findDepositPda(advertiser.publicKey);
      const [configPda] = findConfigPda();

      const nonce = new BN(1);
      const contextHash = Buffer.alloc(32, 0xcd);
      const timestamp = new BN(Math.floor(Date.now() / 1000));

      const message = buildCanonicalMessage(
        adPda, screener.publicKey, curator.publicKey, agent.publicKey,
        nonce, contextHash, timestamp
      );

      const tx = new Transaction().add(
        createEd25519Ix(screener.secretKey, message),
        createEd25519Ix(curator.secretKey, message),
        createEd25519Ix(agent.secretKey, message),
        await program.methods
          .recordImpression(nonce, Array.from(contextHash), timestamp, 0, agent.publicKey)
          .accounts({
            adAccount: adPda,
            screenerAccount: screenerPda,
            curatorAccount: curatorPda,

            impressionBitmap: bitmapPda,
            depositAccount: depositPda,
            protocolConfig: configPda,
            screenerWallet: screener.publicKey,
            curatorWallet: curator.publicKey,
            protocolTreasury: treasury.publicKey,
            instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .instruction()
      );

      await sendAndConfirmTransaction(provider.connection, tx, [(provider.wallet as any).payer]);

      const ad = await program.account.adAccount.fetch(adPda);
      expect(ad.totalImpressions.toNumber()).to.equal(2);
      expect(ad.spentLamports.toNumber()).to.equal(20_000); // 2 * per_impression (submission_fee not tracked in spent)
    });

    it("fails with unauthorized screener", async () => {
      const fakeScreener = Keypair.generate();
      await airdrop(fakeScreener.publicKey);

      // Register fake screener
      const [fakeScreenerPda] = findScreenerPda(fakeScreener.publicKey);
      await program.methods
        .registerScreener(1500, [curator.publicKey])
        .accounts({
          screener: fakeScreener.publicKey,
          screenerAccount: fakeScreenerPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([fakeScreener])
        .rpc();

      const [adPda] = findAdPda(advertiser.publicKey, 0);
      const [curatorPda] = findCuratorPda(curator.publicKey);

      const [bitmapPda] = findBitmapPda(adPda, 2);
      const [depositPda] = findDepositPda(advertiser.publicKey);
      const [configPda] = findConfigPda();

      const nonce = new BN(2);
      const contextHash = Buffer.alloc(32, 0);
      const timestamp = new BN(Math.floor(Date.now() / 1000));

      const message = buildCanonicalMessage(
        adPda, fakeScreener.publicKey, curator.publicKey, agent.publicKey,
        nonce, contextHash, timestamp
      );

      const tx = new Transaction().add(
        createEd25519Ix(fakeScreener.secretKey, message),
        createEd25519Ix(curator.secretKey, message),
        createEd25519Ix(agent.secretKey, message),
        await program.methods
          .recordImpression(nonce, Array.from(contextHash), timestamp, 0, agent.publicKey)
          .accounts({
            adAccount: adPda,
            screenerAccount: fakeScreenerPda,
            curatorAccount: curatorPda,

            impressionBitmap: bitmapPda,
            depositAccount: depositPda,
            protocolConfig: configPda,
            screenerWallet: fakeScreener.publicKey,
            curatorWallet: curator.publicKey,
            protocolTreasury: treasury.publicKey,
            instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .instruction()
      );

      try {
        await sendAndConfirmTransaction(provider.connection, tx, [(provider.wallet as any).payer]);
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("UnauthorizedScreener");
      }
    });

    it("fails when ad is not active", async () => {
      const [adPda] = findAdPda(advertiser.publicKey, 0);

      // Deactivate ad
      await program.methods
        .updateAd(new BN(10_000_000), 2000, [screener.publicKey], [], false)
        .accounts({ advertiser: advertiser.publicKey, adAccount: adPda })
        .signers([advertiser])
        .rpc();

      const [screenerPda] = findScreenerPda(screener.publicKey);
      const [curatorPda] = findCuratorPda(curator.publicKey);

      const [bitmapPda] = findBitmapPda(adPda, 3);
      const [depositPda] = findDepositPda(advertiser.publicKey);
      const [configPda] = findConfigPda();

      const nonce = new BN(3);
      const contextHash = Buffer.alloc(32, 0);
      const timestamp = new BN(Math.floor(Date.now() / 1000));

      const message = buildCanonicalMessage(
        adPda, screener.publicKey, curator.publicKey, agent.publicKey,
        nonce, contextHash, timestamp
      );

      const tx = new Transaction().add(
        createEd25519Ix(screener.secretKey, message),
        createEd25519Ix(curator.secretKey, message),
        createEd25519Ix(agent.secretKey, message),
        await program.methods
          .recordImpression(nonce, Array.from(contextHash), timestamp, 0, agent.publicKey)
          .accounts({
            adAccount: adPda,
            screenerAccount: screenerPda,
            curatorAccount: curatorPda,

            impressionBitmap: bitmapPda,
            depositAccount: depositPda,
            protocolConfig: configPda,
            screenerWallet: screener.publicKey,
            curatorWallet: curator.publicKey,
            protocolTreasury: treasury.publicKey,
            instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .instruction()
      );

      try {
        await sendAndConfirmTransaction(provider.connection, tx, [(provider.wallet as any).payer]);
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("AdNotActive");
      }

      // Re-activate ad for subsequent tests
      await program.methods
        .updateAd(new BN(10_000_000), 2000, [screener.publicKey], [], true)
        .accounts({ advertiser: advertiser.publicKey, adAccount: adPda })
        .signers([advertiser])
        .rpc();
    });

    it("fails with excluded curator", async () => {
      const [adPda] = findAdPda(advertiser.publicKey, 0);

      // Add curator to excluded list
      await program.methods
        .updateAd(new BN(10_000_000), 2000, [screener.publicKey], [curator.publicKey], true)
        .accounts({ advertiser: advertiser.publicKey, adAccount: adPda })
        .signers([advertiser])
        .rpc();

      const [screenerPda] = findScreenerPda(screener.publicKey);
      const [curatorPda] = findCuratorPda(curator.publicKey);

      const [bitmapPda] = findBitmapPda(adPda, 4);
      const [depositPda] = findDepositPda(advertiser.publicKey);
      const [configPda] = findConfigPda();

      const nonce = new BN(4);
      const contextHash = Buffer.alloc(32, 0);
      const timestamp = new BN(Math.floor(Date.now() / 1000));

      const message = buildCanonicalMessage(
        adPda, screener.publicKey, curator.publicKey, agent.publicKey,
        nonce, contextHash, timestamp
      );

      const tx = new Transaction().add(
        createEd25519Ix(screener.secretKey, message),
        createEd25519Ix(curator.secretKey, message),
        createEd25519Ix(agent.secretKey, message),
        await program.methods
          .recordImpression(nonce, Array.from(contextHash), timestamp, 0, agent.publicKey)
          .accounts({
            adAccount: adPda,
            screenerAccount: screenerPda,
            curatorAccount: curatorPda,

            impressionBitmap: bitmapPda,
            depositAccount: depositPda,
            protocolConfig: configPda,
            screenerWallet: screener.publicKey,
            curatorWallet: curator.publicKey,
            protocolTreasury: treasury.publicKey,
            instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .instruction()
      );

      try {
        await sendAndConfirmTransaction(provider.connection, tx, [(provider.wallet as any).payer]);
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("ExcludedCurator");
      }

      // Remove curator from excluded list
      await program.methods
        .updateAd(new BN(10_000_000), 2000, [screener.publicKey], [], true)
        .accounts({ advertiser: advertiser.publicKey, adAccount: adPda })
        .signers([advertiser])
        .rpc();
    });

    it("fails with wrong signature (signer mismatch)", async () => {
      const [adPda] = findAdPda(advertiser.publicKey, 0);
      const [screenerPda] = findScreenerPda(screener.publicKey);
      const [curatorPda] = findCuratorPda(curator.publicKey);

      const [bitmapPda] = findBitmapPda(adPda, 5);
      const [depositPda] = findDepositPda(advertiser.publicKey);
      const [configPda] = findConfigPda();

      const nonce = new BN(5);
      const contextHash = Buffer.alloc(32, 0);
      const timestamp = new BN(Math.floor(Date.now() / 1000));

      const message = buildCanonicalMessage(
        adPda, screener.publicKey, curator.publicKey, agent.publicKey,
        nonce, contextHash, timestamp
      );

      // Sign with wrong key for screener (use agent's key instead)
      const tx = new Transaction().add(
        createEd25519Ix(agent.secretKey, message), // wrong signer!
        createEd25519Ix(curator.secretKey, message),
        createEd25519Ix(agent.secretKey, message),
        await program.methods
          .recordImpression(nonce, Array.from(contextHash), timestamp, 0, agent.publicKey)
          .accounts({
            adAccount: adPda,
            screenerAccount: screenerPda,
            curatorAccount: curatorPda,

            impressionBitmap: bitmapPda,
            depositAccount: depositPda,
            protocolConfig: configPda,
            screenerWallet: screener.publicKey,
            curatorWallet: curator.publicKey,
            protocolTreasury: treasury.publicKey,
            instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .instruction()
      );

      try {
        await sendAndConfirmTransaction(provider.connection, tx, [(provider.wallet as any).payer]);
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err.toString()).to.include("SignatureVerificationFailed");
      }
    });
  });
});
