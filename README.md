# 久保田タスクボード

「タスク管理表」スプシ（久保田タブ）を元データにした個人用タスク管理アプリ。Next.js 15 / Vercel。

- **今日** — 「今やること」1つと「次の2つ」だけを出す。「始める」「終わった」「後にする」「相談したい」を押すだけで、スプシとチーム向けページが変わる。次の予定まであと◯分・今日の予定の帯・数字1行（進行中・今週やる・今週完了・繰り越し）・思いついたことのメモ（Enter で保存、スプシには入れない）
- **一覧** — 状態タブと検索。タップで状態・優先度・期日を変更すると **スプシに書き戻す**。下に「傾向を見る」（週ごとの流入と消化・発生元）
- **週次整理** — 決めた曜日・時刻を過ぎると通知バッジ。最初に「思いついたことの仕分け」（タスクにする / 捨てる）、続けて1枚ずつ「今週やる / 来週考える / やらない」を決める（キーボード 1/2/3）
- **リマに話す**（全ページの下） — 話しかけると Mac の Claude Code（リマ）が返事と「次にやること」のボタンを返す。ボタンを押したときだけスプシに書く。「実装して」ボタンは備考に ` #AI` を付けて AI開発部屋の自動開発に回す
- **チーム向けページ** `/team/<TEAM_VIEW_TOKEN>` — ログインなし・閲覧専用・検索よけ。進行中・今週やる・最近7日の完了・相談したい印・今週の予定の埋まり具合（中身なし）だけを出す
- **手書き** — ペン・消しゴム・3色・3段階の太さ。Apple Pencil 使用時は手のひらを無視。PNG で保存してメモを付けられる
- タスク追加はスプシの末尾に `No` を採番して追記（担当者・発生元グループは環境変数で指定）

スプシが正（LINE bot → スプシの流れはそのまま）。アプリ固有の状態（週次判断・整理時間・手書き・今やること・思いついたことのメモ・相談の印・完了の記録・リマへの依頼）は Postgres に保存する。

## 仕組み

```
ブラウザ ──(Server Actions)──▶ Next.js on Vercel ──▶ Google Sheets API / Calendar API（サービスアカウント）
                                       │
                                       ├──▶ Neon Postgres（triage / settings / notes / focus / parking / consult / done_log / ai_requests）
                                       └──▶ Vercel Blob（手書き PNG）
                                       ▲
Mac（launchd 1分おき）worker/worker.sh ──(/api/worker/*, Bearer WORKER_TOKEN)──┘
   └─ 処理待ちがあるときだけ claude -p でリマを起こす（返事とボタン案を返すだけ。スプシには書かない）
```

- スプシの読み込みは 60 秒キャッシュ。「再読み込み」かアプリからの書き込みで即時更新
- 書き戻しの前に対象行の `No` を読み直して照合し、行がずれていたら書かずにエラーにする
- 日付はすべて日本時間で計算（Vercel のサーバーは UTC）
- ログインはパスワード1つ（httpOnly Cookie の署名付きセッション、30日）。`/api/worker/*` は正しい `WORKER_TOKEN` のときだけ、`/team/<合言葉>` は合言葉が合うときだけログインを通さない（違えば 401 / 404）
- リマのボタンは押したときに、種類（状態・優先度・期日・追加・実装へ回す・何もしない）と値を許可リストで検査し、対象タスクがあることを確かめてから書く。同じボタンは1回しか実行されない
- 予定は 60 秒キャッシュ。`GOOGLE_CALENDAR_ID` が無ければ予定の表示は出さない（エラーも出さない）

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

| `GOOGLE_CALENDAR_ID` | 任意。予定を出すカレンダーのID（下の「3. カレンダー」） |
| `WORKER_TOKEN` | 任意。Mac の返事係用の合言葉（`openssl rand -hex 32`） |
| `TEAM_VIEW_TOKEN` | 任意。チーム向けページの合言葉（`openssl rand -hex 16`、16文字以上） |

4. Redeploy。ビルド時に `scripts/migrate.mjs` がテーブルを作る（何度実行しても安全）

### 3. カレンダー（予定の表示）

