pub mod bitmap;
pub mod constants;
pub mod error;
pub mod state;

use anchor_lang::prelude::*;
use anchor_lang::system_program;

use constants::*;
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
        min_agent_age_seconds: i64,
    ) -> Result<()> {
        require!(protocol_fee_bps <= 10000, ProtocolError::InvalidShareBps);

        let config = &mut ctx.accounts.protocol_config;
        config.authority = ctx.accounts.authority.key();
        config.protocol_fee_bps = protocol_fee_bps;
        config.treasury = treasury;
        config.min_agent_age_seconds = min_agent_age_seconds;
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
        curator.bump = ctx.bumps.curator_account;
        Ok(())
    }

    pub fn register_agent(ctx: Context<RegisterAgent>) -> Result<()> {
        let agent_registry = &mut ctx.accounts.agent_registry;
        agent_registry.agent = ctx.accounts.agent.key();
        agent_registry.registered_at = Clock::get()?.unix_timestamp;
        agent_registry.total_impressions = 0;
        agent_registry.bump = ctx.bumps.agent_registry;
        Ok(())
    }

    pub fn update_ad(
        ctx: Context<UpdateAd>,
        max_cpm_lamports: u64,
        max_screener_share_bps: u16,
        authorized_screeners: Vec<Pubkey>,
        excluded_curators: Vec<Pubkey>,
        is_active: bool,
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
    ) -> Result<()> {
        require!(
            metadata_uri.len() <= MAX_METADATA_URI_LENGTH,
            ProtocolError::MetadataUriTooLong
        );

        let curator = &mut ctx.accounts.curator_account;
        curator.metadata_uri = metadata_uri;
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
pub struct RegisterAgent<'info> {
    #[account(mut)]
    pub agent: Signer<'info>,

    #[account(
        init,
        payer = agent,
        space = AGENT_REGISTRY_SPACE,
        seeds = [b"agent", agent.key().as_ref()],
        bump
    )]
    pub agent_registry: Account<'info, AgentRegistry>,

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
