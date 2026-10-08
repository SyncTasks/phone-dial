import { isActive, PRIORITIES, STATUSES, type Task } from "./tasks";
import { dayKey, parseDayKey } from "./time";

// AI requests (processed by Claude Code on the Mac) and the next-action buttons
// it proposes. A button only runs when the user presses it, and its op is
// validated against a strict whitelist both when the worker submits it and again
// right before it runs.

export const REQUEST_KINDS = ["chat", "dev", "consult"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];
export const REQUEST_STATUSES = ["pending", "doing", "done", "error"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export type Op =
  | { type: "setStatus"; taskKey: string; status: string }
  | { type: "setPrio"; taskKey: string; prio: string }
  | { type: "setDue"; taskKey: string; due: string }
  | { type: "addTask"; title: string; prio?: string; due?: string; note?: string }
  | { type: "dev"; taskKey: string }
  | { type: "none" };

export type Action = { id: string; label: string; op: Op; done: boolean };

export type AiRequest = {
  id: string;
  kind: RequestKind;
  text: string;
  taskKey: string | null;
  status: RequestStatus;
  reply: string;
  actions: Action[];
  createdAt: number;
  updatedAt: number;
};

export const MAX_ACTIONS = 3;
export const MAX_LABEL = 40;
export const MAX_REPLY = 4000;
export const MAX_REQUEST_TEXT = 1000;
/** A request stuck in "doing" this long is handed out again (the Mac was killed mid-way). */
export const STALE_DOING_MS = 40 * 60 * 1000;

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };
const bad = (error: string): Checked<never> => ({ ok: false, error });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : null);

function findTask(tasks: Task[], key: unknown): Checked<Task> {
  const k = str(key);
  if (!k || !/^s[A-Za-z0-9]{1,20}$/.test(k)) return bad("taskKey が不正です");
  const t = tasks.find((x) => x.key === k);
  return t ? { ok: true, value: t } : bad(`タスク ${k} が見つかりません`);
}

function dayOk(v: string) {
  const ms = parseDayKey(v);
  return ms != null && dayKey(ms) === v; // rejects 2026-02-30 and the like
}

/**
 * Validate one op. Only known fields are copied into the result, so anything
 * extra the worker sends is dropped. The target task must exist.
 */
export function validateOp(raw: unknown, tasks: Task[]): Checked<Op> {
  if (!isObj(raw)) return bad("op がありません");
  switch (raw.type) {
    case "setStatus": {
      const t = findTask(tasks, raw.taskKey);
      if (!t.ok) return t;
      const status = str(raw.status);
      if (!status || !(STATUSES as readonly string[]).includes(status)) return bad("状態の値が不正です");
      return { ok: true, value: { type: "setStatus", taskKey: t.value.key, status } };
    }
    case "setPrio": {
      const t = findTask(tasks, raw.taskKey);
      if (!t.ok) return t;
      const prio = str(raw.prio);
      if (!prio || !(PRIORITIES as readonly string[]).includes(prio)) return bad("優先度の値が不正です");
      return { ok: true, value: { type: "setPrio", taskKey: t.value.key, prio } };
    }
    case "setDue": {
      const t = findTask(tasks, raw.taskKey);
      if (!t.ok) return t;
      const due = str(raw.due);
      if (due == null || (due !== "" && !dayOk(due))) return bad("期日は YYYY-MM-DD（空で消す）で指定してください");
      return { ok: true, value: { type: "setDue", taskKey: t.value.key, due } };
    }
    case "addTask": {
      const title = str(raw.title)?.trim() ?? "";
      if (!title || title.length > 200) return bad("タスク名は1〜200文字です");
      const op: Op = { type: "addTask", title };
      if (raw.prio !== undefined && raw.prio !== null && raw.prio !== "") {
        const prio = str(raw.prio);
        if (!prio || !(PRIORITIES as readonly string[]).includes(prio)) return bad("優先度の値が不正です");
        op.prio = prio;
      }
      if (raw.due !== undefined && raw.due !== null && raw.due !== "") {
        const due = str(raw.due);
        if (!due || !dayOk(due)) return bad("期日は YYYY-MM-DD で指定してください");
        op.due = due;
      }
      if (raw.note !== undefined && raw.note !== null && raw.note !== "") {
        const note = str(raw.note);
        if (note == null || note.length > 500) return bad("備考は500文字までです");
        op.note = note;
      }
      return { ok: true, value: op };
    }
    case "dev": {
      const t = findTask(tasks, raw.taskKey);
      if (!t.ok) return t;
      if (!isActive(t.value) && t.value.status !== "保留") return bad("終わったタスクは実装に回せません");
      return { ok: true, value: { type: "dev", taskKey: t.value.key } };
    }
    case "none":
      return { ok: true, value: { type: "none" } };
    default:
      return bad(`使えない op です: ${String(raw.type)}`);
  }
}

/**
 * Validate the action buttons the worker proposes. Any invalid button rejects
 * the whole list (the worker should fix and resend). Ids and done flags are
 * assigned here, never taken from the worker.
 */
export function validateActions(raw: unknown, tasks: Task[]): Checked<Action[]> {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return bad("actions は配列で送ってください");
  if (raw.length > MAX_ACTIONS) return bad(`ボタンは${MAX_ACTIONS}個までです`);
  const out: Action[] = [];
  for (const [i, a] of raw.entries()) {
    if (!isObj(a)) return bad(`actions[${i}] が不正です`);
    const label = str(a.label)?.trim() ?? "";
    if (!label || label.length > MAX_LABEL) return bad(`actions[${i}].label は1〜${MAX_LABEL}文字です`);
    const op = validateOp(a.op, tasks);
    if (!op.ok) return bad(`actions[${i}]: ${op.error}`);
    out.push({ id: `a${i + 1}`, label, op: op.value, done: false });
  }
  return { ok: true, value: out };
}

export type WorkerUpdate = { status: RequestStatus; reply?: string; actions?: Action[] };

/** Validate the body of POST /api/worker/requests/[id]. */
export function validateWorkerUpdate(body: unknown, tasks: Task[]): Checked<WorkerUpdate> {
  if (!isObj(body)) return bad("JSON の本文がありません");
  const status = str(body.status);
  if (status !== "doing" && status !== "done" && status !== "error") return bad("status は doing / done / error のどれかです");
  const out: WorkerUpdate = { status };
  if (body.reply !== undefined) {
    const reply = str(body.reply);
    if (reply == null || reply.length > MAX_REPLY) return bad(`reply は${MAX_REPLY}文字までの文字列です`);
    out.reply = reply;
  }
  if (body.actions !== undefined) {
    if (status !== "done") return bad("actions は status=done のときだけ送れます");
    const actions = validateActions(body.actions, tasks);
    if (!actions.ok) return actions;
    out.actions = actions.value;
  }
  return { ok: true, value: out };
}

/** Requests the worker should pick up: pending, or doing for too long. Oldest first. */
export function workQueue(reqs: AiRequest[], now: number) {
  return reqs
    .filter((r) => r.status === "pending" || (r.status === "doing" && now - r.updatedAt > STALE_DOING_MS))
    .sort((a, b) => a.createdAt - b.createdAt);
}
