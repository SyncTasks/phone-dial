# 久保田タスクボード

「タスク管理表」スプシ（久保田タブ）を元データにした個人用タスク管理アプリ。Next.js 15 / Vercel。

- **今日** — 完了率、今週やる・期限切れ・3日以内・進行中・新着、週ごとの流入と消化、発生元グループ別の残数
- **一覧** — 状態タブと検索。タップで状態・優先度・期日を変更すると **スプシに書き戻す**
- **週次整理** — 決めた曜日・時刻を過ぎると通知バッジ。1枚ずつ「今週やる / 来週考える / やらない」を決める（キーボード 1/2/3）
- **手書き** — ペン・消しゴム・3色・3段階の太さ。Apple Pencil 使用時は手のひらを無視。PNG で保存してメモを付けられる
- タスク追加はスプシの末尾に `No` を採番して追記（担当者・発生元グループは環境変数で指定）

スプシが正（LINE bot → スプシの流れはそのまま）。アプリ固有の状態（週次判断・整理時間・手書き）は Postgres に保存する。

## 仕組み

```
ブラウザ ──(Server Actions)──▶ Next.js on Vercel ──▶ Google Sheets API（サービスアカウント）
                                       │
                                       ├──▶ Neon Postgres（triage / settings / notes）
                                       └──▶ Vercel Blob（手書き PNG）
```

- スプシの読み込みは 60 秒キャッシュ。「再読み込み」かアプリからの書き込みで即時更新
- 書き戻しの前に対象行の `No` を読み直して照合し、行がずれていたら書かずにエラーにする
- 日付はすべて日本時間で計算（Vercel のサーバーは UTC）
- ログインはパスワード1つ（httpOnly Cookie の署名付きセッション、30日）

## デプロイ手順

### 1. Google のサービスアカウント

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作る（既存でも可）
2. 「API とサービス」→「ライブラリ」で **Google Sheets API** を有効にする
3. 「IAM と管理」→「サービスアカウント」で作成し、「鍵」→「鍵を追加」→ **JSON** をダウンロード
4. スプシ「タスク管理表」の共有で、サービスアカウントのメール（`…@….iam.gserviceaccount.com`）を **編集者** として追加

### 2. Vercel

1. Vercel で「Add New → Project」からこのリポジトリをインポート（Framework は Next.js のまま）
2. プロジェクトの **Storage** タブで
   - **Neon**（Postgres）を作成して接続 → `DATABASE_URL` が自動で入る
   - **Blob** を作成して接続 → `BLOB_READ_WRITE_TOKEN` が自動で入る
3. **Settings → Environment Variables** に以下を入れる

| 変数 | 値 |
| --- | --- |
| `APP_PASSWORD` | ログイン用パスワード |
| `AUTH_SECRET` | 32文字以上のランダム文字列（`openssl rand -base64 32`） |
| `SHEET_ID` | `1yBlOqa4MIHQGbhlGcfDLKfFPKERUZNXUMD5MD3FxZ9w` |
| `SHEET_TAB` | `久保田` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | JSON 鍵の `client_email` |
| `GOOGLE_PRIVATE_KEY` | JSON 鍵の `private_key`（`-----BEGIN PRIVATE KEY-----\n…` をそのまま） |
| `TASK_OWNER_NAME` | 任意。追加タスクの担当者名（既定 `Kei Kubota`） |
| `TASK_SOURCE_NAME` | 任意。追加タスクの発生元グループ（既定 `タスクボード`） |

4. Redeploy。ビルド時に `scripts/migrate.mjs` がテーブルを作る（何度実行しても安全）

## ローカル開発

```bash
npm install
DEMO=1 npm run dev        # 架空データ・ログインなし・保存はメモリ上
npm test                  # 日付・パース・週次ロジックのテスト
npm run typecheck
```

本物のスプシで動かすときは `.env.example` を `.env.local` にコピーして値を入れる。

## 注意

- 手書き画像は Vercel Blob の public URL（推測できないランダムな URL）で保存される
- 「全員のタスク」タブは触らない。書き込むのは `SHEET_TAB` のタブの「完了状態・優先度・期日」と、新規行の追加だけ
- AI（チャット・手書きの読み取り）は未実装。足すときは Anthropic API キーを使う
