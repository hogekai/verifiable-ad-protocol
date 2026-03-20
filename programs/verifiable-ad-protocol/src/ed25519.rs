use anchor_lang::prelude::*;
use anchor_lang::solana_program::ed25519_program;
use anchor_lang::solana_program::sysvar::instructions::load_instruction_at_checked;

use crate::error::ProtocolError;

const ED25519_PUBKEY_SIZE: usize = 32;

/// Verify that an Ed25519 signature instruction exists at the given index
/// in the current transaction, and that it verifies the expected signer
/// and message.
///
/// The Ed25519 precompile has already verified the cryptographic signature
/// by the time our program executes. We only need to confirm the instruction
/// references the correct signer and message.
pub fn verify_ed25519_instruction(
    instructions_sysvar: &AccountInfo,
    instruction_index: usize,
    expected_signer: &Pubkey,
    expected_message: &[u8],
) -> Result<()> {
    let ix = load_instruction_at_checked(instruction_index, instructions_sysvar)
        .map_err(|_| ProtocolError::InvalidEd25519Instruction)?;

    // Must be an Ed25519 program instruction
    if ix.program_id != ed25519_program::id() {
        return Err(ProtocolError::InvalidEd25519Instruction.into());
    }

    let ix_data = &ix.data;

    // Ed25519 instruction data layout (num_signatures=1):
    //   [0]:     num_signatures (u8) = 1
    //   [1]:     padding (u8)
    //   [2..4]:  signature_offset (u16 LE)
    //   [4..6]:  signature_instruction_index (u16 LE)
    //   [6..8]:  public_key_offset (u16 LE)
    //   [8..10]: public_key_instruction_index (u16 LE)
    //   [10..12]: message_data_offset (u16 LE)
    //   [12..14]: message_data_size (u16 LE)
    //   [14..16]: message_instruction_index (u16 LE)
    //   [16..80]: signature (64 bytes)
    //   [80..112]: public_key (32 bytes)
    //   [112..]: message (variable)

    // Minimum size: 16 header + 64 sig + 32 pubkey + 1 message byte
    if ix_data.len() < 113 {
        return Err(ProtocolError::InvalidEd25519Instruction.into());
    }

    // num_signatures must be 1
    if ix_data[0] != 1 {
        return Err(ProtocolError::InvalidEd25519Instruction.into());
    }

    // Extract offsets
    let public_key_offset = u16::from_le_bytes([ix_data[6], ix_data[7]]) as usize;
    let message_data_offset = u16::from_le_bytes([ix_data[10], ix_data[11]]) as usize;
    let message_data_size = u16::from_le_bytes([ix_data[12], ix_data[13]]) as usize;

    // Verify public key matches expected signer
    if public_key_offset
        .checked_add(ED25519_PUBKEY_SIZE)
        .map_or(true, |end| end > ix_data.len())
    {
        return Err(ProtocolError::InvalidEd25519Instruction.into());
    }
    let pubkey_bytes = &ix_data[public_key_offset..public_key_offset + ED25519_PUBKEY_SIZE];
    if pubkey_bytes != expected_signer.to_bytes() {
        return Err(ProtocolError::SignatureVerificationFailed.into());
    }

    // Verify message matches expected message
    if message_data_offset
        .checked_add(message_data_size)
        .map_or(true, |end| end > ix_data.len())
    {
        return Err(ProtocolError::InvalidEd25519Instruction.into());
    }
    let message_bytes = &ix_data[message_data_offset..message_data_offset + message_data_size];
    if message_bytes != expected_message {
        return Err(ProtocolError::SignatureVerificationFailed.into());
    }

    Ok(())
}
