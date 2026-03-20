pub mod bitmap;
pub mod constants;
pub mod ed25519;
pub mod error;
pub mod state;

use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_lang::solana_program::sysvar::instructions as instructions_sysvar_mod;

use bitmap::{check_and_set_bit, get_chunk_index};
use constants::*;
use ed25519::verify_ed25519_instruction;
use error::ProtocolError;
use state::*;

declare_id!("7Qu5B4tB23Gt4WDZoZiLJpQ8hSxK6RPXeFSCdacCPvFf");

#[program]
pub mod verifiable_ad_protocol {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        protocol_fee_bps: u16,
        treasury: Pubkey,
    ) -> Result<()> {
        require!(protocol_fee_bps <= 10000, ProtocolError::InvalidShareBps);

        let config = &mut ctx.accounts.protocol_config;
        config.authority = ctx.accounts.authority.key();
        config.protocol_fee_bps = protocol_fee_bps;
        config.treasury = treasury;
        config.bump = ctx.bumps.protocol_config;
        Ok(())
    }

    pub fn deposit_funds(ctx: Context<DepositFunds>, amount_lamports: u64) -> Result<()> {
        require!(amount_lamports > 0, ProtocolError::ZeroBudget);

        let deposit = &mut ctx.accounts.deposit_account;
        deposit.advertiser = ctx.accounts.advertiser.key();
        deposit.bump = ctx.bumps.deposit_account;

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.advertiser.to_account_info(),
                    to: ctx.accounts.deposit_account.to_account_info(),
                },
            ),
            amount_lamports,
        )?;
        Ok(())
    }

    pub fn register_ad(
        ctx: Context<RegisterAd>,
        ad_index: u64,
        budget_lamports: u64,
        max_cpm_lamports: u64,
        max_screener_share_bps: u16,
        authorized_screeners: Vec<Pubkey>,
        excluded_curators: Vec<Pubkey>,
    ) -> Result<()> {
        require!(budget_lamports > 0, ProtocolError::ZeroBudget);
        require!(max_cpm_lamports > 0, ProtocolError::ZeroBudget);
        require!(
            max_screener_share_bps <= 10000,
            ProtocolError::InvalidShareBps
        );
        require!(
            authorized_screeners.len() <= MAX_AUTHORIZED_SCREENERS,
            ProtocolError::TooManyScreeners
        );
        require!(
            excluded_curators.len() <= MAX_EXCLUDED_CURATORS,
            ProtocolError::TooManyExcludedCurators
        );

        let ad = &mut ctx.accounts.ad_account;
        ad.advertiser = ctx.accounts.advertiser.key();
        ad.ad_index = ad_index;
        ad.budget_lamports = budget_lamports;
        ad.spent_lamports = 0;
        ad.max_cpm_lamports = max_cpm_lamports;
        ad.max_screener_share_bps = max_screener_share_bps;
        ad.authorized_screeners = authorized_screeners;
        ad.excluded_curators = excluded_curators;
        ad.is_active = true;
        ad.total_impressions = 0;
        ad.created_at = Clock::get()?.unix_timestamp;
        ad.impressions_last_hour = 0;
        ad.last_hour_slot = 0;
        ad.max_impressions_per_hour = DEFAULT_MAX_IMPRESSIONS_PER_HOUR;
        ad.bump = ctx.bumps.ad_account;
        Ok(())
    }

    pub fn register_screener(
        ctx: Context<RegisterScreener>,
        declared_share_bps: u16,
        endorsed_curators: Vec<Pubkey>,
    ) -> Result<()> {
        require!(
            declared_share_bps <= 10000,
            ProtocolError::InvalidShareBps
        );
        require!(
            endorsed_curators.len() <= MAX_ENDORSED_CURATORS,
            ProtocolError::TooManyEndorsedCurators
        );

        let screener = &mut ctx.accounts.screener_account;
        screener.screener = ctx.accounts.screener.key();
        screener.declared_share_bps = declared_share_bps;
        screener.endorsed_curators = endorsed_curators;
        screener.staked_amount = 0;
        screener.slashable = false;
        screener.is_active = true;
        screener.total_screened = 0;
        screener.bump = ctx.bumps.screener_account;
        Ok(())
    }

    pub fn register_curator(
        ctx: Context<RegisterCurator>,
        metadata_uri: String,
        rate_limit_max_per_window: u32,
    ) -> Result<()> {
        require!(
            metadata_uri.len() <= MAX_METADATA_URI_LENGTH,
            ProtocolError::MetadataUriTooLong
        );

        let curator = &mut ctx.accounts.curator_account;
        curator.curator = ctx.accounts.curator.key();
        curator.metadata_uri = metadata_uri;
        curator.registered_at = Clock::get()?.unix_timestamp;
        curator.total_verified_impressions = 0;
        curator.last_impression_slot = 0;
        curator.impressions_in_window = 0;
        curator.rate_limit_max_per_window = rate_limit_max_per_window;
        curator.bump = ctx.bumps.curator_account;
        Ok(())
    }

    pub fn update_ad(
        ctx: Context<UpdateAd>,
        max_cpm_lamports: u64,
        max_screener_share_bps: u16,
        authorized_screeners: Vec<Pubkey>,
        excluded_curators: Vec<Pubkey>,
        is_active: bool,
        max_impressions_per_hour: u32,
    ) -> Result<()> {
        require!(
            max_screener_share_bps <= 10000,
            ProtocolError::InvalidShareBps
        );
        require!(
            authorized_screeners.len() <= MAX_AUTHORIZED_SCREENERS,
            ProtocolError::TooManyScreeners
        );
        require!(
            excluded_curators.len() <= MAX_EXCLUDED_CURATORS,
            ProtocolError::TooManyExcludedCurators
        );

        let ad = &mut ctx.accounts.ad_account;
        ad.max_cpm_lamports = max_cpm_lamports;
        ad.max_screener_share_bps = max_screener_share_bps;
        ad.authorized_screeners = authorized_screeners;
        ad.excluded_curators = excluded_curators;
        ad.is_active = is_active;
        ad.max_impressions_per_hour = max_impressions_per_hour;
        Ok(())
    }

    pub fn update_screener(
        ctx: Context<UpdateScreener>,
        declared_share_bps: u16,
        endorsed_curators: Vec<Pubkey>,
    ) -> Result<()> {
        require!(
            declared_share_bps <= 10000,
            ProtocolError::InvalidShareBps
        );
        require!(
            endorsed_curators.len() <= MAX_ENDORSED_CURATORS,
            ProtocolError::TooManyEndorsedCurators
        );

        let screener = &mut ctx.accounts.screener_account;
        screener.declared_share_bps = declared_share_bps;
        screener.endorsed_curators = endorsed_curators;
        Ok(())
    }

    pub fn update_curator(
        ctx: Context<UpdateCurator>,
        metadata_uri: String,
        rate_limit_max_per_window: u32,
    ) -> Result<()> {
        require!(
            metadata_uri.len() <= MAX_METADATA_URI_LENGTH,
            ProtocolError::MetadataUriTooLong
        );

        let curator = &mut ctx.accounts.curator_account;
        curator.metadata_uri = metadata_uri;
        curator.rate_limit_max_per_window = rate_limit_max_per_window;
        Ok(())
    }

    pub fn update_config(
        ctx: Context<UpdateConfig>,
        protocol_fee_bps: u16,
        treasury: Pubkey,
    ) -> Result<()> {
        require!(protocol_fee_bps <= 10000, ProtocolError::InvalidShareBps);

        let config = &mut ctx.accounts.protocol_config;
        config.protocol_fee_bps = protocol_fee_bps;
        config.treasury = treasury;
        Ok(())
    }

    pub fn initialize_bitmap(
        ctx: Context<InitializeBitmap>,
        chunk_index: u16,
    ) -> Result<()> {
        let bitmap = &mut ctx.accounts.impression_bitmap;
        bitmap.ad_id = ctx.accounts.ad_account.key();
        bitmap.chunk_index = chunk_index;
        bitmap.bump = ctx.bumps.impression_bitmap;
        Ok(())
    }

    pub fn record_impression(
        ctx: Context<RecordImpression>,
        impression_nonce: u64,
        context_hash: [u8; 32],
        timestamp: i64,
        chunk_index: u16,
        agent_pubkey: Pubkey,
    ) -> Result<()> {
        // Copy values needed for checks to avoid borrow conflicts with later &mut
        let ad_is_active = ctx.accounts.ad_account.is_active;
        let ad_authorized_screeners = ctx.accounts.ad_account.authorized_screeners.clone();
        let ad_excluded_curators = ctx.accounts.ad_account.excluded_curators.clone();
        let ad_max_screener_share_bps = ctx.accounts.ad_account.max_screener_share_bps;
        let ad_max_cpm_lamports = ctx.accounts.ad_account.max_cpm_lamports;
        let ad_spent_lamports = ctx.accounts.ad_account.spent_lamports;
        let ad_budget_lamports = ctx.accounts.ad_account.budget_lamports;
        let ad_key = ctx.accounts.ad_account.key();
        let screener_key = ctx.accounts.screener_account.screener;
        let screener_endorsed = ctx.accounts.screener_account.endorsed_curators.clone();
        let screener_declared_share_bps = ctx.accounts.screener_account.declared_share_bps;
        let curator_key = ctx.accounts.curator_account.curator;

        // ── 0. Basic checks ──────────────────────────────────────────
        require!(ad_is_active, ProtocolError::AdNotActive);

        let clock = Clock::get()?;
        let now = clock.unix_timestamp;
        let current_slot = clock.slot;
        require!(
            now - timestamp <= MAX_TIMESTAMP_AGE_SECONDS,
            ProtocolError::TimestampTooOld
        );
        require!(
            timestamp - now <= MAX_TIMESTAMP_FUTURE_SECONDS,
            ProtocolError::TimestampInFuture
        );

        // ── 1. Authorization checks ──────────────────────────────────
        require!(
            ad_authorized_screeners.contains(&screener_key),
            ProtocolError::UnauthorizedScreener
        );
        require!(
            screener_endorsed.contains(&curator_key),
            ProtocolError::UnauthorizedCurator
        );
        require!(
            !ad_excluded_curators.contains(&curator_key),
            ProtocolError::ExcludedCurator
        );
        require!(
            agent_pubkey != screener_key && agent_pubkey != curator_key,
            ProtocolError::AgentIsScreenerOrCurator
        );
        require!(
            screener_declared_share_bps <= ad_max_screener_share_bps,
            ProtocolError::ExceededScreenerShare
        );

        // ── 1b. Rate limit checks ────────────────────────────────────
        // Curator rate limit
        {
            let curator_mut = &mut ctx.accounts.curator_account;
            if current_slot.saturating_sub(curator_mut.last_impression_slot)
                > DEFAULT_RATE_LIMIT_WINDOW_SLOTS
            {
                curator_mut.impressions_in_window = 1;
            } else {
                curator_mut.impressions_in_window = curator_mut
                    .impressions_in_window
                    .checked_add(1)
                    .ok_or(ProtocolError::ArithmeticOverflow)?;
            }
            require!(
                curator_mut.impressions_in_window <= curator_mut.rate_limit_max_per_window,
                ProtocolError::RateLimitExceeded
            );
            curator_mut.last_impression_slot = current_slot;
            curator_mut.total_verified_impressions = curator_mut
                .total_verified_impressions
                .checked_add(1)
                .ok_or(ProtocolError::ArithmeticOverflow)?;
        }

        // Ad hourly cap
        {
            let ad_mut = &mut ctx.accounts.ad_account;
            if current_slot.saturating_sub(ad_mut.last_hour_slot) > SLOTS_PER_HOUR {
                ad_mut.impressions_last_hour = 1;
            } else {
                ad_mut.impressions_last_hour = ad_mut
                    .impressions_last_hour
                    .checked_add(1)
                    .ok_or(ProtocolError::ArithmeticOverflow)?;
            }
            require!(
                ad_mut.impressions_last_hour <= ad_mut.max_impressions_per_hour,
                ProtocolError::AdRateLimitExceeded
            );
            ad_mut.last_hour_slot = current_slot;
        }

        // ── 2. Build canonical message and verify Ed25519 signatures ─
        let message = ImpressionMessage {
            ad_id: ad_key,
            screener: screener_key,
            curator: curator_key,
            agent: agent_pubkey,
            impression_nonce,
            context_hash,
            timestamp,
        };
        let message_bytes = message
            .try_to_vec()
            .map_err(|_| ProtocolError::ArithmeticOverflow)?;

        let message_hash = anchor_lang::solana_program::hash::hash(&message_bytes);

        let instructions_sysvar = &ctx.accounts.instructions_sysvar;

        verify_ed25519_instruction(instructions_sysvar, 0, &screener_key, message_hash.as_ref())?;
        verify_ed25519_instruction(instructions_sysvar, 1, &curator_key, message_hash.as_ref())?;
        verify_ed25519_instruction(instructions_sysvar, 2, &agent_pubkey, message_hash.as_ref())?;

        // ── 3. Bitmap deduplication ──────────────────────────────────
        let expected_chunk = get_chunk_index(impression_nonce);
        require!(chunk_index == expected_chunk, ProtocolError::BitmapChunkMismatch);

        let bitmap = &mut ctx.accounts.impression_bitmap;
        require!(
            bitmap.chunk_index == chunk_index,
            ProtocolError::BitmapChunkMismatch
        );
        check_and_set_bit(&mut bitmap.bitmap, impression_nonce)?;

        // ── 4. Reward calculation ────────────────────────────────────
        let protocol_fee_bps = ctx.accounts.protocol_config.protocol_fee_bps as u64;
        let declared_share_bps = screener_declared_share_bps as u64;

        let per_impression = ad_max_cpm_lamports
            .checked_div(1000)
            .ok_or(ProtocolError::ArithmeticOverflow)?;

        let protocol_fee = per_impression
            .checked_mul(protocol_fee_bps)
            .ok_or(ProtocolError::ArithmeticOverflow)?
            .checked_div(10000)
            .ok_or(ProtocolError::ArithmeticOverflow)?;

        let after_fee = per_impression
            .checked_sub(protocol_fee)
            .ok_or(ProtocolError::ArithmeticOverflow)?;

        let screener_reward = after_fee
            .checked_mul(declared_share_bps)
            .ok_or(ProtocolError::ArithmeticOverflow)?
            .checked_div(10000)
            .ok_or(ProtocolError::ArithmeticOverflow)?;

        let curator_reward = after_fee
            .checked_sub(screener_reward)
            .ok_or(ProtocolError::ArithmeticOverflow)?;

        // ── 5. Budget & deposit checks ───────────────────────────────
        let new_spent = ad_spent_lamports
            .checked_add(per_impression)
            .ok_or(ProtocolError::ArithmeticOverflow)?;
        require!(new_spent <= ad_budget_lamports, ProtocolError::InsufficientBudget);

        let submission_fee = SUBMISSION_FEE_LAMPORTS;
        let total_deduction = per_impression
            .checked_add(submission_fee)
            .ok_or(ProtocolError::ArithmeticOverflow)?;
        let deposit_lamports = ctx.accounts.deposit_account.to_account_info().lamports();
        let rent = Rent::get()?;
        let deposit_rent_exempt = rent.minimum_balance(DEPOSIT_ACCOUNT_SPACE);
        let available = deposit_lamports
            .checked_sub(deposit_rent_exempt)
            .ok_or(ProtocolError::InsufficientDeposit)?;
        require!(available >= total_deduction, ProtocolError::InsufficientDeposit);

        // ── 6. SOL transfers (lamports direct manipulation) ──────────
        if screener_reward > 0 {
            **ctx.accounts.deposit_account.to_account_info().try_borrow_mut_lamports()? -=
                screener_reward;
            **ctx.accounts.screener_wallet.to_account_info().try_borrow_mut_lamports()? +=
                screener_reward;
        }
        if curator_reward > 0 {
            **ctx.accounts.deposit_account.to_account_info().try_borrow_mut_lamports()? -=
                curator_reward;
            **ctx.accounts.curator_wallet.to_account_info().try_borrow_mut_lamports()? +=
                curator_reward;
        }
        if protocol_fee > 0 {
            **ctx.accounts.deposit_account.to_account_info().try_borrow_mut_lamports()? -=
                protocol_fee;
            **ctx
                .accounts
                .protocol_treasury
                .to_account_info()
                .try_borrow_mut_lamports()? += protocol_fee;
        }

        // ── 6b. Submission fee to payer ───────────────────────────────
        **ctx.accounts.deposit_account.to_account_info().try_borrow_mut_lamports()? -=
            submission_fee;
        **ctx.accounts.payer.to_account_info().try_borrow_mut_lamports()? +=
            submission_fee;

        // ── 7. State updates ─────────────────────────────────────────
        let ad = &mut ctx.accounts.ad_account;
        ad.spent_lamports = new_spent;
        ad.total_impressions = ad
            .total_impressions
            .checked_add(1)
            .ok_or(ProtocolError::ArithmeticOverflow)?;

        let screener_mut = &mut ctx.accounts.screener_account;
        screener_mut.total_screened = screener_mut
            .total_screened
            .checked_add(1)
            .ok_or(ProtocolError::ArithmeticOverflow)?;

        Ok(())
    }
}

