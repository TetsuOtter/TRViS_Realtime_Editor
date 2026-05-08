# TRViS Realtime Editor

[TRViS](https://github.com/TetsuOtter/TRViS) と WebSocket でリアルタイム接続し、選択中の列車を即座に編集するためのデスクトップアプリです。

## 構成

```
.
├── src/                            フロントエンド (Vite + React + TypeScript)
├── src-tauri/                      Tauri アプリ (Rust)
├── crates/
│   ├── trvis-ws-server/            WebSocketサーバ ライブラリクレート
│   └── trvis-ws-server-bin/        E2E用 standalone バイナリ
├── test-harness/TRViSTestHarness/  .NET テストハーネス
├── docker/                         Docker compose 一式
└── e2e-tests/                      Vitest による E2E テスト
```

## 開発

```bash
pnpm install
pnpm tauri:dev          # Tauri デスクトップアプリ起動
pnpm test               # フロントエンド単体テスト
cargo test              # Rust テスト
pnpm test:e2e           # E2E テスト (要 docker)
```

## コード品質

```bash
pnpm lint               # ESLint (TS/TSX)
pnpm lint:fix           # ESLint --fix
pnpm format             # Prettier 整形 (TS/TSX/JSON/MD/CSS/YML)
pnpm format:check       # Prettier 検証のみ
pnpm fmt:rust           # rustfmt 適用
pnpm fmt:rust:check     # rustfmt 検証のみ
pnpm check              # lint + format:check + fmt:rust:check (CI 用)
```

設定ファイル:

- `eslint.config.js` (ESLint v9 flat config: typescript-eslint + react + react-hooks + react-refresh、prettier と競合する整形ルールは disable)
- `.prettierrc.json` / `.prettierignore`
- `rustfmt.toml` / `clippy.toml`
- `.editorconfig`

## WebSocket プロトコル

[TRViS](https://github.com/TetsuOtter/TRViS) のWebSocketプロトコルに完全準拠。

- サーバ → クライアント: `Timetable` (Data: WorkGroupData[]/WorkGroupData/WorkData/TrainData), `SyncedData` (Location_m/Time_ms/CanStart)
- クライアント → サーバ: ID更新メッセージ (WorkGroupId/WorkId/TrainId)
- 接続URL: `trvis://app/open/json?path=ws://<host>:<port>/ws`

## CI / リリースビルド

`.github/workflows/` に 3 つの workflow:

- `ci.yml`: lint / 単体テスト / Rust テスト / docker compose による E2E テスト (push / PR)
- `tauri-build.yml`: タグ push (`v*`) で 5 ターゲットを並列ビルド & ドラフトリリース化
  - `macOS arm64` (Apple Silicon) ※ x64 は対象外
  - `Linux x86_64` / `Linux aarch64`
  - `Windows x86_64` / `Windows aarch64`
- `dotnet-harness.yml`: `test-harness/**` 変更時のみ .NET ビルド検証