1. Google Cloud Console の「API とサービス」→「ライブラリ」で **Google Calendar API** を有効にする（スプシと同じプロジェクト）
2. Google カレンダーの「設定と共有」→「特定のユーザーまたはグループと共有する」で、サービスアカウントのメールを追加し、権限を **予定の表示（すべての予定の詳細）** にする
3. 同じ画面の「カレンダーの統合」にある **カレンダー ID** を Vercel の `GOOGLE_CALENDAR_ID` に入れて Redeploy
4. 「今日」に「次の予定まで あと◯分」が出れば成功。出ないときは Vercel のログに `[calendar] Google Calendar API 403/404` が出ていないか見る

### 4. チーム向けページ

1. `openssl rand -hex 16` の結果を Vercel の `TEAM_VIEW_TOKEN` に入れて Redeploy
2. `https://<アプリのURL>/team/<TEAM_VIEW_TOKEN>` をチームに共有する（ログイン不要・閲覧専用）。合言葉を変えれば古いURLは 404 になる

### 5. Mac の返事係（リマに話す）

アプリは依頼を保存するだけで、返事は Mac の Claude Code（定額プラン）が作る。Mac がスリープ中は依頼が待ちになる（画面にもそう出る）。以下は本人が自分の Mac で行う。

1. `openssl rand -hex 32` の結果を Vercel の `WORKER_TOKEN` に入れて Redeploy
2. このリポジトリを Mac に置き（例 `~/dev/kubota-task-board`）、`cp worker/.env.example worker/.env && chmod 600 worker/.env` して `TASKBOARD_URL`（アプリのURL）と `WORKER_TOKEN` を書く
3. 疎通確認: `python3 worker/tb.py pending`（`{"requests": [...]}` が出ればよい）
4. 手動で1回通す: アプリで「リマに話す」から何か送り、`bash worker/worker.sh` を実行 → `~/Library/Logs/taskboard_worker.log` を見て、アプリに返事が出るのを確かめる
5. 常駐させる: `worker/info.akindo.taskboard-worker.plist.example` を `~/Library/LaunchAgents/info.akindo.taskboard-worker.plist` にコピーし、中のパスを置き場所に合わせて直してから `launchctl load ~/Library/LaunchAgents/info.akindo.taskboard-worker.plist`
6. 止めるとき: `launchctl unload ~/Library/LaunchAgents/info.akindo.taskboard-worker.plist`

返事係が使えるのは、読み取り（Read / Grep / Glob）、`worker/tb.py`、`kubota_tasks.py list/show`、`~/.cache/taskboard-worker/` への書き込みだけ。手順は `worker/PROMPT.md`。

## ローカル開発

```bash
npm install
DEMO=1 npm run dev        # 架空データ・ログインなし・保存はメモリ上
npm test                  # 日付・パース・週次・今やること・ボタン検査・チーム向けの絞り込み・予定・合言葉のテスト
npm run typecheck
```

本物のスプシで動かすときは `.env.example` を `.env.local` にコピーして値を入れる。

デモでは架空の予定・リマとのやりとり（返事済み1件・考え中1件）・思いついたことのメモが入っている。チーム向けページは `TEAM_VIEW_TOKEN` が無ければ `/team/demo-team` で見られる。返事係の動きをローカルで試すときは `WORKER_TOKEN` を付けて起動し、`TASKBOARD_URL=http://localhost:3000 WORKER_TOKEN=… python3 worker/tb.py pending`。

## 注意

- 手書き画像は Vercel Blob の public URL（推測できないランダムな URL）で保存される
- 「全員のタスク」タブは触らない。書き込むのは `SHEET_TAB` のタブの「完了状態・優先度・期日」、「実装して」ボタンでの「備考」末尾への ` #AI` 追記、新規行の追加だけ（どれも本人の操作か、本人がボタンを押したときだけ）
- AI はアプリに組み込まない（Anthropic API は使わない）。リマへの依頼は Mac の Claude Code が処理する
- 「今週完了」「最近7日の完了」はアプリから完了にしたものと、今週やるのうちスプシで完了になったものを数える（スプシには完了日の列が無いため）
