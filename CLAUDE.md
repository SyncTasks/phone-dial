# CLAUDE.md — 久保田タスクボード

個人用タスク管理アプリ。Google スプシ「タスク管理表」（ID `1yBlOqa4MIHQGbhlGcfDLKfFPKERUZNXUMD5MD3FxZ9w`、タブ `久保田`）が元データ。LINE bot がそのスプシにタスクを書き込んでいる。

## 決まっていること（ユーザー確認済み）

- Vercel にデプロイする Next.js アプリ（Artifact ではなくシステムとして）
- **スプシが正**。アプリから状態・優先度・期日を書き戻し、新規タスクは末尾に追記。週次判断・整理時間・手書きはアプリの Postgres に保存
- 画面の AI は Claude Code 経由（2026-10-08 本人決定）。アプリは依頼を `ai_requests` に保存するだけで、Mac の `worker/worker.sh`（launchd）がリマを起こして返事とボタン案を返す。ボタンを押したときだけアプリがスプシに書く。Anthropic API は使わない
- ADHD 前提の設計（設計方針: Akindo_Brain `11_IT戦略/久保田タスクボード（アプリ）_設計方針_2026-10-08.md`）。一度に見せるのは1つ、報告は「始める」「終わった」の副産物、遅れは「繰り越し」（赤くしない）
- チーム向けページは進行中・今週やる・最近7日の完了・相談の印・予定の埋まり具合（中身なし）だけ。未着手の中身・メモ・備考・URL・予定のタイトルは出さない（`lib/team.ts` が唯一の出口）
- UI: アイコンは Lucide、絵文字なし、左端の色帯カードなし、スマホ優先、ライト/ダーク両対応
- 「Atari Room」を機能の参考にしたいと言われたが、正体不明。URL か正しい名前をユーザーに聞く

## 構成

- `lib/time.ts` — 日本時間の暦計算（サーバーは UTC なので必ずこれを通す）
- `lib/tasks.ts` — 型・週次判断ロジック（do/later は週で失効、skip は残る）・集計
- `lib/google.ts` — サービスアカウントの JWT → アクセストークン（スコープごとにキャッシュ）
- `lib/sheets.ts` — Google Sheets REST。見出し名で列を引く。書き戻し前に行の No を照合（`#AI` の備考追記も同じ照合で備考列だけ書く）
- `lib/calendar.ts` / `lib/schedule.ts` — Google カレンダー読み取り（60秒キャッシュ、DEMO は架空の予定）と、予定の変換（今日・次の予定・中身なしの埋まり具合）
- `lib/focus.ts` — 「今やること」「次の2つ」「数字1行」の選び方
- `lib/ops.ts` — リマへの依頼の型と、ボタン（op）の許可リスト検査
- `lib/team.ts` — チーム向けページに出してよいものだけを作る
- `lib/writes.ts` — スプシへ書く唯一の経路（状態・優先度・期日・追加・`#AI`）と完了の記録
- `lib/store.ts` — Neon Postgres（`DATABASE_URL` が無ければメモリ。DEMO ではサンプルを入れる）。テーブルは `scripts/migrate.mjs`（ビルド時に実行）: triage / settings / notes / focus / parking / consult / done_log / ai_requests
- `lib/data.ts` — スプシ読み込み（60秒キャッシュ、タグ `sheet`）と画面用データ
- `app/actions.ts` — Server Actions（ログイン、書き戻し、判断、手書き、始める/終わった/後にする/相談したい、メモ、リマへの依頼、ボタンの実行）
- `app/(app)/` — 今日 `/`・一覧 `/tasks`・週次整理 `/review`・手書き `/notes`。全ページ下に「リマに話す」（`components/RimaDock.tsx`）
- `app/api/worker/` — Mac の返事係用 API（`pending` / `context` / `requests/[id]`、`Authorization: Bearer WORKER_TOKEN`）
- `app/team/[token]/` — チーム向け閲覧ページ（`TEAM_VIEW_TOKEN`、DEMO では `demo-team`）
- `worker/` — Mac 側（`worker.sh` / `tb.py` / `PROMPT.md` / plist の見本 / `.env.example`）。launchd への登録は本人が行う
- `middleware.ts` — パスワードログインのセッション確認（`DEMO=1` で無効）。worker API と /team は合言葉が合うときだけ通す

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
- [x] 2026-10-08: 今日の作り直し（今やること・次の2つ・メモ・数字1行・繰り越し）、Googleカレンダー（読み取り）、リマに話す（ai_requests・ボタン・worker API・Mac 側の worker/）、チーム向けページ。テスト43件・型チェック・DEMO ビルド・デモでのブラウザ確認（スマホ幅・デスクトップ・ダーク）
- [ ] 専用リポジトリへ移す（今は `synctasks/phone-dial` の `task-board` ブランチに仮置き）
- [ ] README の手順で Google サービスアカウント・Vercel（Neon / Blob / 環境変数）を設定してデプロイ
- [ ] カレンダー: Calendar API を有効化、カレンダーをサービスアカウントに共有、`GOOGLE_CALENDAR_ID`
- [ ] `TEAM_VIEW_TOKEN` を入れてチームに URL を共有
- [ ] `WORKER_TOKEN` を入れ、Mac に worker/.env を置いて `bash worker/worker.sh` を手動で1回通してから launchd に登録（README「5. Mac の返事係」）
- [ ] 本番で未確認：スプシへの書き戻し・追記・`#AI` 追記、Neon（新テーブル含む）、Blob、カレンダー、返事係の実走
- [ ] 以降の候補：Claude Code が作業の痕跡（コミット・タスク表の変更）から「進行中」を補う案、整理時間の通知
