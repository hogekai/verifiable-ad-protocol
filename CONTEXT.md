# Verifiable Ad Delivery Protocol on Solana

## アイデア詳細文書 v4 — 概念検証・提案準備用

-----

## 1. なぜ（Why）

### 1.1 広告インフラの構造的問題

デジタル広告市場は年間$700B超の規模を持つが、その技術インフラは構造的な欠陥を抱えている。

**寡占構造：** Google/Metaが広告配信・計測・決済の全レイヤーを垂直統合で支配している。パブリッシャーや広告主は、これらの企業が提供するブラックボックスに依存せざるを得ない。IMA SDK（Interactive Media Ads SDK）のような古いプロトコルが事実上の唯一の選択肢となっており、技術的代替が存在しない。

**広告費の不透明な消失：** プログラマティック広告のサプライチェーンは中間業者が5-6層あり、広告主の$1のうちパブリッシャーに届くのは$0.30-0.50。残りがどこでどう抜かれたか追跡できない。年間$84Bがアドフラウド（広告詐欺）で失われている。根本原因は「見た人間」がウォレットを持たず署名する手段がないため、検証が構造的に不可能であること。

**Prebidの技術的負債：** オープンソースのヘッダービディングソリューションであるPrebidは代替を試みたが、既存のOpenRTBエコシステムの上に構築されたため、構造的問題を解決するには至っていない。

### 1.2 分散型広告の試みと失敗

BAT/Brave、AdEx、Adshares等の分散型広告プロジェクトは過去10年間試みられてきたが、全プロジェクトに共通する構造的欠陥がある：

1. **インプレッション検証がオフチェーン** — 決済だけオンチェーン、検証はバリデーターやブラウザの自己申告。既存広告と同じ信頼モデルに戻っている
1. **ブラウザ/特定クライアントにロックイン** — 汎用性がない
1. **チキン・アンド・エッグ問題** — パブリッシャーが乗り換える理由がない

**これらの失敗は10年間繰り返されている。根本原因は「見た側が署名手段を持たない」という前提が変わらなかったこと。**

### 1.3 新しい前提：ウォレットの自然な普及と署名可能な参加者

AIエージェントが情報消費の主体になりつつある。MCP（Model Context Protocol）は2026年3月時点で月間97Mダウンロード（Python + TypeScript合計）に達し、Anthropic/OpenAI/Google/Microsoft/Amazonが採用。Linux FoundationにAAIF（Agentic AI Foundation）が設立され、業界標準のインフラとなった。

**x402やMCP層の決済が普及することで、エージェントがウォレットを持つことが当たり前になる。** Coinbase/Google/Cloudflareがこのインフラを急速に整備しており、エージェント経由で一般ユーザーもウォレットアドレスを自然に保有する時代が来る。入金は不要。アドレスだけ持っていれば署名ができる。

**この変化がもたらす新しい前提：**

- **全参加者が署名可能になる** — 「見た」の自己申告ではなく、署名で証明できる
- **ステートフルなセッション** — MCP層でツール・リソース・タスク単位の操作が可能
- **プライバシー問題が構造的に解消** — ウォレットアドレスだけで参加でき、個人情報の漏洩リスクがない

**この前提の変化により、分散型広告が10年間解けなかった検証問題が初めて解ける。**

### 1.4 MCP層とHTTP層の補完関係

x402プロトコルはHTTP 402 Payment Requiredステータスコードを使ったオープン決済プロトコル。Cloudflare、Circle、Stripe、AWSがバック。しかしx402はHTTP層の決済であり、URL単位の課金に限定される。MCP層ではツール単位・リソース単位・タスク単位の課金が可能で、セッション内コンテキストも扱える。

広告はステートフルな体験（インプレッション→エンゲージメント→コンバージョン）であり、MCPのセッション内でこそ、ツールアクセスと引き換えに署名させるFreemiumモデルが自然に組み込める。

**x402とMCP層は競合ではなく補完関係。** x402/AP2が決済インフラを敷き、本プロトコルがその上で広告固有の検証問題を解く。

-----

## 2. 何を（What）

### 2.1 プロトコル概要

エージェント環境における広告配信のための、3者署名によるオンチェーン検証プロトコル。Solana上に実装。

**コアとなる主張：** 広告費の流れが完全に可視化される史上初のプロトコル。広告主の$1がどこに行ったか100%追跡可能。全参加者が署名可能であるという新しい前提を活かし、3者署名モデルにより、既存広告では構造的に不可能だったインプレッション検証のオンチェーン化を実現する。

**検証スコープの明示：本プロトコルが検証するのはdelivery（配信到達）であり、viewability（視認）ではない。**

Agent署名は「広告を人間が見た」の証明ではなく「MCPレスポンスを受信し、署名を生成した」という暗号学的に検証可能な事実の証明。視認検証はAgent側UI層の責務であり、プロトコルのスコープ外。3者が独立した秘密鍵で署名しているという事実は、パブリッシャーが一方的に「表示しました」と報告する現行モデルより構造的に強い。既存広告のviewabilityの定義も「ピクセルの50%が1秒間ビューポートに入った」程度の近似であり、業界全体が近似で動いている。本プロトコルは「既存の自己申告より厳密な、暗号学的に検証可能なdelivery証明」を提供する。

### 2.2 アーキテクチャ

**コア原則：署名はオフチェーン（コストゼロ）、オンチェーンは記録と決済のみ。記録の主体はAgent。全コスト広告主負担。**