// ─── Accounts Contexts ─────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = PROTOCOL_CONFIG_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositFunds<'info> {
    #[account(mut)]
    pub advertiser: Signer<'info>,

    #[account(
        init_if_needed,
        payer = advertiser,
        space = DEPOSIT_ACCOUNT_SPACE,
        seeds = [b"deposit", advertiser.key().as_ref()],
        bump
    )]
    pub deposit_account: Account<'info, DepositAccount>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(ad_index: u64)]
pub struct RegisterAd<'info> {
    #[account(mut)]
    pub advertiser: Signer<'info>,

    #[account(
        init,
        payer = advertiser,
        space = AD_ACCOUNT_SPACE,
        seeds = [b"ad", advertiser.key().as_ref(), &ad_index.to_le_bytes()],
        bump
    )]
    pub ad_account: Account<'info, AdAccount>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterScreener<'info> {
    #[account(mut)]
    pub screener: Signer<'info>,

    #[account(
        init,
        payer = screener,
        space = SCREENER_ACCOUNT_SPACE,
        seeds = [b"screener", screener.key().as_ref()],
        bump
    )]
    pub screener_account: Account<'info, ScreenerAccount>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterCurator<'info> {
    #[account(mut)]
    pub curator: Signer<'info>,

    #[account(
        init,
        payer = curator,
        space = CURATOR_ACCOUNT_SPACE,
        seeds = [b"curator", curator.key().as_ref()],
        bump
    )]
    pub curator_account: Account<'info, CuratorAccount>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateAd<'info> {
    pub advertiser: Signer<'info>,

    #[account(
        mut,
        has_one = advertiser @ ProtocolError::Unauthorized,
        seeds = [b"ad", advertiser.key().as_ref(), &ad_account.ad_index.to_le_bytes()],
        bump = ad_account.bump
    )]
    pub ad_account: Account<'info, AdAccount>,
}

