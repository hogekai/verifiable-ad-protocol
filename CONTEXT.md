# Verifiable Ad Delivery Protocol on Solana

## 設計文書 v5 — Phase 1 PoC 完了・Phase 2 準備用

**v4 → v5 の主な変更:**
- Phase 1 実装で確定した全 design decisions を反映
- AgentRegistry 削除、Fee payer permissionless、submission fee 分離
- Ad MCP ↔ wallet の localhost HTTP 通信（elicitation hook 廃止）
- Screener 署名リアルタイム生成、WalletProvider / ScreenerProvider abstraction
- 経済試算追加（submission fee breakeven、bitmap rent cost）
- GTM first 100 users path を具体化
- 未決定リストに判断基準（trigger）を明示

-----

## 1. なぜ（Why）

### 1.1 問題

デジタル広告（年間$700B超）は「見た側が署名できない」構造問題を持つ。パブリッシャーの自己申告に依存し、年間$84Bのアドフラウドと50-70%の中間搾取が常態化している。BAT/AdEx等の分散型広告もインプレッション検証がオフチェーン（バリデーター/ブラウザの自己申告）で、同じ信頼モデルに戻っている。10年間解けていない。

### 1.2 新しい前提

AIエージェントがウォレットを持つ時代が来る。MCP月間97Mダウンロード（2026年3月）。x402/AP2で決済インフラが整備され、エージェント経由でユーザーもウォレットアドレスを自然に保有する。

**この変化で初めて「全参加者が署名可能」になり、分散型広告の検証問題が解ける。** 本プロトコルはx402/AP2が敷いた決済インフラの上で、広告固有のdelivery検証を解く。

-----

## 2. 何を（What）

### 2.1 プロトコル概要

Screener（選別者）・Curator（配信者）・Agent（受信者）の3者がそれぞれEd25519署名を行い、その署名セットをSolana上で検証・記録し、報酬を自動分配する。

**検証するのはdelivery（配信到達）。** Agent署名は「MCPレスポンスを受信し、署名を生成した」という暗号学的に検証可能な事実の証明。viewability（視認）はAgent側UI層の責務でありprotocolスコープ外。

### 2.2 アーキテクチャ

**コア原則：署名はオフチェーン（コストゼロ）、オンチェーンは記録と決済のみ。全コスト広告主負担。**

```
Advertiser → register_ad (on-chain) → Ad Registry
                                        ↓
Screener → fetch (RPC) → filter → Local DB cache
                                        ↓
Curator SDK → build AdSlot → Screener署名① + Curator署名② → inject into MCP response
                                        ↓
Service MCP → AdSlot付きレスポンス → Agent (LLM)
                                        ↓
Ad MCP → wallet.signBytes(署名③) → tx構築 → wallet.signAndSendRawTx
                                        ↓
Solana → Ed25519 ×3 verify → record_impression → 報酬分配
```

**Phase 1 で確定した設計判断:**

- **Screener署名はリアルタイム生成。** canonical messageにagent_pubkey, impression_nonce, timestampが含まれるため事前署名不可。Phase 1はScreener/Curatorが同一プロセスでcreateAdSlot()内で両署名を生成。Phase 2でScreener API分離。
- **Agent事前登録は不要。** Ed25519署名自体がcryptographic proof。AgentRegistryは実装後に削除。
- **Ad MCP ↔ Wallet通信はlocalhost HTTP + auth token。** LLMを経由しない。MCP injection attackを構造的に排除。

**信頼の委譲モデル：** 広告主の操作は ① 広告登録 ② 信頼するScreenerを2-3個選ぶ。以上。コントラクトが自動検証する7項目: authorized_screeners含有、endorsed_curators含有、excluded_curators非含有、declared_share上限、agent≠screener/curator、bitmap重複、timestamp freshness。

### 2.3 コスト構造

**CPM報酬とsubmission feeは完全分離。**

```
広告主のdepositからの支出（per impression）:
  ├── CPM報酬（per_impression = max_cpm / 1000）
  │     ├── Protocol手数料: protocol_fee_bps %（Treasury）
  │     ├── Screener: declared_share_bps %（残りに対して）
  │     └── Curator: 残り全額
  └── Submission Fee: 5,000 lamports（定数）→ payer に即時補填

budget追跡: spent_lamports = CPM報酬のみ（submission_fee含まない）
```

**Submission fee breakeven 試算（SOL = $100）:**

