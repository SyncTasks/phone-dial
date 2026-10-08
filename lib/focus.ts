import { decisionOf, isActive, newestFirst, type Task, type Triage } from "./tasks";
import { daysFrom, mondayOf } from "./time";

// "今やること" selection for the 今日 page. Pure so it can be tested.

export type Focus = { taskKey: string; startedAt: number };
export type DoneEntry = { taskKey: string; title: string; doneAt: number };

export type FocusReason = "started" | "week" | "priority";
export type FocusPick = { task: Task; reason: FocusReason; startedAt: number | null };

const PRIO_RANK: Record<string, number> = { 高: 0, 中: 1, 低: 2 };
const prioRank = (t: Task) => PRIO_RANK[t.prio] ?? 3;

/** This week's 今週やる that are not finished, in the order they were decided. */
export function weekDoList(tasks: Task[], triage: Record<string, Triage>, now: number) {
  return tasks
    .filter((t) => isActive(t) && decisionOf(t, triage, now) === "do")
    .sort((a, b) => (triage[a.key]?.decidedAt ?? 0) - (triage[b.key]?.decidedAt ?? 0));
}

/** 進行中 / 未着手 not set aside this week, by priority, then 進行中 first, then due date, then newest. */
export function priorityList(tasks: Task[], triage: Record<string, Triage>, now: number) {
  return tasks
    .filter((t) => {
      if (!isActive(t)) return false;
      const d = decisionOf(t, triage, now);
      return d !== "skip" && d !== "later";
    })
    .sort(
      (a, b) =>
        prioRank(a) - prioRank(b) ||
        Number(b.status === "進行中") - Number(a.status === "進行中") ||
        (a.due ?? Infinity) - (b.due ?? Infinity) ||
        newestFirst(a, b),
    );
}

/**
 * The one task to show as "今やること":
 * 1. the task the user pressed 始める on (if it still exists and is not finished),
 * 2. else the first of this week's 今週やる,
 * 3. else the highest-priority 進行中 / 未着手.
 */
export function pickFocus(tasks: Task[], triage: Record<string, Triage>, focus: Focus | null, now: number): FocusPick | null {
  if (focus) {
    const t = tasks.find((x) => x.key === focus.taskKey);
    if (t && isActive(t)) return { task: t, reason: "started", startedAt: focus.startedAt };
  }
  const week = weekDoList(tasks, triage, now)[0];
  if (week) return { task: week, reason: "week", startedAt: null };
  const top = priorityList(tasks, triage, now)[0];
  return top ? { task: top, reason: "priority", startedAt: null } : null;
}

/** The next `n` tasks after the focus: 今週やる first, then by priority. */
export function nextUp(tasks: Task[], triage: Record<string, Triage>, focusKey: string | null, now: number, n = 2) {
  const seen = new Set<string>(focusKey ? [focusKey] : []);
  const out: Task[] = [];
  for (const t of [...weekDoList(tasks, triage, now), ...priorityList(tasks, triage, now)]) {
    if (seen.has(t.key)) continue;
    seen.add(t.key);
    out.push(t);
    if (out.length >= n) break;
  }
  return out;
}

/** Keys of tasks finished this week: the app's done log, plus this week's 今週やる already marked 完了 in the sheet. */
export function doneThisWeek(tasks: Task[], triage: Record<string, Triage>, doneLog: DoneEntry[], now: number) {
  const since = mondayOf(now);
  const keys = new Set(doneLog.filter((d) => d.doneAt >= since).map((d) => d.taskKey));
  for (const t of tasks) if (t.status === "完了" && decisionOf(t, triage, now) === "do") keys.add(t.key);
  return keys;
}

/** The one line of numbers on 今日. Overdue is reported as 繰り越し. */
export function todayNumbers(tasks: Task[], triage: Record<string, Triage>, doneLog: DoneEntry[], now: number) {
  const notSkipped = (t: Task) => decisionOf(t, triage, now) !== "skip";
  return {
    doing: tasks.filter((t) => t.status === "進行中").length,
    weekDo: weekDoList(tasks, triage, now).length,
    weekDone: doneThisWeek(tasks, triage, doneLog, now).size,
    carried: tasks.filter((t) => isActive(t) && notSkipped(t) && t.due != null && daysFrom(t.due, now) < 0).length,
  };
}
