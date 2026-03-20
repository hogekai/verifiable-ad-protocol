import type { AdMcpConfig } from "../config.js";

export function configResourceContent(config: AdMcpConfig): string {
  // Redact auth token for safety
  const safe = {
    ...config,
    vaulx_auth_token: config.vaulx_auth_token ? "***" : "(not set)",
  };
  return JSON.stringify(safe, null, 2);
}
