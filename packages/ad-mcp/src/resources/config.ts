import type { AdMcpConfig } from "../config.js";

export function configResourceContent(config: AdMcpConfig): string {
  // Redact sensitive fields
  const safe = {
    ...config,
    wallet_auth_token: config.wallet_auth_token ? "***" : "(not set)",
    wallet_private_key: config.wallet_private_key ? "***" : undefined,
  };
  return JSON.stringify(safe, null, 2);
}
