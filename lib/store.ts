import "server-only";
import { neon } from "@neondatabase/serverless";
import type { DoneEntry, Focus } from "./focus";
import type { Action, AiRequest, RequestKind, RequestStatus } from "./ops";
import { DEFAULT_SETTINGS, type Decision, type Settings, type Triage } from "./tasks";
import type { Consult } from "./team";
import { weekKey } from "./time";

// App-owned state (weekly decisions, review settings, handwritten notes, focus,
// parking memos, consult flags, done log, AI requests).
// Postgres when DATABASE_URL is set; otherwise an in-process store for DEMO=1.

export type Note = { id: string; imageUrl: string; createdAt: number; memo: string };
export type Parking = { id: string; text: string; createdAt: number };

type Mem = {
  triage: Map<string, Triage>;
  settings: Settings;
  notes: Note[];
  focus: Focus | null;
  parking: Parking[];
  consults: Map<string, Consult>;
  doneLog: Map<string, DoneEntry>;
  requests: AiRequest[];
};
const g = globalThis as unknown as { __tbMem?: Mem };
const mem: Mem = (g.__tbMem ??= seedMem());

function seedMem(): Mem {
  const m: Mem = {
    triage: new Map(),
    settings: { ...DEFAULT_SETTINGS },
    notes: [],
    focus: null,
    parking: [],
    consults: new Map(),
    doneLog: new Map(),
    requests: [],
  };
  if (process.env.DEMO !== "1") return m;
  // Invented sample state so every screen has something to show in DEMO=1.
  const now = Date.now();
  const min = 60000;
  const week = weekKey(now);
  for (const [key, title, ago] of [["s197", "求人ボックスの通知漏れを調査", 50], ["s196", "kbx bot の設定漏れ時に通知を出す", 40]] as const) {
    m.triage.set(key, { taskKey: key, decision: "do", week, decidedAt: now - ago * min, title });
  }
  m.parking.push(
    { id: "p1", text: "ジモティの投稿文をABテストしたい", createdAt: now - 90 * min },
    { id: "p2", text: "朝会の議事録をBrainに自動で残せないか", createdAt: now - 20 * min },
  );
  m.doneLog.set("s186", { taskKey: "s186", title: "粗利プログラム修正", doneAt: now - 26 * 60 * min });
  m.requests.push(
    {
      id: "demo-done",
      kind: "chat",
      text: "今週の残りで何を優先したらいい？",
      taskKey: null,
      status: "done",
      reply:
        "今週やるに入ってる「求人ボックスの通知漏れを調査」から片付けるのがよさそう！\n「代理店アカウントのシートでプルダウン変更時に通知」は来週でも間に合いそうだから、優先度を下げておく？",
      actions: [
        { id: "a1", label: "求人ボックスの調査を進行中にする", op: { type: "setStatus", taskKey: "s197", status: "進行中" }, done: false },
        { id: "a2", label: "代理店シートの通知を優先度 低に", op: { type: "setPrio", taskKey: "s195", prio: "低" }, done: false },
        { id: "a3", label: "kbx bot の通知を実装して", op: { type: "dev", taskKey: "s196" }, done: false },
      ],
      createdAt: now - 30 * min,
      updatedAt: now - 28 * min,
    },
    {
      id: "demo-pending",
      kind: "chat",
      text: "朝会の議事録をBrainに残す仕組み、タスクにする価値ある？",
      taskKey: null,
      status: "pending",
      reply: "",
      actions: [],
      createdAt: now - 4 * min,
      updatedAt: now - 4 * min,
    },
  );
  return m;
}

export const dbConfigured = () => Boolean(process.env.DATABASE_URL);
const sql = () => neon(process.env.DATABASE_URL!);