```
広告主 → Ad Registry（Solanaプログラム）に広告登録
   │       ├── budget（予算）
   │       ├── authorized_screeners（承認済みScreener一覧）
   │       ├── excluded_curators（配信拒否Curator一覧）
   │       ├── max_cpm（インプレッション単価上限）
   │       └── max_screener_share（Screener取り分上限）
   ↓
Screener → Ad Registryから広告取得 → 詐欺・低品質フィルタ → DB構築
   │       ├── 署名①「この広告は正当である」（オフチェーン）
   │       ├── declared_share（自身の報酬比率宣言、max_screener_share以下）
   │       ├── コンテキストマッチング（広告主のmax_cpm上限内で適切な広告を選定）
   │       └── endorsed_curators（品質保証するCurator一覧）
   │       → 署名①をCuratorに渡す
   ↓
Curator（MCP/AIサービス） → DBから広告選定 → エージェントに配信
   │       └── 署名②「このエージェントにこの広告を配信した」（オフチェーン）
   │       → 署名①②＋広告データをAgentに渡す
   ↓
Agent（エージェント+ウォレット） → 商業情報を受信・処理
   │       └── Agent（LLM）が ad slot を認識 → Ad MCP.process_ad(slot) を呼ぶ
   ↓
Ad MCP（広告専用MCPサーバー） → vaulx と localhost HTTP で直接通信（LLM経由しない）
   │       ├── canonical message 構築 + SHA-256 hash
   │       ├── vaulx HTTP: /api/sign-bytes → Agent 署名③取得
   │       ├── Ed25519 ixs + record_impression ix → tx 組立
   │       └── vaulx HTTP: /api/sign-and-send-raw-transaction → submit
   │       → fee payer = 誰でもよい（permissionless）
   │         submission_feeがdepositからpayerに即時補填（atomic）
   ↓
Solanaプログラム → 署名セットを検証 → 報酬自動分配
```

**信頼の委譲モデル（広告主から見た操作は2ステップ）：**

広告主の操作は ① 広告の登録（budget, max_cpm, max_screener_share, excluded_curators）と ② 信頼するScreenerを2-3個選ぶ、以上。Curatorの存在を意識する必要すらない。既存広告のads.txt → sellers.json → supply chainと同構造の信頼チェーン。

**コントラクトの検証ロジック：**

1. screener が ad.authorized_screeners に含まれるか
1. curator が screener.endorsed_curators に含まれるか
1. curator が ad.excluded_curators に含まれていないか
1. screener.declared_share <= ad.max_screener_share か
1. agent が screener/curator と異なるアドレスか
1. 重複クレームがないか
1. depositに報酬+submission_feeの残高があるか

**記録の主体がAgentである理由：**

Curatorにバッチ提出を委ねると、署名の選択的除外、提出タイミングの操作、バッチ内容の不透明性、Curator消失リスクが生じる。これらは既存広告のパブリッシャー自己申告と同じ信頼モデルへの回帰を意味する。Agentが記録主体であることで、Agentがオンチェーンに書き込まない限りインプレッションが存在しない。Curatorがダミーインプレッションを量産しても、Agentが記録しなければカウントゼロ。不正の立証責任が構造的に逆転する。

### 2.3 コスト構造

**全コスト広告主負担。他の全参加者はコストゼロで参加できる。**

```
広告主のdepositからの支出（per impression）:
  ├── CPM報酬（per_impression = max_cpm / 1000）
  │     ├── Protocol手数料: protocol_fee_bps %（Protocol Treasury）
  │     ├── Screener: declared_share_bps %（手数料控除後に対して）
  │     └── Curator: 残り全額
  └── Submission Fee（CPM報酬とは完全に別枠）
        └── payer（tx提出者）に即時補填: SUBMISSION_FEE_LAMPORTS = 5,000 lamports（プログラム定数）
        └── Solana base feeがほぼ固定のため動的調整は不要。変更時はプログラムupgradeで対応

budget追跡:
  spent_lamports = CPM報酬のみ追跡（submission_feeは含まない）
  budget超過判定 = spent_lamports <= budget_lamports

参加者別コスト：
  広告主:   deposit全額（CPM報酬 + submission_fee）
  Screener: ゼロ（fee payerになる場合もsubmission_feeで即回収）
  Curator:  ゼロ
  Agent:    ゼロ（SOL持ちなら直接submitも可能、submission_feeで即回収）

Fee payer（protocolレベルでは誰でも可。制約なし）:
  - Agent直接: SOLがあれば。relay不要で最速
  - Protocol relay: 運営が提供するconvenience layer
  - Screener relay: Screenerが自前infraで提供
  - 任意の第三者: permissionless
```

**ガス代の実計算（Phase 1：1tx = 1署名セット）：**

Solanaのオンチェーンコストは2種類存在する。

**① tx fee（トランザクション手数料）：** バリデーターに支払う処理料。約$0.0002/tx。

**② rent-exempt deposit（アカウント保管料）：** Solanaはオンチェーンにデータを永続化する際、アカウントを作成しrent-exempt minimum（家賃免除のための最低残高）を預ける必要がある。アカウントサイズ360 bytes（署名セット級）で約0.00275 SOL ≈ $0.39。1 impressionにつき1アカウント（PDA）を作成するとコスト比率が破綻する。

**重複防止の設計：Bitmapアカウント方式**