```
submission_fee = 5,000 lamports = $0.0005

CPM $1.00 → per_impression = 10,000 lamports → fee/reward = 50%  ← breakeven
CPM $2.00 → per_impression = 20,000 lamports → fee/reward = 25%
CPM $5.00 → per_impression = 50,000 lamports → fee/reward = 10%  ← healthy
CPM $10   → per_impression = 100,000 lamports → fee/reward = 5%

結論: CPM $1.00 が breakeven。$5+ で healthy。
      agent-native ad は premium segment。display ad 業界平均 $2-10。
      $5 CPM を初期 target とする。
```

**Bitmap rent cost 試算（SOL = $100）:**

```
ImpressionBitmap account: 1,067 bytes
Solana rent-exempt: ~0.0079 SOL = $0.79 per chunk
Each chunk = 8,192 impressions

  per impression rent:    $0.79 / 8,192 = $0.000096
  10,000 impressions:     ~2 chunks = $1.58
  1,000,000 impressions:  ~122 chunks = $96.38

  payer: initialize_bitmap の signer（Phase 1 は agent/operator）
  回収: rent は recoverable（account close で取り戻せる）
       ※ close instruction は Phase 1 未実装。Phase 2 で追加（P2-13）。
```

**Fee payer はpermissionless。** `payer: Signer` に制約なし。submission_feeがdepositからpayerにatomic補填される（ERC-4337 bundler patternと同構造）。

### 2.4 3者の役割

**Screener（選別者）：** on-chainからAd Registry取得、詐欺/低品質フィルタ（Phase 1 stub）、declared_shareをオンチェーン宣言、endorsed_curatorsで品質管理、rate_limit_max_per_windowをCuratorごとに設定。Phase 2でephemeral keyによるfee payer relay。インセンティブ: CPMのdeclared_share%。

**Curator（配信者）：** Screener DBから広告取得、コンテキストマッチング、curator-sdkのad() middlewareでMCPレスポンスにAdSlot注入、Screener署名①+Curator署名②をリアルタイム生成。インセンティブ: CPMの残り全額。

**Agent（受信者）：** 事前登録不要。MCPレスポンスのad_slotsを認識→Ad MCPのprocess_adを呼ぶ。Ad MCPがwalletと直接通信で署名③生成+submit。Freemiumモデルで署名動機を付与。

### 2.5 Curator Metadata

CuratorAccountにmetadata_uri（最大200文字）。on-chainにはURIのみ。Phase 1: HTTPS URL。Phase 2: IPFS/Arweaveでimmutable storage。

### 2.6 価格決定モデル

```
Ad Registry（広告主）: max_cpm, max_screener_share
Screener（宣言）:      declared_share（≤ max_screener_share。コントラクトが強制）
Curator（市場選択）:    declared_shareが低いScreenerを選ぶ経済的動機 → 競争圧力
```

### 2.7 不正防止メカニズム（Phase 1 実装済み）

**ハードな制約:**
- Bitmap重複防止: 1,024 bytes/chunk × 8,192 impressions/chunk。impression_nonceからbit位置を計算
- Curator rate limit: CuratorAccount.rate_limit_max_per_window（デフォルト100/~1分）
- Ad hourly cap: AdAccount.max_impressions_per_hour（デフォルト10,000。広告主設定可能）
- Timestamp freshness: ±5分/1分
- Agent identity: agent ≠ screener ≠ curator

**スラッシュ機構:** Phase 1はスロットのみ（slashable: bool, staked_amount: u64）。Phase 2で実装。

### 2.8 Ad MCP + Wallet通信

localhost HTTP + WALLET_AUTH_TOKEN。LLM非経由。WalletProvider interface: HttpWalletProvider（vaulx等）+ LocalKeypairProvider（テスト用）。任意のwalletと連携可能。

-----

## 3. 市場戦略

### 3.1 「ゼロの場所に1円を生む」

既存の広告予算を奪うのではなく、MCPサーバー運営者の「無料か有料か」の二択に「広告付き無料プラン」を持ち込む。

### 3.2 GTM: first 100 users path

```
Phase A（month 1-2）: Seed — 10 MCP servers
  → 自分のリポジトリ（lynq, vaulx）+ 知人の MCP 開発者にdirect reach out
  → curator-sdk の npm install + ad() middleware 3行で統合できることを示す
  → 最初の「広告」は開発者ツール同士のクロスプロモーション（CPM不要。exposure交換）
  → 目標: 10 MCP servers が curator-sdk を integrate

Phase B（month 3-4）: Validate — 100 impressions/day
  → seed MCP servers に実トラフィックが流れることを確認
  → CLI の inspect で on-chain 実績を見せる（transparency の proof）
  → Screener を1人外部から招く（indie developer。quality filter の分散化）
  → CPM クロスプロモーション開始（$1-5 CPM。SOL建て）

Phase C（month 5-6）: Scale — 100 MCP servers
  → npm download 数 + GitHub stars で organic growth
  → MCP directory / marketplace に listing
  → 外部 advertiser を1社獲得（dev tool company。$5+ CPM）
  → 目標: 100 MCP servers, 1,000 impressions/day, 1 external advertiser
```