export async function listTriage(): Promise<Record<string, Triage>> {
  if (!dbConfigured()) return Object.fromEntries(mem.triage);
  const rows = await sql()`select task_key, decision, week, decided_at, title from triage`;
  return Object.fromEntries(
    rows.map((r) => [
      r.task_key as string,
      {
        taskKey: r.task_key as string,
        decision: r.decision as Decision,
        week: r.week as string,
        decidedAt: Number(r.decided_at),
        title: r.title as string,
      },
    ]),
  );
}

export async function setTriage(t: Triage) {
  if (!dbConfigured()) return void mem.triage.set(t.taskKey, t);
  await sql()`insert into triage (task_key, decision, week, decided_at, title)
    values (${t.taskKey}, ${t.decision}, ${t.week}, ${t.decidedAt}, ${t.title})
    on conflict (task_key) do update set decision = excluded.decision, week = excluded.week,
      decided_at = excluded.decided_at, title = excluded.title`;
}

export async function deleteTriage(taskKey: string) {
  if (!dbConfigured()) return void mem.triage.delete(taskKey);
  await sql()`delete from triage where task_key = ${taskKey}`;
}

export async function getSettings(): Promise<Settings> {
  if (!dbConfigured()) return { ...mem.settings };
  const rows = await sql()`select review_dow, review_time, last_review_at from settings where id = 1`;
  const r = rows[0];
  if (!r) return { ...DEFAULT_SETTINGS };
  return {
    reviewDow: Number(r.review_dow),
    reviewTime: String(r.review_time),
    lastReviewAt: r.last_review_at == null ? null : Number(r.last_review_at),
  };
}

export async function saveSettings(patch: Partial<Settings>) {
  const next = { ...(await getSettings()), ...patch };
  if (!dbConfigured()) {
    mem.settings = next;
    return next;
  }
  await sql()`insert into settings (id, review_dow, review_time, last_review_at)
    values (1, ${next.reviewDow}, ${next.reviewTime}, ${next.lastReviewAt})
    on conflict (id) do update set review_dow = excluded.review_dow, review_time = excluded.review_time,
      last_review_at = excluded.last_review_at`;
  return next;
}

export async function listNotes(): Promise<Note[]> {
  if (!dbConfigured()) return [...mem.notes].sort((a, b) => b.createdAt - a.createdAt);
  const rows = await sql()`select id, image_url, created_at, memo from notes order by created_at desc limit 200`;
  return rows.map((r) => ({
    id: r.id as string,
    imageUrl: r.image_url as string,
    createdAt: Number(r.created_at),
    memo: r.memo as string,
  }));
}

export async function addNote(n: Note) {
  if (!dbConfigured()) return void mem.notes.push(n);
  await sql()`insert into notes (id, image_url, created_at, memo) values (${n.id}, ${n.imageUrl}, ${n.createdAt}, ${n.memo})`;
}

export async function updateNoteMemo(id: string, memo: string) {
  if (!dbConfigured()) {
    const n = mem.notes.find((x) => x.id === id);
    if (n) n.memo = memo;
    return;
  }
  await sql()`update notes set memo = ${memo} where id = ${id}`;
}

export async function removeNote(id: string): Promise<Note | null> {
  if (!dbConfigured()) {
    const i = mem.notes.findIndex((x) => x.id === id);
    return i >= 0 ? mem.notes.splice(i, 1)[0] : null;
  }
  const rows = await sql()`delete from notes where id = ${id} returning id, image_url, created_at, memo`;
  const r = rows[0];
  return r ? { id: r.id as string, imageUrl: r.image_url as string, createdAt: Number(r.created_at), memo: r.memo as string } : null;
}

/* ---------- focus (the task the user pressed 始める on) ---------- */

export async function getFocus(): Promise<Focus | null> {
  if (!dbConfigured()) return mem.focus ? { ...mem.focus } : null;
  const rows = await sql()`select task_key, started_at from focus where id = 1`;
  const r = rows[0];
  return r?.task_key ? { taskKey: r.task_key as string, startedAt: Number(r.started_at) } : null;
}

