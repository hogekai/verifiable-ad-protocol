# Verifiable Ad Delivery Protocol

3者署名によるオンチェーン広告配信検証プロトコル。Solana上に実装。

広告主の$1がどこに行ったか100%追跡可能にする、エージェント環境のための広告インフラ。

## Why

デジタル広告市場（年間$700B超）は構造的な欠陥を抱えている。広告主の支出のうちパブリッシャーに届くのは30-50%。残りは中間業者5-6層で消失し、年間$84Bがアドフラウドで失われている。根本原因は「見た人間が署名手段を持たない」こと。

AIエージェントがウォレットを持つ時代が来る。x402/MCP層の決済が普及し、全参加者が署名可能になることで、この10年間解けなかった検証問題が初めて解ける。

## What

**Screener（選別者）・Curator（配信者）・Agent（受信者）の3者がそれぞれEd25519署名を行い、その署名セットをSolana上で検証・記録し、報酬を自動分配する。**

検証するのはdelivery（配信到達）。3者が独立した秘密鍵で署名した事実が、パブリッシャーの自己申告より構造的に強い暗号学的証明となる。

## Architecture

```
Advertiser → register_ad (on-chain) → Ad Registry
                                        ↓
Screener → fetch (RPC) → sign → Local DB
                                    ↓
Curator SDK → build AdSlot (dual-sign) → inject into MCP response
                                              ↓
Service MCP → AdSlot付きレスポンス → Agent (LLM)
                                              ↓
Ad MCP → wallet.signBytes → tx構築 → wallet.signAndSendRawTx
                                              ↓
Solana → Ed25519 ×3 verify → record_impression → 報酬分配
```

### コスト構造（per impression）

```
広告主 deposit から:
  ├── CPM報酬 = max_cpm / 1000
  │     ├── Protocol fee: 0.5%
  │     ├── Screener: declared_share %
  │     └── Curator: 残り
  └── Submission fee: 5,000 lamports（定数。payer に即時補填）
```

## Project Structure

```
programs/verifiable-ad-protocol/   Solana program (Anchor/Rust, ~1,100 lines)
packages/
  core/                            Protocol primitives (types, Borsh, PDA helpers)
  ad-mcp/                          Agent-side Ad MCP server
  curator-sdk/                     Curator SDK + ad() middleware
  screener/                        Local Screener (on-chain fetch, DB, signer)
  cli/                             Protocol CLI
demo/
  e2e.ts                           E2E demo (localnet + devnet)
  mock-mcp/                        Mock weather MCP with ad injection
```

## Quick Start

### Prerequisites

- [Solana CLI](https://docs.solanalabs.com/cli/install)
- [Anchor](https://www.anchor-lang.com/docs/installation) 0.31+
- Node.js 20+

### Build & Test

```bash
git clone https://github.com/hogekai/verifiable-ad-protocol
cd verifiable-ad-protocol
yarn install
yarn build:anchor            # Rust compile + IDL copy
anchor test                  # On-chain tests (starts local validator)
```

### E2E Demo

```bash
npx tsx demo/e2e.ts          # Full flow on localnet
npx tsx demo/e2e.ts --devnet # Full flow on devnet
```

### Live Demo with Claude Code

```bash
# 1. Setup devnet state
npx tsx demo/mock-mcp/setup.ts

# 2. Configure vaulx wallet (../vaulx)
# 3. Configure ad-mcp
# 4. Add MCPs to .mcp.json
# 5. Ask Claude Code: "東京の天気教えて"
#    → Weather response + ad slot → ad-mcp processes → on-chain record
```

See [demo/README.md](demo/README.md) for detailed setup.

## CLI

```bash
# Advertiser
ad-protocol advertiser deposit --amount 1           # SOL
ad-protocol advertiser register-ad --budget 0.5 --max-cpm 0.01 --max-screener-share 2000 --screeners <pubkey>
ad-protocol advertiser list-ads

# Screener
ad-protocol screener register --share-bps 1500 --endorsed-curators <pubkey>
ad-protocol screener sync-ads --db-path ./screener.db

# Curator
ad-protocol curator register --metadata-uri https://... --rate-limit 100

# Inspect
ad-protocol inspect ad <pubkey>
ad-protocol inspect config
ad-protocol inspect deposit <advertiser_pubkey>
```

## For MCP Server Developers

広告を自分の MCP サーバーに組み込むのは数行:

```typescript
import { ad } from "./ad-middleware";

const server = createMCPServer({ name: "my-service" });

server.use(
  ad({
    screenerSecretKey: ...,
    curatorSecretKey: ...,
    agentPubkey: ...,
    db: screenerDb,
    categories: ["IAB15"],
  }),
);
```

## On-Chain Program

12 instructions on Solana:

| Instruction | Description |
|---|---|
| `initialize_config` | Protocol singleton setup |
| `update_config` | Authority updates fee/treasury |
| `deposit_funds` | Advertiser deposits SOL |
| `register_ad` | Register new ad with budget/CPM/screeners |
| `update_ad` | Update ad settings |
| `register_screener` | Register as screener with share/curators |
| `update_screener` | Update screener settings |
| `register_curator` | Register as curator with metadata |
| `update_curator` | Update curator settings |
| `initialize_bitmap` | Create impression dedup bitmap |
| `record_impression` | **Core**: 3-sig verify + reward distribution |

## Status

**Phase 1 PoC: Complete**
- On-chain program: 6 account types, 12 instructions, Ed25519 3-party verification
- Off-chain: core, ad-mcp, curator-sdk, screener, CLI
- E2E: localnet verified, live demo with Claude Code confirmed

## Related Repositories

- [vaulx](https://github.com/hogekai/vaulx) — Agent wallet MCP server (Solana + EVM)
- [lynq](https://github.com/hogekai/lynq) — MCP server framework
- [iab-types](https://github.com/hogekai/iab-types) — IAB Tech Lab TypeScript types

## License

MIT