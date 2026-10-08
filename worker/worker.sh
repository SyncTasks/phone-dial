#!/bin/bash
# タスクボード「リマに話す」の返事係（launchd から1分おきに起動する想定）
#
# アプリに処理待ちの依頼があるときだけ、Claude Code（リマ）をヘッドレスで起こして
# worker/PROMPT.md の手順で返事と「次にやること」のボタン案を返させる。
# 処理待ちが無ければ API を1回読むだけで終わる。
# AI開発部屋の返事係（akindo-gas-library/tools/aidev_watch.sh）と同じ作り。
#
# 必要: worker/.env（TASKBOARD_URL / WORKER_TOKEN。git には入れない）
# 手動で試す: bash worker/worker.sh
# ログ: ~/Library/Logs/taskboard_worker.log

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(dirname "$DIR")"
LOG="$HOME/Library/Logs/taskboard_worker.log"
LOCK="$HOME/.cache/taskboard_worker.lock"
WORK="$HOME/.cache/taskboard-worker"
export PATH="$HOME/.local/bin:$HOME/.nvm/versions/node/v24.18.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

mkdir -p "$(dirname "$LOCK")" "$(dirname "$LOG")" "$WORK"

if [ ! -f "$DIR/.env" ]; then
  echo "$(date '+%F %T') worker/.env がありません（TASKBOARD_URL / WORKER_TOKEN）" >> "$LOG"
  exit 1
fi
# CLAUDE_MODEL など任意の設定も .env から読む
set -a
# shellcheck disable=SC1091
. "$DIR/.env"
set +a

# 前の回がまだ動いていれば何もしない（1時間以上残っているロックは異常終了の残骸とみなす）
if [ -d "$LOCK" ]; then
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +60 2>/dev/null)" ]; then
    rmdir "$LOCK" 2>/dev/null
  else
    exit 0
  fi
fi
mkdir "$LOCK" 2>/dev/null || exit 0
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

cd "$REPO" || exit 1
PENDING=$(python3 worker/tb.py count 2>>"$LOG")
if ! [[ "$PENDING" =~ ^[0-9]+$ ]]; then
  echo "$(date '+%F %T') 処理待ちの件数を読めませんでした: $PENDING" >> "$LOG"
  exit 1
fi
[ "$PENDING" -eq 0 ] && exit 0

echo "$(date '+%F %T') 処理待ち ${PENDING}件 → リマを起こします" >> "$LOG"
PROMPT="あなたは久保田さんのAI PM「リマ」です。タスクボードのアプリに「リマに話す」の依頼が来ています。
まず $REPO/worker/PROMPT.md を読み、その手順どおりに処理待ちの依頼をすべて片付けてください。
~/.claude/CLAUDE.md のルールも守ること。スプレッドシートには絶対に直接書かないこと（ボタンの案を出すだけ）。
最後に何をしたかを1〜3行で出力して終了してください。"

MODEL_ARGS=()
[ -n "${CLAUDE_MODEL:-}" ] && MODEL_ARGS=(--model "$CLAUDE_MODEL")

# 読むだけの道具と、worker/tb.py（アプリへの返事）・kubota_tasks.py list（タスク表を読む）だけを許可する。
# 書けるのは返事の JSON を置く ~/.cache/taskboard-worker/ の中だけ
LIMIT_SEC=900
claude -p "$PROMPT" "${MODEL_ARGS[@]}" \
  --allowedTools "Read" "Grep" "Glob" \
    "Write(~/.cache/taskboard-worker/**)" "Edit(~/.cache/taskboard-worker/**)" \
    "Bash(python3 worker/tb.py *)" \
    "Bash(python3 ~/dev/akindo-gas-library/tools/kubota_tasks.py list*)" \
    "Bash(python3 ~/dev/akindo-gas-library/tools/kubota_tasks.py show *)" \
    "Bash(date*)" \
  >> "$LOG" 2>&1 &
CLAUDE_PID=$!
# macOS には timeout が無いので、見張り役が LIMIT_SEC 秒で止める。
# 止めた依頼は「考え中」のまま残り、40分後にアプリが処理待ちに戻す（次の回でやり直す）
(
  sleep "$LIMIT_SEC"
  if kill -0 "$CLAUDE_PID" 2>/dev/null; then
    echo "$(date '+%F %T') ${LIMIT_SEC}秒たっても終わらないため強制終了します" >> "$LOG"
    pkill -TERM -P "$CLAUDE_PID" 2>/dev/null
    kill -TERM "$CLAUDE_PID" 2>/dev/null
    sleep 10
    pkill -KILL -P "$CLAUDE_PID" 2>/dev/null
    kill -KILL "$CLAUDE_PID" 2>/dev/null
  fi
) &
WATCHDOG_PID=$!
wait "$CLAUDE_PID"
RC=$?
pkill -P "$WATCHDOG_PID" 2>/dev/null
kill "$WATCHDOG_PID" 2>/dev/null
echo "$(date '+%F %T') 返事係 終了 (exit=$RC)" >> "$LOG"