1 impressionにつき1 PDAを作成するのではなく、広告主単位のBitmapアカウント（大きなbitフラグ配列）を1つ作成し、各impressionに対応するbit位置をフラグ立てする。Bitmapのrent-exemptコストは初期化時に1回だけ発生し、impression数に対する按分コストは無視できる水準（~$0.000001/impression）になる。

```
Phase 1のimpression記録コスト:
  tx fee:       $0.0002/impression
  rent按分:     ~$0.000001/impression（Bitmap方式）
  合計:         ~$0.0002/impression

  $10 CPM（≈1.5円/impression）に対して → 2%
  $2 CPM（≈0.3円/impression）に対して → 10%

低CPM帯ではガス比率が上がるが、Phase 1の検証段階では許容範囲。
Phase 3のL2移行でtx fee自体を1/10〜1/100に圧縮する。
```

**既存広告とのコスト比較：**

```
既存プログラマティック広告：
  広告主 $1.00 → パブリッシャーに届くのは $0.30-0.50（50-70%が中間で消失）

本プロトコル（Screener declared_share 15%の場合）：
  広告主 $1.00 → Curator（≒パブリッシャー）に $0.84
  内訳：Screener 15% + Curator 84% + プロトコル手数料 0.5-1% + ガス代
  → 全フローがオンチェーンで追跡可能
```

**スケーリング戦略（State Compression棄却の理由）：**

Solana State Compression（Concurrent Merkle Tree）はコスト圧縮手段として有力に見えるが、本プロトコルの設計哲学と構造的に矛盾する。State Compressionではオンチェーンにroot hashのみを保持し、leafデータの取得をオフチェーンIndexer（Helius, Triton等のDAS APIプロバイダー）に依存する。

本プロトコルは「検証可能性の完全なオンチェーン担保」を存在理由としている。報酬クレームにIndexerの可用性が必要な構造は、Curatorへのバッチ提出委託（2.2で棄却済み）と同種の信頼依存を再導入することになる。Indexerの選択的データ返却拒否、遅延、消失リスクは、既存広告の「プラットフォーム依存」と構造的に等価である。

したがって、スケーリング戦略はState Compressionではなく、Phase 3でのプロトコル専用SVM Rollup（L2）移行を本線とする（6章参照）。L2ではデータ本体がL2チェーンのstate storageに完全に保持され、検証可能性がL2レベルで自己完結する。

### 2.4 3者の役割

**Screener（選別者）：**

- Ad Registryからオンチェーンの広告登録データを取得
- 詐欺広告、低品質広告をフィルタリング
- Curatorが使える品質保証済みDBを構築
- コンテキストカテゴリと広告のマッチング（広告主のmax_cpm上限内）
- 署名で「この広告は正当」と保証
- `declared_share`（自身の報酬比率）をオンチェーンで宣言。広告主の `max_screener_share` を超える宣言はコントラクトが弾く
- 自分が品質基準を満たすと判断したCuratorを `endorsed_curators` として管理
- **インセンティブ：** CPMの `declared_share` %。質の悪いCuratorを保証すると広告主から外される

**Curator（配信者）：**

- ScreenerのDBからエージェント/ユーザーに適した広告を選定
- MCPツールのレスポンスにcommercial slotを含めて配信
- 署名で「このエージェントに配信した」と証明
- 署名①②と広告データをAgentに渡す（Agentがオンチェーン記録するため）
- どのScreenerと組むかを選択する。`declared_share` が低いScreenerを選べば自身の取り分が増える。ただし品質の高いScreener（良い広告案件を持つ）ならdeclared_shareが高くても組む経済的動機がある
- **インセンティブ：** CPMの残り（= 100% - declared_share - protocol_fee）

**Agent（受信者・記録者）：**

- エージェントウォレット（vaulx）で署名を生成
- **オンチェーン記録の主体：** Ad MCP が vaulx と連携し、署名 + tx組立 + submit を自動処理。失敗時はローカルDBに保存しリトライ
- **事前登録不要。** Ed25519署名のみで参加可能（AgentRegistryは不要）
- Fee payerは誰でもよく（permissionless）、submission_feeがdepositから即時補填される
- **署名の動機：** CuratorのMCPツールへのフルアクセスに対する対価。「署名なし→制限付きコンテンツ」「署名あり→広告付きフルアクセス」のFreemiumモデル
- **ユーザー報酬について：** Agent側への報酬分配はSybil Attack（ダミーAgent量産による報酬搾取）対策の複雑性から棄却

### 2.5 Curator Registry（メディア情報の紐付け）

Ad RegistryとScreener Registryに加え、Curatorの公開プロフィールをオンチェーンレジストリとして管理する。広告主がexcluded_curatorsを設定するにも、Screenerがendorsed_curatorsを選ぶにも、Curatorの情報が可視化されていなければ判断できない。

```
Curator Registry（オンチェーン）:
  ├── curator_pubkey: Pubkey
  ├── metadata_uri: String              // オフチェーンのメタデータURL
  ├── registered_at: i64
  └── total_verified_impressions: u64   // プロトコルが自動カウント

メタデータ（オフチェーン、URIで参照）:
  ├── name: String                      // MCPサーバー名
  ├── description: String
  ├── mcp_endpoint: URL                 // MCPサーバーのエンドポイント
  ├── content_categories: []            // IAB Content Taxonomy準拠
  ├── supported_ad_formats: []
  └── contact: String（任意）
```

**オンチェーンに載るのは `curator_pubkey`、`metadata_uri`、`registered_at`、`total_verified_impressions` のみ。** メタデータ本体はオフチェーン（IPFS、Arweave、または通常のHTTPSエンドポイント）に保持し、URIで参照する。`total_verified_impressions` はプロトコルが署名セット検証時に自動でインクリメントし、Curatorの実績として公開される。

