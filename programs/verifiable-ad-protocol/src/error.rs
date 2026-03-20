use anchor_lang::prelude::*;

#[error_code]
pub enum ProtocolError {
    #[msg("Invalid screener share basis points (must be <= 10000)")]
    InvalidShareBps,

    #[msg("Too many authorized screeners (max 10)")]
    TooManyScreeners,

    #[msg("Too many excluded curators (max 10)")]
    TooManyExcludedCurators,

    #[msg("Too many endorsed curators (max 20)")]
    TooManyEndorsedCurators,

    #[msg("Metadata URI too long (max 200 characters)")]
    MetadataUriTooLong,

    #[msg("Budget must be greater than zero")]
    ZeroBudget,

    #[msg("Unauthorized: signer does not match account owner")]
    Unauthorized,

    #[msg("Duplicate impression: this nonce has already been recorded")]
    DuplicateImpression,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    #[msg("Account is not active")]
    InactiveAccount,

    // Sub-phase 2: Ed25519 signature verification & record_impression
    #[msg("Invalid Ed25519 instruction")]
    InvalidEd25519Instruction,

    #[msg("Signature verification failed")]
    SignatureVerificationFailed,

    #[msg("Screener is not authorized for this ad")]
    UnauthorizedScreener,

    #[msg("Curator is not endorsed by this screener")]
    UnauthorizedCurator,

    #[msg("Curator is excluded by this ad")]
    ExcludedCurator,

    #[msg("Agent cannot be the same as screener or curator")]
    AgentIsScreenerOrCurator,

    #[msg("Screener declared share exceeds ad max")]
    ExceededScreenerShare,

    #[msg("Insufficient ad budget")]
    InsufficientBudget,

    #[msg("Insufficient deposit balance")]
    InsufficientDeposit,

    #[msg("Timestamp is too old (more than 5 minutes)")]
    TimestampTooOld,

    #[msg("Timestamp is in the future (more than 1 minute)")]
    TimestampInFuture,

    #[msg("Bitmap chunk index mismatch")]
    BitmapChunkMismatch,

    #[msg("Ad is not active")]
    AdNotActive,

    // Sub-phase 3: Rate limiting
    #[msg("Curator rate limit exceeded")]
    RateLimitExceeded,

    #[msg("Ad hourly impression cap exceeded")]
    AdRateLimitExceeded,
}