export async function setFocus(f: Focus | null) {
  if (!dbConfigured()) return void (mem.focus = f ? { ...f } : null);
  if (!f) return void (await sql()`delete from focus where id = 1`);
  await sql()`insert into focus (id, task_key, started_at) values (1, ${f.taskKey}, ${f.startedAt})
    on conflict (id) do update set task_key = excluded.task_key, started_at = excluded.started_at`;
}

/* ---------- parking (思いついたことのメモ; not the sheet) ---------- */

export async function listParking(): Promise<Parking[]> {
  if (!dbConfigured()) return [...mem.parking].sort((a, b) => a.createdAt - b.createdAt);
  const rows = await sql()`select id, text, created_at from parking order by created_at asc limit 500`;
  return rows.map((r) => ({ id: r.id as string, text: r.text as string, createdAt: Number(r.created_at) }));
}

export async function addParking(p: Parking) {
  if (!dbConfigured()) return void mem.parking.push(p);
  await sql()`insert into parking (id, text, created_at) values (${p.id}, ${p.text}, ${p.createdAt})`;
}

export async function removeParking(id: string): Promise<Parking | null> {
  if (!dbConfigured()) {
    const i = mem.parking.findIndex((x) => x.id === id);
    return i >= 0 ? mem.parking.splice(i, 1)[0] : null;
  }
  const rows = await sql()`delete from parking where id = ${id} returning id, text, created_at`;
  const r = rows[0];
  return r ? { id: r.id as string, text: r.text as string, createdAt: Number(r.created_at) } : null;
}

/* ---------- consult flags (相談したい印, shown on the team page) ---------- */

export async function listConsults(): Promise<Consult[]> {
  if (!dbConfigured()) return [...mem.consults.values()].sort((a, b) => a.createdAt - b.createdAt);
  const rows = await sql()`select task_key, title, created_at from consult order by created_at asc`;
  return rows.map((r) => ({ taskKey: r.task_key as string, title: r.title as string, createdAt: Number(r.created_at) }));
}

export async function setConsult(c: Consult) {
  if (!dbConfigured()) return void (mem.consults.has(c.taskKey) || mem.consults.set(c.taskKey, c));
  await sql()`insert into consult (task_key, title, created_at) values (${c.taskKey}, ${c.title}, ${c.createdAt})
    on conflict (task_key) do nothing`;
}

export async function clearConsult(taskKey: string) {
  if (!dbConfigured()) return void mem.consults.delete(taskKey);
  await sql()`delete from consult where task_key = ${taskKey}`;
}

/* ---------- done log (the sheet has no completion date) ---------- */

export async function listDone(sinceMs: number): Promise<DoneEntry[]> {
  if (!dbConfigured()) return [...mem.doneLog.values()].filter((d) => d.doneAt >= sinceMs).sort((a, b) => b.doneAt - a.doneAt);
  const rows = await sql()`select task_key, title, done_at from done_log where done_at >= ${sinceMs} order by done_at desc limit 500`;
  return rows.map((r) => ({ taskKey: r.task_key as string, title: r.title as string, doneAt: Number(r.done_at) }));
}

export async function logDone(d: DoneEntry) {
  if (!dbConfigured()) return void mem.doneLog.set(d.taskKey, d);
  await sql()`insert into done_log (task_key, title, done_at) values (${d.taskKey}, ${d.title}, ${d.doneAt})
    on conflict (task_key) do update set title = excluded.title, done_at = excluded.done_at`;
}

export async function unlogDone(taskKey: string) {
  if (!dbConfigured()) return void mem.doneLog.delete(taskKey);
  await sql()`delete from done_log where task_key = ${taskKey}`;
}

/* ---------- AI requests (processed by Claude Code on the Mac) ---------- */