### 3.3 収益モデル

**Protocol手数料** — 0.5%（protocol_fee_bps）。Treasury（Phase 1: authority管理。Phase 2以降: DAO移行）。ツール・ダッシュボードはオープンソース。

**独自トークンはPhase 1-2で導入しない。** SOL/USDCで全機能が動作する設計。

-----

## 4. 技術資産

### 4.1 Phase 1 実装物

| パッケージ | 行数 | 役割 |
|---|---|---|
| programs/verifiable-ad-protocol | ~1,100 | Solana Program（Anchor/Rust）。12 instructions, 6 account types |
| packages/core | ~300 | Protocol primitives（types, Borsh serialize, PDA helpers, IDL） |
| packages/ad-mcp | ~800 | Agent側 Ad MCP server（process_ad, WalletProvider, retry queue） |
| packages/curator-sdk | ~200 | Curator SDK（CuratorClient, ad() middleware, ScreenerProvider interface） |
| packages/screener | ~300 | Local Screener（on-chain fetch, SQLite DB, signer） |
| packages/cli | ~500 | Protocol CLI（advertiser, screener, curator, inspect） |
| demo/ | ~600 | E2E demo + mock weather MCP + setup scripts |

### 4.2 既存リポジトリ

| リポジトリ | 行数 | 本プロジェクトでの活用 |
|---|---|---|
| lynq | ~13,600 | MCPサーバーフレームワーク。ad() middlewareの基盤 |
| vaulx | ~7,200 | エージェントウォレットMCP。sign_bytes + raw tx submit |
| iab-types | - | IAB Tech Lab型定義。カテゴリ参照 |
| trawl / adelv / vide | ~42,400 | OpenRTB/広告配信/動画の参考実装 |

### 4.3 実証済みの動作

- E2E localnet完走: 3者署名検証 + 報酬分配の数値検証
- Claude Code live demo: 実AIエージェントがmock MCPから広告受取→on-chain記録
- 報酬検証: Screener 1,492 / Curator 8,458 / Protocol 50 / Submission 5,000 lamports

-----

## 5. 競合分析

### 5.1 ポジショニング

| | 決済 | 配信 | Delivery検証 | 費用追跡 | Agent対応 | MCP層 |
|---|---|---|---|---|---|---|
| x402（Coinbase） | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| AP2（Google+x402）| ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| BAT/Brave | ✅ | △ | △ | ❌ | ❌ | ❌ |
| AdEx | ✅ | ✅ | △ | ❌ | ❌ | ❌ |
| Google Ads/Prebid | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **本プロジェクト** | ✅ | ✅ | **✅** | **✅** | **✅** | **✅** |

### 5.2 技術比較

**BAT Attention Proof vs 本プロトコル:**

BATはBraveブラウザ内でattention（タブフォーカス、スクロール位置）をローカル計測し、ブラウザが集計結果を自己申告する。trust anchorはBrave 1者。Brave以外では動作しない（クライアントロックイン）。viewability寄りのモデル。

本プロトコルは3者の独立した秘密鍵によるEd25519署名でdeliveryを証明する。trust anchorは独立3者。任意のMCPクライアントで動作し、クライアント非依存。per-impressionでon-chain検証。

**AdEx OUTPACE vs 本プロトコル:**

OUTPACE（Off-chain Unidirectional Trustless Payment Channel）はバリデーターネットワークがimpressionをoff-chainで集計し、定期的にon-chainにcommitmentを提出する。バリデーターの過半数がhonestであるBFT仮定に依存。impression単位のon-chain検証はなく、バッチ集計のみ。

本プロトコルはimpression単位でon-chain検証（Ed25519 ×3 per tx）。検証の粒度が根本的に異なる。OUTPACEはthroughput優先（バッチ）、本プロトコルはverification優先（per-impression）。throughputはPhase 3のL2移行で解決する。

**要約:**

```
                BAT              AdEx OUTPACE        本プロトコル
検証モデル      ブラウザ自己申告   バリデーターBFT     3者独立署名
検証粒度        セッション集計     バッチcommitment    per-impression on-chain
Trust anchor    Brave 1者         バリデーター群       独立3者（Screener/Curator/Agent）
クライアント    Brave限定          汎用                MCP任意
スコープ        viewability寄り   delivery（集計）     delivery（per-impression）
```

-----

## 6. ロードマップ

### Phase 1：PoC（Solana localnet）— 完了