**このレジストリは無料で誰でも参照できる。** ウォレットアドレスとメディア情報の紐付けはプロトコルのレジストリ機能であり、SaaSではない。

### 2.6 価格決定モデル：3層構造

**「広告主が上限を、Screenerが宣言を、Curatorが選択を」の3層で価格と報酬が決まる。**

```
Ad Registry（広告主が設定）:
  max_cpm: u64              // CPM上限
  max_screener_share: u16   // Screener取り分上限（例：20%）

Screener Registry（Screenerがオンチェーンで宣言）:
  declared_share: u16       // 自身の取り分（例：15%、max_screener_share以下）

Curator（市場選択）:
  Screenerの declared_share を見て、どのScreenerと組むか選ぶ
```

**なぜこれで回るか：**

- 広告主は `max_screener_share` で中抜き上限のガードレールを敷く
- Screenerは `declared_share` をオンチェーンで宣言。公開されているため隠せない
- Curatorは取り分が多いScreenerを選ぶ経済的動機がある → Screener間に `declared_share` を下げる競争圧力がかかる
- Screenerはフィルタリング品質で差別化できるため、品質が高ければ多少高い `declared_share` でもCuratorが付く

**コントラクトレベルの保証：** `screener.declared_share <= ad.max_screener_share` をコントラクトが強制。Screenerが広告主の上限を超える比率を取ることは構造的に不可能。

将来的にはScreenerのDB内で入札競争（オークション）を導入可能。

### 2.7 ユーザーデータとターゲティング

**プロトコルのデフォルトはデータなし。コンテキストターゲティングをベースとする。**

Curatorは「このAgentがどのMCPツールを呼んだか」「どんなクエリを投げたか」というセッション内コンテキストを知っている。これは個人情報ではない。CuratorがこのコンテキストをIAB Content Taxonomyに基づいてカテゴリ化し、Screenerはカテゴリごとに広告をマッチングする。

オンチェーンに載るものはウォレットアドレス + コンテキストカテゴリのハッシュのみ。個人情報は一切不要。

**オプトインによるデータ共有（プロトコルは機構のみ提供）：**

Agent署名時のオプションフィールドとして `data_consent: bool`（デフォルト false）、`data_endpoint: URL`、`data_scope: enum []` を用意。プロトコルは `data_consent` のboolフラグとそのオンチェーン記録のみを提供する。データの中身、インセンティブの額、交換条件は全てScreenerとAgentの二者間の話でプロトコルは関与しない。

オプトインの同意証拠がオンチェーンに残るため、Screenerが「ユーザーが同意した」と嘘をつけない。GDPRの同意証明がブロックチェーン上にある状態。

`data_consent: false` がデフォルトであることは不変。この機構を使うScreenerはSybil対策を自前で実装する責任がある。

### 2.8 不正防止メカニズム

**コアの防御：3者相互監視構造 + Agentによる記録主体**

Agentがオンチェーン記録の主体であることが、最も強い構造的防御。加えて、信頼の委譲モデルにより全参加者が互いの不正を監視する経済的動機を持つ。

- **Curatorが不正**（ダミーAgent量産、水増し等）→ ダミーAgentが記録するガス代は広告主budgetから出るため、budgetの異常消費として可視化される → 広告主がScreenerに通知 → endorsed_curatorsから除外 → 収益ゼロ
- **Screenerが不正**（悪質Curator放置等）→ 広告主がauthorized_screenersから除外 → Screener配下の全Curatorも連鎖的に収益喪失
- **Screener-Curator結託** → 広告主がScreenerごと除外 → 両者の収益ゼロ
- **広告主が不正**（詐欺広告）→ Screenerがフィルタで弾く

**ハードな制約（PoCから実装）：**

- **Curator rate limit：** CuratorAccountに `rate_limit_max_per_window` を保持。Curatorごとに設定可能（register_curator / update_curatorで変更）。デフォルト100 impressions / ~1分（DEFAULT_RATE_LIMIT_WINDOW_SLOTS = 150 slots）。ウィンドウ超過で `RateLimitExceeded` エラー
- **Ad hourly cap：** AdAccountに `max_impressions_per_hour` を保持。広告主がregister_ad / update_adで設定。デフォルト10,000 / hour（SLOTS_PER_HOUR = 9,000 slots）。超過で `AdRateLimitExceeded` エラー
- **Agent Sybil対策：** Phase 1では3者署名のcryptographic proofのみで検証。Agent事前登録（AgentRegistry）はover-engineeringとして棄却。Phase 2以降でAI提供者アテステーション等と合わせて検討

**スラッシュ機構（Phase 1はスロットのみ）：**

コントラクトに `slashable: bool` フラグと `staked_amount: u64` フィールドを設ける。Phase 1では `slashable: false` 固定。スラッシュのトリガー関数は `authority`（Protocol Treasury管理のマルチシグ）からのみ呼び出し可能な設計とする。Phase 1での不正対応は手動（運営が明らかな不正を発見した場合に手動スラッシュ）。DAO化による自動スラッシュはPhase 3以降。

```
Screener / Curator Registry:
  staked_amount: u64     // ステーク量
  slashable: bool        // Phase 1: false固定
  
// Phase 1: authority only
fn slash(authority: Signer, target: Pubkey, amount: u64) -> Result<()> {
    require!(authority == PROTOCOL_AUTHORITY);
    // ...
}
```

