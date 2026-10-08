#!/usr/bin/env python3
"""タスクボードの「リマに話す」依頼を Mac 側で扱う小さなクライアント（標準ライブラリのみ）。

worker/.env の TASKBOARD_URL と WORKER_TOKEN を読む。トークンはコマンドラインに出さない
（Claude Code にはこのスクリプト経由でだけ API を触らせる）。

使い方:
  python3 worker/tb.py count                 # 処理待ちの件数だけ表示（worker.sh 用）
  python3 worker/tb.py pending               # 処理待ちの依頼を JSON で表示
  python3 worker/tb.py context               # 未完了タスク・今やること・メモ・今日の予定を JSON で表示
  python3 worker/tb.py start <id>            # 依頼を「考え中」にする（最初に必ず呼ぶ）
  python3 worker/tb.py finish <id> <file>    # 返事を送る。file は {"reply": "...", "actions": [...]} の JSON
  python3 worker/tb.py fail <id> "<理由>"     # 処理できなかったことを返す

アプリ側は actions の op を厳しく検査し、1つでも不正なら全体を 400 で突き返す。
その場合は表示されたエラーを読んで直し、もう一度 finish する。
"""
import json
import os
import sys
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))


def load_env():
    path = os.path.join(HERE, ".env")
    env = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    url = os.environ.get("TASKBOARD_URL") or env.get("TASKBOARD_URL")
    token = os.environ.get("WORKER_TOKEN") or env.get("WORKER_TOKEN")
    if not url or not token:
        sys.exit("worker/.env に TASKBOARD_URL と WORKER_TOKEN を書いてください")
    return url.rstrip("/"), token


def call(method, path, body=None):
    url, token = load_env()
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url + path,
        data=data,
        method=method,
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")
        sys.exit(f"HTTP {e.code}: {detail}")
    except urllib.error.URLError as e:
        sys.exit(f"つながりません: {e.reason}")


def show(obj):
    print(json.dumps(obj, ensure_ascii=False, indent=2))


def main(argv):
    if not argv:
        sys.exit(__doc__)
    cmd, args = argv[0], argv[1:]
    if cmd == "count":
        print(len(call("GET", "/api/worker/pending")["requests"]))
    elif cmd == "pending":
        show(call("GET", "/api/worker/pending"))
    elif cmd == "context":
        show(call("GET", "/api/worker/context"))
    elif cmd == "start" and len(args) == 1:
        show(call("POST", f"/api/worker/requests/{args[0]}", {"status": "doing"}))
    elif cmd == "finish" and len(args) == 2:
        with open(os.path.expanduser(args[1]), encoding="utf-8") as f:
            body = json.load(f)
        if not isinstance(body, dict):
            sys.exit("JSON はオブジェクト（{\"reply\": ..., \"actions\": [...]}）にしてください")
        payload = {"status": "done", "reply": str(body.get("reply", ""))}
        if body.get("actions"):
            payload["actions"] = body["actions"]
        show(call("POST", f"/api/worker/requests/{args[0]}", payload))
    elif cmd == "fail" and len(args) == 2:
        show(call("POST", f"/api/worker/requests/{args[0]}", {"status": "error", "reply": args[1][:4000]}))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