12 instructions, 6 account types, Ed25519 3者署名検証, 報酬分配, Bitmap重複防止, rate limit, hourly cap, submission fee。packages: core, ad-mcp, curator-sdk, screener, cli。E2E localnet完走。Claude Code live demo確認。

**Phase 1で棄却:** AgentRegistry、Dynamic submission fee、Protocol gas pool、Elicitation hook、Agent側NonceManager。

### Phase 2：初期運用（devnet → mainnet）

Authority multisig化、Config timelock、Screener ephemeral key relay、外部Screener参入、Agent-native Ad Spec策定、npm公開、CPMクロスプロモーション開始。

### Phase 3：スケール（SVM Rollup）

L2移行（日次10万件超で判断）、ガバナンストークン導入、DAO化。

-----

## 7. 未解決事項

**各項目にtrigger（着手条件）を明示。triggerを満たすまでは着手しない。**

### Phase 2 Must（mainnet前に必須）

| ID | 項目 | Trigger |
|---|---|---|
| P2-2 | Authority → Multisig | mainnet deploy前 |
| P2-4 | Config変更のtimelock | mainnet deploy前 |
| P2-11 | Screener relay endpoint（burl pattern） | 外部Agent（SOLなし）参加時 |

### Phase 2 Should

| ID | 項目 | Trigger |
|---|---|---|
| P2-1 | Agent-native Ad Spec | 外部advertiser 1社目の契約時 |
| P2-5 | vaulx elicitation security | vaulxがmainnet SOLを扱う時 |
| P2-10 | Data consent / opt-in | EU圏agentが参加する時 |
| P2-12 | Screener API latency/availability要件 | Screener別プロセス分離時 |

**P2-12 要件定義:**

```
POST /ads/query:  p99 < 200ms, availability 99.5%, rate limit 1,000 req/s per Curator
POST /ads/sign:   p99 < 100ms, availability 99.5%, idempotent
Failure mode:     Screener down → Curatorは広告なしで返す（graceful degradation）
                  Screener slow → 200ms timeout → 広告なしで返す
                  Service MCP自体の可用性に影響しない設計が必須
```

### Phase 2 Nice-to-have

| ID | 項目 | Trigger |
|---|---|---|
| P2-3 | Submission fee動的化 | L2移行設計と同時。base fee大幅変動時 |
| P2-6 | AI提供者アテステーション | Sybil月間損失 > 対策コスト時 |
| P2-7 | DAO / Token | v4記載の5条件全達成時 |
| P2-8 | L2（SVM Rollup） | 日次impression > 100K or fee比率 > 20% |
| P2-9 | Agent事前登録の再検討 | P2-6と連動。単独復活なし |
| P2-13 | Bitmap close instruction | bitmap rent total > $100/advertiser時 |

### 技術的未解決事項

**7.1 Screener ↔ Curator Protocol（wire protocol）**

DB schemaはimplementation detail。定義すべきはwire formatのみ:

```
POST /ads/query
  Request: { context_categories, curator_pubkey, agent_pubkey, max_results }
  Response: { ads: [{ ad_id, advertiser, max_cpm_lamports, content, context_categories }] }

POST /ads/sign
  Request: { ad_id, curator_pubkey, agent_pubkey, impression_nonce, context_hash, timestamp }
  Response: { screener_signature, screener_pubkey }
```

curator-sdkはScreenerProvider interfaceで抽象化:
- Phase 1: LocalScreenerProvider（同一プロセス、DB直接）
- Phase 2: HttpScreenerProvider（HTTP API、Screener別プロセス）

**7.2 Nonce管理**
Phase 1: ランダムnonce（chunk 0内、衝突確率許容）。Phase 2候補: Screener APIのnonce発行機能、またはad_id+agent+timestampからdeterministic生成。

**7.3 L2移行** — SVM Rollupシーケンサー選定、ブリッジ設計。AnchorコードはSVM互換で書き直し不要。

**7.4 Auth token管理** — Phase 1: file-based。Phase 2: OS keychain統合。

-----

## 8. 参考資料

### プロトコル・仕様
- OpenRTB 3.0 / AdCOM 1.0 — IAB Tech Lab
- MCP — Anthropic → Linux Foundation AAIF
- x402 — Coinbase、AP2 — Google + x402、A2A — Google → AAIF

### Solana
- Ed25519 Program、SVM Rollup（Sonic, Eclipse）

### 分散型広告
- BAT Whitepaper — Brave Software (2021)
- AdEx OUTPACE — Off-chain Unidirectional Trustless Payment Channel

### 自己リポジトリ
- https://github.com/hogekai/verifiable-ad-protocol
- https://github.com/hogekai/vaulx
- https://github.com/hogekai/lynq
- https://github.com/hogekai/iab-types