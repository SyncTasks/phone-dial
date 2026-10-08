import { doneThisWeek, weekDoList, type DoneEntry } from "./focus";
import { busyWeek, type BusyDay, type CalEvent } from "./schedule";
import type { Task, Triage } from "./tasks";

// What the read-only team page may show. Everything goes through here, and the
// result holds only short titles — never notes, URLs, groups, 未着手 outside
// 今週やる, メモ, parking, or event titles.

export type Consult = { taskKey: string; title: string; createdAt: number };

export type TeamItem = { no: string; title: string };
export type TeamView = {
  doing: TeamItem[];
  weekDo: TeamItem[];
  consult: (TeamItem & { since: number })[];
  doneRecent: (TeamItem & { doneAt: number | null })[];
  week: BusyDay[];
  updatedAt: number;
};

const URL_RE = /(https?:\/\/|www\.)\S+/gi;

/** First line, URLs removed, max 60 characters. */
export function publicTitle(title: string) {
  const line = (title.split("\n").find((x) => x.trim()) ?? "").replace(URL_RE, "（リンク）").replace(/\s+/g, " ").trim();
  return line.length > 60 ? line.slice(0, 60) + "…" : line || "(無題)";
}

export function teamView(
  tasks: Task[],
  triage: Record<string, Triage>,
  doneLog: DoneEntry[],
  consults: Consult[],
  events: CalEvent[],
  now: number,
): TeamView {
  const item = (t: Task): TeamItem => ({ no: t.no, title: publicTitle(t.title) });
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  const weekDo = weekDoList(tasks, triage, now);
  const weekDoKeys = new Set(weekDo.map((t) => t.key));
  const doing = tasks.filter((t) => t.status === "進行中" && !weekDoKeys.has(t.key));

  const since = now - 7 * 86400000;
  const done = new Map<string, TeamItem & { doneAt: number | null }>();
  for (const d of [...doneLog].sort((a, b) => b.doneAt - a.doneAt)) {
    if (d.doneAt < since || done.has(d.taskKey)) continue;
    const t = byKey.get(d.taskKey);
    if (t && t.status !== "完了") continue; // reopened since
    done.set(d.taskKey, { no: t?.no ?? "", title: publicTitle(t?.title ?? d.title), doneAt: d.doneAt });
  }
  for (const key of doneThisWeek(tasks, triage, [], now)) {
    const t = byKey.get(key);
    if (t && !done.has(key)) done.set(key, { ...item(t), doneAt: null });
  }

  const consult = consults
    .map((c) => ({ c, t: byKey.get(c.taskKey) }))
    .filter(({ t }) => !t || t.status !== "完了")
    .map(({ c, t }) => ({ no: t?.no ?? "", title: publicTitle(t?.title ?? c.title), since: c.createdAt }));

  return {
    doing: doing.map(item),
    weekDo: weekDo.map(item),
    consult,
    doneRecent: [...done.values()],
    week: busyWeek(events, now),
    updatedAt: now,
  };
}
