import "server-only";
import { neon } from "@neondatabase/serverless";
import { DEFAULT_SETTINGS, type Decision, type Settings, type Triage } from "./tasks";

// App-owned state (weekly decisions, review settings, handwritten notes).
// Postgres when DATABASE_URL is set; otherwise an in-process store for DEMO=1.

export type Note = { id: string; imageUrl: string; createdAt: number; memo: string };

type Mem = { triage: Map<string, Triage>; settings: Settings; notes: Note[] };
const g = globalThis as unknown as { __tbMem?: Mem };
const mem: Mem = (g.__tbMem ??= { triage: new Map(), settings: { ...DEFAULT_SETTINGS }, notes: [] as Note[] });

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
