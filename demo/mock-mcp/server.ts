#!/usr/bin/env tsx

/**
 * Mock MCP Server — a simple "weather" service that injects ads via ad() middleware.
 *
 * This demonstrates how any MCP server can integrate the Verifiable Ad Protocol
 * by adding the ad() middleware with a few lines of configuration.
 *
 * Prerequisites:
 *   1. Run `npx tsx demo/mock-mcp/setup.ts` first to create on-chain state
 *   2. .state.json must exist in this directory
 */

import { createMCPServer } from "@lynq/lynq";
import { z } from "zod";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { ScreenerDb } from "@verifiable-ad-protocol/screener";
import { ad } from "./ad-middleware.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(__dirname, ".state.json");

// Load state from setup script
let state: any;
try {
  state = JSON.parse(readFileSync(STATE_PATH, "utf-8"));
} catch {
  console.error("Error: .state.json not found. Run setup.ts first:");
  console.error("  npx tsx demo/mock-mcp/setup.ts");
  process.exit(1);
}

// Agent pubkey from env (set in .mcp.json)
const agentPubkey = process.env.AGENT_PUBKEY;
if (!agentPubkey) {
  console.error("Error: AGENT_PUBKEY env var required (agent's wallet address)");
  process.exit(1);
}

// Set up Screener DB with the demo ad
const db = new ScreenerDb(":memory:");
db.upsertAd({
  ad_id: state.ad_id,
  advertiser: state.advertiser,
  ad_index: 0,
  max_cpm_lamports: 10_000_000,
  max_screener_share_bps: 2000,
  content: state.ad_content,
  context_categories: state.context_categories,
  is_active: true,
});

// Create MCP server
const server = createMCPServer({
  name: "mock-weather",
  version: "0.1.0",
});

// Apply ad middleware globally
server.use(
  ad({
    screenerSecretKey: Uint8Array.from(
      Buffer.from(state.screener_secret_key, "base64"),
    ),
    curatorSecretKey: Uint8Array.from(
      Buffer.from(state.curator_secret_key, "base64"),
    ),
    agentPubkey,
    db,
    categories: ["IAB15"],
  }),
);

// --- Tools ---

server.tool(
  "get_weather",
  {
    description: "Get current weather for a city",
    input: z.object({
      city: z.string().describe("City name"),
    }),
  },
  async (args, c) => {
    // Mock weather data
    const weather: Record<string, { temp: number; condition: string }> = {
      tokyo: { temp: 22, condition: "Partly Cloudy" },
      "new york": { temp: 18, condition: "Sunny" },
      london: { temp: 14, condition: "Rainy" },
      paris: { temp: 16, condition: "Overcast" },
    };

    const city = args.city.toLowerCase();
    const data = weather[city] ?? { temp: 20, condition: "Clear" };

    return c.text(
      `Weather in ${args.city}: ${data.temp}°C, ${data.condition}`,
    );
  },
);

server.tool(
  "get_forecast",
  {
    description: "Get 3-day weather forecast for a city",
    input: z.object({
      city: z.string().describe("City name"),
    }),
  },
  async (args, c) => {
    return c.text(
      [
        `3-Day Forecast for ${args.city}:`,
        `  Today:    22°C, Partly Cloudy`,
        `  Tomorrow: 24°C, Sunny`,
        `  Day 3:    19°C, Light Rain`,
      ].join("\n"),
    );
  },
);

// Start
await server.stdio();
