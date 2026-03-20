use crate::constants::BITS_PER_BITMAP;
use crate::error::ProtocolError;
use anchor_lang::prelude::*;

/// Calculate the bitmap chunk index for a given impression nonce.
pub fn get_chunk_index(impression_nonce: u64) -> u16 {
    (impression_nonce / BITS_PER_BITMAP) as u16
}

/// Check if a bit is already set in the bitmap. If not, set it.
/// Returns an error if the bit is already set (duplicate impression).
pub fn check_and_set_bit(bitmap: &mut [u8; 1024], impression_nonce: u64) -> Result<()> {
    let local_index = (impression_nonce % BITS_PER_BITMAP) as usize;
    let byte_index = local_index / 8;
    let bit_index = local_index % 8;

    if bitmap[byte_index] & (1 << bit_index) != 0 {
        return Err(ProtocolError::DuplicateImpression.into());
    }

    bitmap[byte_index] |= 1 << bit_index;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_chunk_index() {
        assert_eq!(get_chunk_index(0), 0);
        assert_eq!(get_chunk_index(8191), 0);
        assert_eq!(get_chunk_index(8192), 1);
        assert_eq!(get_chunk_index(16383), 1);
        assert_eq!(get_chunk_index(16384), 2);
    }

    #[test]
    fn test_check_and_set_bit_success() {
        let mut bitmap = [0u8; 1024];
        assert!(check_and_set_bit(&mut bitmap, 0).is_ok());
        assert!(check_and_set_bit(&mut bitmap, 1).is_ok());
        assert!(check_and_set_bit(&mut bitmap, 8191).is_ok());
    }

    #[test]
    fn test_check_and_set_bit_duplicate() {
        let mut bitmap = [0u8; 1024];
        assert!(check_and_set_bit(&mut bitmap, 42).is_ok());
        assert!(check_and_set_bit(&mut bitmap, 42).is_err());
    }

    #[test]
    fn test_check_and_set_bit_boundary() {
        let mut bitmap = [0u8; 1024];
        // nonce 8191: local_index = 8191, byte_index = 1023, bit_index = 7
        assert!(check_and_set_bit(&mut bitmap, 8191).is_ok());
        assert_eq!(bitmap[1023] & (1 << 7), 128);
    }

    #[test]
    fn test_nonce_wrapping_within_chunk() {
        let mut bitmap = [0u8; 1024];
        assert!(check_and_set_bit(&mut bitmap, 0).is_ok());
        // Nonce 8192 maps to local 0 in a DIFFERENT bitmap account
        let local = (8192u64 % BITS_PER_BITMAP) as usize;
        assert_eq!(local, 0);
    }
}
