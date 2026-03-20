import type { AdStats } from "../tools/get-stats.js";

export function statsResourceContent(stats: AdStats): string {
  return JSON.stringify(stats, null, 2);
}
