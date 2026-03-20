import { createMCPServer } from "@lynq/lynq";
import { z } from "zod";
import { join } from "path";

import { VaulxClient } from "./vaulx-client.js";
import { NonceManager } from "./nonce-manager.js";
import { RetryQueue } from "./retry-queue.js";
import { loadConfig, getConfigDir } from "./config.js";
import { processAd } from "./tools/process-ad.js";
import { applyConfigure } from "./tools/configure.js";
import { getStats } from "./tools/get-stats.js";
import { configResourceContent } from "./resources/config.js";
import { statsResourceContent } from "./resources/stats.js";
import { PublicKey } from "@solana/web3.js";

const AdSlotSchema = z.object({
  ad_id: z.string(),
  screener_pubkey: z.string(),
  screener_signature: z.string(),
  curator_pubkey: z.string(),
  curator_signature: z.string(),
  impression_nonce: z.number(),
  context_hash: z.string(),
  timestamp: z.number(),
  content: z.object({
    type: z.enum(["text", "link", "rich"]),
    title: z.string(),
    body: z.string().optional(),
    cta_url: z.string().optional(),
    cta_text: z.string().optional(),
    icon_url: z.string().optional(),
  }),
  context_categories: z.array(z.string()),
});

let config = loadConfig();
const dbPath = join(getConfigDir(), "ad-mcp.db");
const vaulx = new VaulxClient(config.vaulx_endpoint, config.vaulx_auth_token);
const nonceManager = new NonceManager(dbPath);
const retryQueue = new RetryQueue(dbPath);

const server = createMCPServer({
  name: "ad-mcp",
  version: "0.1.0",
});

// --- Tools ---

server.tool(
  "process_ad",
  {
    description: "Process an ad slot: verify, sign, and submit impression to Solana",
    input: z.object({ ad_slot: AdSlotSchema }),
  },
  async (args, c) => {
    const result = await processAd({
      slot: args.ad_slot,
      vaulx,
      nonceManager,
      retryQueue,
      programId: new PublicKey(config.program_id),
      solanaRpc: config.solana_rpc,
    });
    return c.json(result);
  },
);

server.tool(
  "configure_ad",
  {
    description: "Configure ad processing settings",
    input: z.object({
      auto_sign: z.boolean().optional(),
      auto_submit: z.boolean().optional(),
    }),
  },
  async (args, c) => {
    config = applyConfigure(config, args);
    return c.json(config);
  },
);

server.tool(
  "get_ad_stats",
  {
    description: "Get ad processing statistics",
  },
  async (_args, c) => {
    const stats = getStats(dbPath);
    return c.json(stats);
  },
);

// --- Resources ---

server.resource(
  "ad://config",
  {
    name: "Ad MCP Config",
    description: "Current ad processing configuration",
    mimeType: "application/json",
  },
  async () => {
    return { text: configResourceContent(config) };
  },
);

server.resource(
  "ad://stats",
  {
    name: "Ad Processing Stats",
    description: "Ad processing statistics",
    mimeType: "application/json",
  },
  async () => {
    const stats = getStats(dbPath);
    return { text: statsResourceContent(stats) };
  },
);

// --- Start ---

await server.stdio();
