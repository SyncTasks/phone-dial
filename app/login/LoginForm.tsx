"use client";

import { useActionState } from "react";
import { login } from "../actions";

export function LoginForm({ next }: { next: string }) {
  const [error, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="panel">
      <h1>久保田タスクボード</h1>
      <input type="hidden" name="next" value={next} />
      <label className="note" htmlFor="password">パスワード</label>
      <input id="password" name="password" type="password" className="field" autoComplete="current-password" required autoFocus />
      {error && <p className="banner err" role="alert">{error}</p>}
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "確認中…" : "ログイン"}
      </button>
    </form>
  );
}