**プロトコルの設計方針：可観測性の確保**

プロトコルは不正検知ロジックを規定しない。代わりにScreener間の競争で検知品質が上がる市場原理を前提とし、プロトコルの責務はオンチェーンデータの可観測性を確保すること。全データがオンチェーンに載るため、不正の痕跡も公開台帳に積み上がり、隠蔽コストが極めて高い。

**将来の追加防御：** AI提供者のアテステーション（Anthropic/OpenAI等が「正規のエージェントインスタンス」と証明する第三者検証）

### 2.9 Ad MCP + vaulx の送信設計

Agent 側は 2つの MCP サーバーで構成される。Phase 1 では 1tx = 1署名セット。バッチ処理は不要。

```
Agent が接続する MCP:
  ├── vaulx（wallet MCP。署名 + submit の capability）
  ├── Ad MCP（広告 brain。tx構築 + 判断。vaulx と localhost HTTP で直接通信）← packages/ad-mcp/
  └── Service MCP(s)（天気API等。curator-sdk で広告注入。Sub-phase 5）

処理フロー:
  ① Service MCP → ad slot + 2者署名付きレスポンスを Agent に返す
  ② Agent（LLM）が ad slot を認識 → Ad MCP.process_ad(slot) を呼ぶ
  ③ Ad MCP 内部（LLM 経由しない）:
     - canonical message 構築 + SHA-256 hash（packages/core）
     - vaulx HTTP: /api/sign-bytes → Agent 署名取得
     - Ed25519 ixs + record_impression ix → tx 組立
     - vaulx HTTP: /api/sign-and-send-raw-transaction → submit
  ④ Ad MCP → Agent に結果返却

  submission_fee により、fee payerは同一tx内で立替分を即回収。
  立替リスクゼロ（atomic）。

  耐障害性:
    - 未送信分はローカルDB（SQLite）に永続化
    - リトライキューで自動リトライ

セキュリティ:
  - Ad MCP ↔ vaulx: localhost HTTP + WALLET_AUTH_TOKEN
  - LLM を通さない。MCP injection attack を構造的に排除。
```

**1txあたりのサイズ見積もり：** 署名セット1件は約360 bytes（Ed25519署名×3 = 192B、Pubkey×3 = 96B、ad_id = 32B、timestamp+context_hash = 40B）。Solanaのtx size上限（1232 bytes）を考慮すると1txに2-3セットが限界であり、バッチの意味が薄い。Phase 1は1tx1セットで十分。

### 2.10 Solana上の経済的成立性

**署名検証の技術的実現性：** SolanaのEd25519 Programにより、任意のEd25519署名をオンチェーンで検証可能。3つの署名を1txのinstruction dataに含めて検証できる。

**Fee payer：** permissionless。誰がtxを提出しても、submission_fee_lamports が deposit から payer に atomic に補填される。Agent、Screener、Curator、任意の第三者がfee payerになれる。SOL直接保有は不要（relay経由も可）。

-----

## 3. 市場戦略

### 3.1 「ゼロの場所に1円を生む」

既存の広告予算を奪うのではなく、今マネタイズ手段がゼロの領域を狙う。MCPサーバー運営者は「無料で提供するか、サブスクにするか」の二択で困っている。ここに「広告付き無料プラン」という第三の選択肢を持ち込む。

### 3.2 CPM型クロスプロモーションから始める

**Phase 1：indie MCPサーバー同士の相互推薦モデル**

MCP Serverを公開している個人開発者同士が「お互いのサービスを推薦し合う」需要は確実に存在する。ここにプロトコルの仕組みを噛ませる。広告主＝パブリッシャーの相互推薦モデルから始めることで、外部の広告主営業が不要。

```
MCPサーバーA（天気API）= 広告主 兼 Curator
  → Ad Registryに「天気APIの宣伝」を登録（広告主として）
  → 他のMCPサーバーからの広告をレスポンスに含める（Curatorとして）

MCPサーバーB（翻訳API）= 広告主 兼 Curator
  → Ad Registryに「翻訳APIの宣伝」を登録（広告主として）
  → 他のMCPサーバーからの広告をレスポンスに含める（Curatorとして）
```

3者署名がここで機能する理由：CPMモデルではインプレッションの検証が課金の根拠。「本当に配信されたか」を3者署名で証明することで、相互推薦の参加者間に信頼が生まれる。既存のアフィリエイト（CPA）モデルではコンバージョンが課金トリガーであり、インプレッション検証の付加価値が発揮されない。

**目的：** エコシステムに金を流してScreener/Curatorの実績データを積む。「このプロトコルでは過去N件のインプレッションが3者署名で検証されており、フラウド率はX%」と数字で語れる状態を作る。

**Phase 2：直接広告主の獲得**

実績データが溜まった段階で、外部のCPM型直接広告主を取りに行く。ここで初めてインプレッション検証の透明性が最大の武器になる。

### 3.3 大企業より先にデファクトを取る

本プロトコルはオープンプロトコルとSDKでロングテールのMCPサーバーから普及させ、デファクトスタンダードのポジションを取る設計。

MCP自体がオープンプロトコルで、Linux Foundationに移管された。Anthropic、OpenAI、Google、Microsoftが全員MCPを採用しており、MCP層には単一の支配者がいない。各プラットフォーマーが独自に広告レイヤーを作る可能性は技術的に自明にある。GoogleがA2A+AP2に広告を足すのは容易い。

