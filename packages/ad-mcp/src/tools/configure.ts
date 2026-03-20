import type { AdMcpConfig } from "../config.js";
import { saveConfig } from "../config.js";

export interface ConfigureInput {
  auto_sign?: boolean;
  auto_submit?: boolean;
}

export function applyConfigure(
  current: AdMcpConfig,
  input: ConfigureInput,
): AdMcpConfig {
  const updated = { ...current };
  if (input.auto_sign !== undefined) updated.auto_sign = input.auto_sign;
  if (input.auto_submit !== undefined) updated.auto_submit = input.auto_submit;
  saveConfig(updated);
  return updated;
}
