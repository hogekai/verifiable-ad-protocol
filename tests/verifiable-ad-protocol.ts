import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { VerifiableAdProtocol } from "../target/types/verifiable_ad_protocol";
import { expect } from "chai";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import BN from "bn.js";

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

  const findAgentPda = (agentKey: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("agent"), agentKey.toBuffer()],
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
    ]);
  });

  // ─── 1. initialize_config ─────────────────────────────────────────────────

  describe("initialize_config", () => {
    it("initializes protocol config successfully", async () => {
      const [configPda] = findConfigPda();

      await program.methods
        .initializeConfig(50, treasury.publicKey, new BN(3600))
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
      expect(config.minAgentAgeSeconds.toNumber()).to.equal(3600);
    });

    it("fails when called a second time (PDA already exists)", async () => {
      const [configPda] = findConfigPda();

      try {
        await program.methods
          .initializeConfig(50, treasury.publicKey, new BN(3600))
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
          .initializeConfig(10001, treasury.publicKey, new BN(3600))
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

  // ─── 6. register_agent ────────────────────────────────────────────────────

  describe("register_agent", () => {
    it("registers an agent successfully", async () => {
      const [agentPda] = findAgentPda(agent.publicKey);

      await program.methods
        .registerAgent()
        .accounts({
          agent: agent.publicKey,
          agentRegistry: agentPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([agent])
        .rpc();

      const agentRegistry =
        await program.account.agentRegistry.fetch(agentPda);
      expect(agentRegistry.agent.toString()).to.equal(
        agent.publicKey.toString()
      );
      expect(agentRegistry.registeredAt.toNumber()).to.be.greaterThan(0);
      expect(agentRegistry.totalImpressions.toNumber()).to.equal(0);
    });
  });

  // ─── 7. update_ad ─────────────────────────────────────────────────────────

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
});