**だからこそ先に動く。** ロングテールのMCPサーバーに広まっている状態を先に作ることで、大企業にとって「既に普及しているプロトコルに乗る」ほうが「独自規格を立ち上げて開発者を引き剥がす」より低コストな状態にする。ウェブ広告がプラットフォーム分断で苦しんでOpenRTBという共通プロトコルが生まれたのと同じ力学が、MCP層でも発生する。そのOpenRTBのポジションを取る。

### 3.4 収益モデル

**A：プロトコル手数料** — 報酬分配時にコントラクトが0.5-1%を取得。徴収先はProtocol Treasury（DAO管理）。Uniswapと同じモデルでプロトコルレベルで自動徴収。

**B：Screener/Curatorのステーキング経済** — 参加者はSOLをステーク。品質に応じて配信枠の優先権が変動。市場原理でエコシステムが自律的に回る。

**ツール・ダッシュボードはオープンソースで公開：**

SDK、分析ダッシュボード、不正検知ロジック、レポーティングツールは全てオープンソースとする。プロトコルの存在理由が「広告費の完全な可視化」である以上、可視化ツールを有料にすることは設計哲学と矛盾する。オンチェーンデータは全公開であり、誰でも独自の分析ツールや不正検知サービスを構築できる。プロトコル公式は参照実装として提供するが、無料。サードパーティによるツール層の自律的成長を促進し、OpenRTBのポジションを取るための一貫性の証明とする。

### 3.5 独自トークンについて

**Phase 1-2では導入しない。SOL/USDCで全機能が動作する設計。規制リスクを最小化。**

Protocol Treasuryはプロトコル手数料（0.5-1%）で自律的に蓄積。パラメータ変更権は運営マルチシグが保持。

**導入条件（全て満たすこと）：**

1. Solana mainnet稼働済み（Phase 2完了）
2. 第三者Screenerが3以上稼働
3. 第三者Curatorが30以上稼働
4. 月間オンチェーン記録が10万件超
5. Protocol Treasury残高が運営6ヶ月分以上

上記5条件が揃った段階で、プロトコルパラメータの変更権を運営マルチシグから分散ガバナンスへ移行する実質的な必要性が生じる。条件未達でのトークン導入はプロトコル設計上の必要性がなく、資金調達目的のトークンセールとの混同を避ける。

**導入時の用途：**

**A. プロトコルパラメータのガバナンス投票**

ガバナンストークンが解く問題は「プロトコルパラメータの変更権を誰が持つか」の政治問題である。SOLステーキングではなく独自トークンが必要な理由は、SOLステーカーはSolanaエコシステム全体の利害を代表するが、本プロトコル固有の利害（protocol_fee率、rate_limit閾値、slashing条件）とは一致しない場合があるため。プロトコル固有の利害を反映するには、プロトコル固有のステークが必要。

対象パラメータ：protocol_fee、rate_limit閾値、slashing条件、L2移行パラメータ

**B. Phase 3 L2ガストークン（検討）**

プロトコル専用SVM Rollup移行時に、L2のガストークンとしてプロトコルトークンを使用する可能性がある。L2の経済設計（ガスコストの調整、シーケンサー報酬）をプロトコル側でコントロールするためには、SOLではなく独自トークンが合理的。ただしSOLをそのままL2ガストークンとして使用するオプションも排除しない。

**C. Screener/Curatorのステーキング移行**

Phase 1-2ではSOLステーク。トークン導入後はプロトコルトークンステークに移行。品質に応じた配信枠の優先権、slashing対象をプロトコルトークンに統一。

**導入しない用途：**

- Agent報酬（Sybil対策の複雑性により棄却済み）
- 投機的価値の創出

-----

## 4. 既存の技術資産

### 4.1 スタック一覧

|リポジトリ                 |行数     |役割                                                                  |本プロジェクトでの活用              |
|----------------------|-------|--------------------------------------------------------------------|-------------------------|
|iab-types             |-      |IAB Tech Lab仕様のTypeScript型定義（OpenRTB 2.5/2.6/3.0, AdCOM, Native Ads）|広告オブジェクト・コンテキストカテゴリの型定義基盤|
|trawl                 |~3,200 |OpenRTB 3.0入札収集ライブラリ                                                |オークションロジックの流用（Curator内）  |
|adelv                 |~3,700 |広告配信ライブラリ（AdCOM Ad受取→配信→計測）                                         |Impression proof生成パイプライン |
|vide                  |~35,500|モジュラー動画プレイヤー（VAST 4.2/VMAP/SSAI/VPAID 2.0/SIMID/OMID/IMA Bridge）    |動画広告シナリオの参照実装            |
|lynq                  |~13,600|MCPサーバーのセッション管理ライブラリ                                                |Curatorのセッション管理・ツール可視性制御 |
|vaulx                 |~7,200 |エージェントウォレットMCPサーバー（EVM）                                             |Solana対応 + 署名キュー + 送信機能追加|
|agent-payment-protocol|-      |エージェント間決済のオープンプロトコル仕様                                               |決済フローの設計パターン流用           |

**合計：約63,200行の既存コード。**

### 4.2 実証済みの動作

lynqで構築したMCPサーバーにagent-payment-protocolミドルウェアを挿入し、オンチェーン上での決済実行とエージェントによるレシート認識まで確認済み。HTTP層ではなくMCP層での決済が実際に動作することを実証。

-----

## 5. 競合分析