type Row = Record<string, unknown>;
const toRequest = (r: Row): AiRequest => ({
  id: r.id as string,
  kind: r.kind as RequestKind,
  text: r.text as string,
  taskKey: (r.task_key as string | null) ?? null,
  status: r.status as RequestStatus,
  reply: (r.reply as string) ?? "",
  actions: (typeof r.actions === "string" ? JSON.parse(r.actions) : r.actions ?? []) as Action[],
  createdAt: Number(r.created_at),
  updatedAt: Number(r.updated_at),
});
const copy = (r: AiRequest): AiRequest => ({ ...r, actions: r.actions.map((a) => ({ ...a, op: { ...a.op } })) });

export async function listRequests(limit = 20): Promise<AiRequest[]> {
  if (!dbConfigured()) return [...mem.requests].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit).map(copy);
  const rows = await sql()`select * from ai_requests order by created_at desc limit ${limit}`;
  return rows.map(toRequest);
}

/** pending + doing (the worker queue decides which doing ones are stale). */
export async function listOpenRequests(): Promise<AiRequest[]> {
  if (!dbConfigured()) return mem.requests.filter((r) => r.status === "pending" || r.status === "doing").map(copy);
  const rows = await sql()`select * from ai_requests where status in ('pending','doing') order by created_at asc limit 50`;
  return rows.map(toRequest);
}

export async function getRequest(id: string): Promise<AiRequest | null> {
  if (!dbConfigured()) {
    const r = mem.requests.find((x) => x.id === id);
    return r ? copy(r) : null;
  }
  const rows = await sql()`select * from ai_requests where id = ${id}`;
  return rows[0] ? toRequest(rows[0]) : null;
}

export async function createRequest(r: AiRequest) {
  if (!dbConfigured()) return void mem.requests.push(copy(r));
  await sql()`insert into ai_requests (id, kind, text, task_key, status, reply, actions, created_at, updated_at)
    values (${r.id}, ${r.kind}, ${r.text}, ${r.taskKey}, ${r.status}, ${r.reply}, ${JSON.stringify(r.actions)}::jsonb, ${r.createdAt}, ${r.updatedAt})`;
}

export async function updateRequest(id: string, patch: { status: RequestStatus; reply?: string; actions?: Action[] }, now = Date.now()) {
  if (!dbConfigured()) {
    const r = mem.requests.find((x) => x.id === id);
    if (!r) return null;
    r.status = patch.status;
    if (patch.reply !== undefined) r.reply = patch.reply;
    if (patch.actions !== undefined) r.actions = patch.actions;
    r.updatedAt = now;
    return copy(r);
  }
  const rows = await sql()`update ai_requests set
      status = ${patch.status},
      reply = coalesce(${patch.reply ?? null}, reply),
      actions = coalesce(${patch.actions ? JSON.stringify(patch.actions) : null}::jsonb, actions),
      updated_at = ${now}
    where id = ${id} returning *`;
  return rows[0] ? toRequest(rows[0]) : null;
}

/**
 * Flip one action button's done flag. Returns false when it already had that
 * value (e.g. a double press), so the caller runs the action at most once.
 */
export async function setActionDone(id: string, actionId: string, done: boolean) {
  const r = await getRequest(id);
  const a = r?.actions.find((x) => x.id === actionId);
  if (!r || !a || a.done === done) return false;
  const actions = r.actions.map((x) => (x.id === actionId ? { ...x, done } : x));
  if (!dbConfigured()) {
    const live = mem.requests.find((x) => x.id === id)!;
    if (live.actions.find((x) => x.id === actionId)?.done === done) return false;
    live.actions = actions;
    return true;
  }
  // Compare-and-swap: only flip it if nobody else did in the meantime.
  const rows = await sql()`update ai_requests set actions = ${JSON.stringify(actions)}::jsonb, updated_at = ${Date.now()}
    where id = ${id} and actions = ${JSON.stringify(r.actions)}::jsonb returning id`;
  return rows.length > 0;
}
