# CLAUDE.md — 久保田タスクボード

個人用タスク管理アプリ。Google スプシ「タスク管理表」（ID `1yBlOqa4MIHQGbhlGcfDLKfFPKERUZNXUMD5MD3FxZ9w`、タブ `久保田`）が元データ。LINE bot がそのスプシにタスクを書き込んでいる。

## 決まっていること（ユーザー確認済み）

- Vercel にデプロイする Next.js アプリ（Artifact ではなくシステムとして）
- **スプシが正**。アプリから状態・優先度・期日を書き戻し、新規タスクは末尾に追記。週次判断・整理時間・手書きはアプリの Postgres に保存
- AI 機能（チャット・手書き読み取り）は後回し。入れるなら Anthropic API キー（Vercel から Claude のサブスクは使えない）
- 「Atari Room」を機能の参考にしたいと言われたが、正体不明。URL か正しい名前をユーザーに聞く

## 構成

- `lib/time.ts` — 日本時間の暦計算（サーバーは UTC なので必ずこれを通す）
- `lib/tasks.ts` — 型・週次判断ロジック（do/later は週で失効、skip は残る）・集計
- `lib/sheets.ts` — Google Sheets REST（サービスアカウント JWT）。見出し名で列を引く。書き戻し前に行の No を照合
- `lib/store.ts` — Neon Postgres（`DATABASE_URL` が無ければメモリ）。テーブルは `scripts/migrate.mjs`（ビルド時に実行）
- `lib/data.ts` — スプシ読み込み（60秒キャッシュ、タグ `sheet`）と画面用データ
- `app/actions.ts` — Server Actions（ログイン、書き戻し、判断、手書き保存）
- `app/(app)/` — 今日 `/`・一覧 `/tasks`・週次整理 `/review`・手書き `/notes`
- `middleware.ts` — パスワードログインのセッション確認（`DEMO=1` で無効）

## コマンド

```bash
npm install
DEMO=1 npm run dev   # 架空データで起動
npm test             # vitest
npm run typecheck
npm run build
```

## 現状と次にやること

- [x] 実装・テスト14件・型チェック・ビルド・デモでのブラウザ操作確認
- [ ] 専用リポジトリへ移す（今は `synctasks/phone-dial` の `task-board` ブランチに仮置き）
- [ ] README の手順で Google サービスアカウント・Vercel（Neon / Blob / 環境変数）を設定してデプロイ
- [ ] 本番で未確認：スプシへの書き戻し・追記、Neon、Blob
- [ ] 以降の候補：Atari Room 風の機能、AI（API キー）、Googleカレンダーの今日の予定、整理時間の通知