|                 |決済       |広告配信   |Delivery検証 |広告費の完全追跡|エージェント対応|MCP層   |
|-----------------|---------|-------|-----------|--------|--------|-------|
|x402（Coinbase）   |✅ HTTP層  |❌      |❌          |❌       |✅       |❌      |
|AP2（Google+x402） |✅ A2A層   |❌      |❌          |❌       |✅       |❌      |
|BAT/Brave        |✅        |✅（限定的） |△（Brave内のみ）|❌       |❌       |❌      |
|AdEx             |✅ OUTPACE|✅      |△（バリデーター依存）|❌       |❌       |❌      |
|Google Ads/Prebid|✅ オフチェーン |✅      |❌（自己申告）    |❌       |❌       |❌      |
|**本プロジェクト**      |✅ Solana |✅（設計済み）|✅（設計済み）    |✅（設計済み） |✅       |✅（実証済み）|

**x402との関係：** x402は決済レール。本プロジェクトは広告検証プロトコル。レイヤーが異なり補完関係にある。x402/AP2がエージェントのウォレット普及を加速し、本プロトコルの前提（Agent署名）が自然に成立する。

**BAT/Brave：** ブラウザ内ローカルマッチング + ZKP。Braveにロックイン。既存SSP/DSPとの互換性ゼロ。広告フォーマットが限定的。

**AdEx：** Ethereum上のOUTPACE + AdView。インプレッション検証はバリデーター合意に依存（オフチェーン）。結託で不正が可能。

**Adshares：** 独自ブロックチェーン + AdSelect。分散型を謳いながらコアロジックが中央集権的。独自チェーンへの依存。

-----

## 6. ロードマップ

### Phase 1：PoC（Solana devnet）

**Step 1：Solanaプログラム（Ad Registry + 署名検証 + 報酬分配）**

- Anchorフレームワークで最小のAd Registryを実装
- 広告登録（advertiser, budget, authorized_screeners, excluded_curators, max_cpm, max_screener_share）
- Screener Registry（declared_share、endorsed_curators、staked_amount、slashable）
- 3署名検証（Ed25519 Program経由）、1tx = 1署名セット
- 重複防止：広告主単位Bitmapアカウントによるフラグ管理
- fee payer = permissionless（submission_fee でdepositから即時補填）
- 報酬分配ロジック（declared_shareに基づく自動分配）
- update_config instruction（authority がprotocol_fee_bps, treasuryを動的に変更可能）
- submission_fee = SUBMISSION_FEE_LAMPORTS（プログラム定数、update_config対象外）
- レートリミット（Curator単位 + 広告主budget単位のガス消費上限）
- スラッシュ関数のスロット（Phase 1では authority only、slashable: false固定）
- devnetでデプロイ・テスト

**Step 2：3者署名検証フローの実証**

- Screener署名 + Curator署名 + Agent署名を生成（全てオフチェーン）
- Agentが1txでオンチェーン記録
- submission_feeがdepositからpayerに補填されることを確認
- declared_shareに基づく報酬分配が正しく実行されることを確認

**Step 2.5：Off-chain TypeScript packages**

- `packages/core/` — protocol primitives（AdSlot型、canonical message構築、Ed25519 ix組立、PDA helpers）
- `packages/ad-mcp/` — Agent側の広告専用MCPサーバー（lynqベース）
  - vaulx HTTP client（localhost直接通信、LLM経由しない）
  - process_ad tool（署名 + tx組立 + submit の全自動処理）
  - SQLite nonce管理 + リトライキュー
  - CLI init（vaulx auto-detect）
- Borsh serialization の Rust/TS 一致を test vector で検証済み

**Step 3：vaulx Solana対応 + Ad MCP連携**

- 既存EVMサイナーと並列にSolanaサイナーを追加
- Ad MCP → vaulx HTTP API（/api/sign-bytes, /api/sign-and-send-raw-transaction）
- 即時送信 + 失敗時ローカルDB保存 + 自動リトライ
- Fee payer対応

**Step 4：Commercial Slotフォーマット定義**

- MCPツールレスポンス内の商業情報フォーマットをAdCOM（iab-types）ベースで設計
- context_categoryフィールド（IAB Content Taxonomy準拠）
- organic情報とsponsored情報の明示的区別

**Step 5：MCPサーバー参照実装（Curator役）**

- lynqベースのMCPサーバー
- ScreenerのDBから広告取得 → レスポンスにcommercial slotを含める
- 署名①②＋広告データをAgentに渡す仕組み

**Step 6：エンドツーエンドデモ**

- 広告主がdevnetに広告登録（excluded_curators、max_screener_share含む）
- Screenerがフィルタ + declared_share宣言 + 署名
- CuratorがMCPツール経由で配信 + 署名
- Agentが受信 + 署名 + vaulxで即時送信
- 3署名がSolanaで検証 → declared_shareに基づく報酬自動分配
- **このフローが1本通れば概念検証完了**

### Phase 2：初期運用（Solana mainnet）

- Solana mainnet移行
- CPM型クロスプロモーションの開始（indie MCPサーバー同士の相互推薦）
- npm installで導入可能なCurator SDK公開
- Protocol-operated Screener（運営がデフォルトScreenerを兼務）の稼働
- 中小MCPサーバーへの展開
- 外部直接広告主の獲得開始
- 第三者Screener参入条件の定義と受入開始

### Phase 3：スケール（プロトコル専用SVM Rollup）

**Step 1：L2移行判断**

以下の条件のいずれかを満たした段階でL2移行を開始する。

