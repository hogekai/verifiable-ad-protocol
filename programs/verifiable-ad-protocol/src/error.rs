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
}
