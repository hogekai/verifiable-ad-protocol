// Account size constraints
pub const MAX_AUTHORIZED_SCREENERS: usize = 10;
pub const MAX_EXCLUDED_CURATORS: usize = 10;
pub const MAX_ENDORSED_CURATORS: usize = 20;
pub const MAX_METADATA_URI_LENGTH: usize = 200;

// Bitmap
pub const BITMAP_SIZE_BYTES: usize = 1024; // 1024 bytes = 8192 bits
pub const BITS_PER_BITMAP: u64 = 8192; // BITMAP_SIZE_BYTES * 8

// Phase 1 defaults
pub const DEFAULT_PROTOCOL_FEE_BPS: u16 = 50; // 0.5%
pub const DEFAULT_RATE_LIMIT_WINDOW_SLOTS: u64 = 150; // ~1 minute
pub const DEFAULT_RATE_LIMIT_MAX_PER_WINDOW: u32 = 100;
pub const DEFAULT_MAX_IMPRESSIONS_PER_HOUR: u32 = 10_000;
pub const SLOTS_PER_HOUR: u64 = 9000; // slot time ~400ms

// Timestamp freshness
pub const MAX_TIMESTAMP_AGE_SECONDS: i64 = 300; // 5 minutes
pub const MAX_TIMESTAMP_FUTURE_SECONDS: i64 = 60; // 1 minute

// Submission fee paid to tx payer to cover gas costs (separate from CPM rewards)
pub const DEFAULT_SUBMISSION_FEE_LAMPORTS: u64 = 5_000;