- 日次オンチェーン記録が10万件を超過
- Solana L1のプライオリティフィー高騰により、広告txのランディング失敗率が5%を超過
- $2 CPM帯でのガス比率を1%以下に圧縮する必要性が市場から求められた段階

**Step 2：プロトコル専用SVM Rollup構築**

L2の選択理由：本プロトコルの設計哲学「検証可能性のオンチェーン担保」を維持するため。State Compression（Concurrent Merkle Tree）はオフチェーンIndexerへの依存を再導入し、プロトコルの存在理由と矛盾する（2.3参照）。L2ではデータ本体がL2チェーンのstate storageに完全に保持され、検証可能性がL2レベルで自己完結する。

```
L2（プロトコル専用SVM Rollup）:
  ├── 署名セット記録（全データ保持、Indexer不要）
  ├── Ed25519 × 3 署名検証
  ├── 報酬分配（即時、L2内で完結）
  ├── 重複防止PDA（L2内のrentはプロトコル経済設計で最適化）
  └── 専用ブロックスペース（DeFi/NFTとの競合なし）

Solana L1:
  ├── state rootアンカリング（定期的、L2データの改竄不可能性を担保）
  ├── 広告主budgetデポジット（L1 → L2ブリッジ経由）
  └── Screener/Curatorステーク（将来）
```

L2でのtxコスト目標：L1の1/10〜1/100（$0.00002〜0.000002/impression）。$2 CPM帯でガス比率0.1〜1%。

Anchorで書いたSolanaプログラムはSVM互換のため書き直し不要。

**Step 3：L2インフラ選定**

- 既存SVM Rollupインフラ（Sonic等）への相乗り、または自前シーケンサー運営の判定
- 自前シーケンサーの場合：運営コスト月$500〜2,000（クラウドサーバー）。初期は中央集権シーケンサーを許容
- L1⇔L2ブリッジ：広告主budgetデポジットの移動のみ。攻撃面は限定的だが、ブリッジセキュリティの監査は必須
- 複数広告主バッチのfee payer按分ロジック設計

**Step 4：分散シーケンサーへの移行**

- ガバナンストークン導入（3.5の導入条件と同期）と合わせて実施
- シーケンサー運営をDAO参加者に分散
- スラッシュのDAO化（自動トリガー条件の定義と分散型ガバナンスへの移行）

-----

## 7. 技術的未解決事項

### 7.1 Screener DBの構造

- オフチェーンDB（PostgreSQL等）のスキーマ設計
- オンチェーンのAd Registryとの同期方法
- コンテキストカテゴリとマッチングルールの標準化

### 7.2 AI提供者アテステーション（将来）

- Anthropic/OpenAI等が「正規エージェント」を証明するプロトコル
- 署名スキーム、証明書チェーンの設計
- プライバシーとのバランス

### 7.3 Bitmap重複防止の設計詳細

- 広告主単位Bitmapのサイズ設計（初期容量、拡張方式）
- impression IDからBitmap内のbit位置へのマッピング関数
- Bitmap飽和時の新規Bitmap作成とローテーション方式

### 7.4 L2移行の技術的課題

- SVM Rollupのシーケンサー選定基準（既存インフラ vs 自前構築のコスト比較）
- L1⇔L2ブリッジの設計（広告主budgetデポジットの移動、セキュリティ監査要件）
- L1アンカリング頻度の最適化（コスト vs 検証遅延のトレードオフ）
- L2障害時のフォールバック設計（L1への一時的フォールバック or L2冗長化）
- Phase 1-2のL1データからL2への移行パス（既存記録の扱い）

### 7.5 Ad MCP ↔ vaulx 間の auth token 管理

- Phase 1 は file-based（~/.vaulx/wallets/{active}/.env から WALLET_AUTH_TOKEN を読み取り）
- Phase 2 以降で OS keychain 統合を検討（macOS Keychain、Linux Secret Service、Windows Credential Manager）
- Ad MCP の CLI init が vaulx auto-detect で token を自動取得

### 7.6 ガバナンストークンの設計詳細

- トークン配分設計（Treasury, Screener/Curator報酬, 開発者, 初期参加者）
- ガバナンス投票の仕組み（投票期間、クォーラム、提案条件）
- L2ガストークンとして使用する場合の経済モデル（インフレ率、バーンメカニズム）
- SOLステークからプロトコルトークンステークへの移行手順

-----

## 8. 参考資料

### プロトコル・仕様

- OpenRTB 3.0 / AdCOM 1.0 — IAB Tech Lab
- MCP (Model Context Protocol) — Anthropic → Linux Foundation AAIF
- x402 — Coinbase (HTTP層決済プロトコル)
- AP2 (Agentic Payments Protocol) — Google + x402
- A2A (Agent-to-Agent Protocol) — Google → Linux Foundation AAIF

### Solana技術参照

- Solana State Compression — Solana Documentation（検討・棄却の経緯は2.3に記載）
- Concurrent Merkle Tree — Solana Program Library
- SVM Rollup — Sonic SVM, Eclipse

### 分散型広告

- BAT Whitepaper — Brave Software (2021)
- AdEx Protocol — GitHub AmbireTech/adex-protocol
- Adshares — adshares.net/protocol

### 自己リポジトリ

- https://github.com/hogekai/iab-types
- https://github.com/hogekai/vide
- https://github.com/hogekai/lynq
- https://github.com/hogekai/adelv
- https://github.com/hogekai/trawl
- https://github.com/hogekai/vaulx
- https://github.com/agentprotocols/agent-payment-protocol