#[derive(Accounts)]
pub struct UpdateScreener<'info> {
    pub screener: Signer<'info>,

    #[account(
        mut,
        has_one = screener @ ProtocolError::Unauthorized,
        seeds = [b"screener", screener.key().as_ref()],
        bump = screener_account.bump
    )]
    pub screener_account: Account<'info, ScreenerAccount>,
}

#[derive(Accounts)]
pub struct UpdateCurator<'info> {
    pub curator: Signer<'info>,

    #[account(
        mut,
        has_one = curator @ ProtocolError::Unauthorized,
        seeds = [b"curator", curator.key().as_ref()],
        bump = curator_account.bump
    )]
    pub curator_account: Account<'info, CuratorAccount>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority @ ProtocolError::Unauthorized,
        seeds = [b"config"],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
}

#[derive(Accounts)]
#[instruction(_impression_nonce: u64, _context_hash: [u8; 32], _timestamp: i64, chunk_index: u16, _agent_pubkey: Pubkey)]
pub struct RecordImpression<'info> {
    #[account(
        mut,
        seeds = [b"ad", ad_account.advertiser.as_ref(), &ad_account.ad_index.to_le_bytes()],
        bump = ad_account.bump
    )]
    pub ad_account: Box<Account<'info, AdAccount>>,

    #[account(
        mut,
        seeds = [b"screener", screener_account.screener.as_ref()],
        bump = screener_account.bump
    )]
    pub screener_account: Box<Account<'info, ScreenerAccount>>,

    #[account(
        mut,
        seeds = [b"curator", curator_account.curator.as_ref()],
        bump = curator_account.bump
    )]
    pub curator_account: Box<Account<'info, CuratorAccount>>,

    #[account(
        mut,
        seeds = [b"bitmap", ad_account.key().as_ref(), &chunk_index.to_le_bytes()],
        bump = impression_bitmap.bump
    )]
    pub impression_bitmap: Box<Account<'info, ImpressionBitmap>>,

    #[account(
        mut,
        seeds = [b"deposit", ad_account.advertiser.as_ref()],
        bump = deposit_account.bump
    )]
    pub deposit_account: Box<Account<'info, DepositAccount>>,

    #[account(
        seeds = [b"config"],
        bump = protocol_config.bump
    )]
    pub protocol_config: Box<Account<'info, ProtocolConfig>>,

    /// CHECK: Screener reward destination wallet.
    #[account(mut)]
    pub screener_wallet: UncheckedAccount<'info>,

    /// CHECK: Curator reward destination wallet.
    #[account(mut)]
    pub curator_wallet: UncheckedAccount<'info>,

    /// CHECK: Protocol treasury. Validated by constraint.
    #[account(
        mut,
        constraint = protocol_treasury.key() == protocol_config.treasury @ ProtocolError::Unauthorized
    )]
    pub protocol_treasury: UncheckedAccount<'info>,

    /// CHECK: Instructions sysvar for Ed25519 signature verification.
    #[account(address = instructions_sysvar_mod::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    /// Payer who submits the tx. Receives submission_fee from deposit.
    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(chunk_index: u16)]
pub struct InitializeBitmap<'info> {
    #[account(
        seeds = [b"ad", ad_account.advertiser.as_ref(), &ad_account.ad_index.to_le_bytes()],
        bump = ad_account.bump
    )]
    pub ad_account: Account<'info, AdAccount>,

    #[account(
        init,
        payer = payer,
        space = IMPRESSION_BITMAP_SPACE,
        seeds = [b"bitmap", ad_account.key().as_ref(), &chunk_index.to_le_bytes()],
        bump
    )]
    pub impression_bitmap: Box<Account<'info, ImpressionBitmap>>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}
