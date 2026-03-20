use anchor_lang::prelude::*;

use crate::constants::BITMAP_SIZE_BYTES;

/// Protocol-wide configuration singleton.
/// PDA seeds: ["config"]
#[account]
pub struct ProtocolConfig {
    pub authority: Pubkey,
    pub protocol_fee_bps: u16,
    pub treasury: Pubkey,
    pub submission_fee_lamports: u64,
    pub bump: u8,
}

// space = 8 + 32 + 2 + 32 + 8 + 1 = 83
pub const PROTOCOL_CONFIG_SPACE: usize = 83;

/// Advertiser deposit pool. SOL balance is tracked via account lamports.
/// PDA seeds: ["deposit", advertiser.key()]
#[account]
pub struct DepositAccount {
    pub advertiser: Pubkey,
    pub bump: u8,
}

// space = 8 + 32 + 1 = 41
pub const DEPOSIT_ACCOUNT_SPACE: usize = 41;

/// Individual ad registered by an advertiser.
/// PDA seeds: ["ad", advertiser.key(), ad_index.to_le_bytes()]
#[account]
pub struct AdAccount {
    pub advertiser: Pubkey,
    pub ad_index: u64,
    pub budget_lamports: u64,
    pub spent_lamports: u64,
    pub max_cpm_lamports: u64,
    pub max_screener_share_bps: u16,
    pub authorized_screeners: Vec<Pubkey>,
    pub excluded_curators: Vec<Pubkey>,
    pub is_active: bool,
    pub total_impressions: u64,
    pub created_at: i64,
    pub bump: u8,
}

// space = 8 + 32 + 8 + 8 + 8 + 8 + 2 + (4 + 32*10) + (4 + 32*10) + 1 + 8 + 8 + 1 = 740
// + 14 (sub-phase 3 fields) + 50 (buffer) = 804
pub const AD_ACCOUNT_SPACE: usize = 804;

/// Screener (ad quality filter) account.
/// PDA seeds: ["screener", screener.key()]
#[account]
pub struct ScreenerAccount {
    pub screener: Pubkey,
    pub declared_share_bps: u16,
    pub endorsed_curators: Vec<Pubkey>,
    pub staked_amount: u64,
    pub slashable: bool,
    pub is_active: bool,
    pub total_screened: u64,
    pub bump: u8,
}

// space = 8 + 32 + 2 + (4 + 32*20) + 8 + 1 + 1 + 8 + 1 = 705
// + 50 (buffer) = 755
pub const SCREENER_ACCOUNT_SPACE: usize = 755;

/// Curator (ad delivery service) account.
/// PDA seeds: ["curator", curator.key()]
#[account]
pub struct CuratorAccount {
    pub curator: Pubkey,
    pub metadata_uri: String,
    pub registered_at: i64,
    pub total_verified_impressions: u64,
    pub bump: u8,
}

// space = 8 + 32 + (4 + 200) + 8 + 8 + 1 = 261
// + 20 (sub-phase 3 fields) + 50 (buffer) = 331
pub const CURATOR_ACCOUNT_SPACE: usize = 331;

/// Bitmap for impression deduplication per ad.
/// PDA seeds: ["bitmap", ad_account.key(), chunk_index.to_le_bytes()]
#[account]
pub struct ImpressionBitmap {
    pub ad_id: Pubkey,
    pub chunk_index: u16,
    pub bitmap: [u8; BITMAP_SIZE_BYTES],
    pub bump: u8,
}

// space = 8 + 32 + 2 + 1024 + 1 = 1067
pub const IMPRESSION_BITMAP_SPACE: usize = 1067;

/// Canonical message signed by all 3 parties (not an on-chain account).
/// Borsh serialized = 176 bytes fixed.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ImpressionMessage {
    pub ad_id: Pubkey,
    pub screener: Pubkey,
    pub curator: Pubkey,
    pub agent: Pubkey,
    pub impression_nonce: u64,
    pub context_hash: [u8; 32],
    pub timestamp: i64,
}
