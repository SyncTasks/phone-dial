import { daysFrom, weekKey } from "./time";

export const STATUSES = ["進行中", "未着手", "保留", "メモ", "完了"] as const;
export type Status = (typeof STATUSES)[number];
export const PRIORITIES = ["高", "中", "低", "-"] as const;

export type Task = {
  /** Stable id derived from the sheet's No column, e.g. "s539". */
  key: string;
  no: string;
  /** 1-based sheet row, used to write back (verified against `no` first). */
  row: number;
  status: Status;
  title: string;
  prio: string;
  due: number | null;
  /** 期日 text that is not a date, e.g. "なる早". */
  dueText: string;
  posted: number | null;
  group: string;
  note: string;
  url: string;
};

export type Decision = "do" | "later" | "skip";
export const DECISION_LABEL: Record<Decision, string> = { do: "今週やる", later: "来週考える", skip: "やらない" };

export type Triage = { taskKey: string; decision: Decision; week: string; decidedAt: number; title: string };
export type Settings = { reviewDow: number; reviewTime: string; lastReviewAt: number | null };
export const DEFAULT_SETTINGS: Settings = { reviewDow: 1, reviewTime: "09:00", lastReviewAt: null };

export function taskKey(no: unknown) {
  const n = Number(String(no).trim());
  const id = Number.isFinite(n) && String(no).trim() !== "" ? String(n) : String(no ?? "").trim();
  return "s" + id.replace(/[^A-Za-z0-9]/g, "");
}

export function normalizeStatus(v: unknown): Status {
  const s = String(v ?? "").trim();
  return (STATUSES as readonly string[]).includes(s) ? (s as Status) : "未着手";
}

export const isActive = (t: Task) => t.status === "未着手" || t.status === "進行中";
export const isOpen = (t: Task) => isActive(t) || t.status === "保留";

/** The decision that applies this week: "skip" sticks; do/later expire with their week. */
export function decisionOf(t: Task, triage: Record<string, Triage>, now: number): Decision | null {
  const d = triage[t.key];
  if (!d) return null;
  if (d.decision === "skip") return "skip";
  return d.week === weekKey(now) ? d.decision : null;
}

export const newestFirst = (a: Task, b: Task) => (b.posted ?? 0) - (a.posted ?? 0) || Number(b.no) - Number(a.no);

/** Open tasks still waiting for this week's decision, in the order to review them. */
export function reviewQueue(tasks: Task[], triage: Record<string, Triage>, now: number) {
  const rank = (t: Task) => (t.status === "進行中" ? 0 : t.prio === "高" ? 1 : t.prio === "中" ? 2 : 3);
  return tasks
    .filter((t) => isOpen(t) && !decisionOf(t, triage, now))
    .sort((a, b) => rank(a) - rank(b) || newestFirst(a, b));
}

export function summarize(tasks: Task[], triage: Record<string, Triage>, now: number) {
  const by = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  for (const t of tasks) by[t.status]++;
  const denom = tasks.length - by["メモ"];
  const rate = denom > 0 ? Math.round((by["完了"] / denom) * 100) : 0;
  const notSkipped = (t: Task) => decisionOf(t, triage, now) !== "skip";
  const weekDo = tasks.filter((t) => t.status !== "完了" && decisionOf(t, triage, now) === "do");
  const late = tasks.filter((t) => isActive(t) && notSkipped(t) && t.due != null && daysFrom(t.due, now) < 0);
  const dueSoon = tasks.filter(
    (t) => isActive(t) && notSkipped(t) && t.due != null && daysFrom(t.due, now) >= 0 && daysFrom(t.due, now) <= 3,
  );
  const fresh = tasks.filter(
    (t) => t.status !== "完了" && t.status !== "メモ" && notSkipped(t) && t.posted != null && daysFrom(t.posted, now) >= -1,
  );
  return { by, rate, weekDo, late, dueSoon, fresh };
}

/** Tasks added per week (by 投稿日時) for the last `weeks` weeks, split by done / not done. */
export function weeklyFlow(tasks: Task[], now: number, weeks = 10) {
  const thisMonday = weekKey(now);
  const keys: string[] = [];
  const starts: number[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ms = now - i * 7 * 86400000;
    keys.push(weekKey(ms));
    starts.push(ms);
  }
  const rows = keys.map((k, i) => ({ week: k, start: starts[i], done: 0, rest: 0 }));
  const index = new Map(keys.map((k, i) => [k, i]));
  for (const t of tasks) {
    if (t.posted == null || t.status === "メモ") continue;
    const i = index.get(weekKey(t.posted));
    if (i == null) continue;
    if (t.status === "完了") rows[i].done++;
    else rows[i].rest++;
  }
  return { rows, thisMonday };
}

export function openByGroup(tasks: Task[], limit = 6) {
  const m = new Map<string, { doing: number; todo: number }>();
  for (const t of tasks) {
    if (!isActive(t)) continue;
    const k = t.group || "(なし)";
    const v = m.get(k) ?? { doing: 0, todo: 0 };
    if (t.status === "進行中") v.doing++;
    else v.todo++;
    m.set(k, v);
  }
  return [...m.entries()]
    .map(([name, v]) => ({ name, ...v, total: v.doing + v.todo }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export function firstLine(s: string, n: number) {
  const line = s.split("\n").find((x) => x.trim()) ?? "";
  return line.length > n ? line.slice(0, n) + "…" : line;
}
