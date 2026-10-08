import "server-only";
import { revalidateTag } from "next/cache";
import { isDemo } from "./auth";
import { demoState, SHEET_TAG } from "./data";
import type { Op } from "./ops";
import { appendDevMarker, appendTask, updateTaskRow, withDevMarker, type TaskPatch } from "./sheets";
import * as store from "./store";
import { firstLine, normalizeStatus, taskKey, type Task } from "./tasks";
import { fmtSheetDate, fmtSheetStamp, parseDayKey, parseSheetDate } from "./time";

// The only paths that write to the sheet. Every sheet write goes through
// updateTaskRow / appendTask / appendDevMarker, which re-check the row's No.

type RowRef = { row: number; no: string; title?: string };

/** Write status / priority / due (already validated) and keep the done log in step. */
export async function patchTask(ref: RowRef, patch: TaskPatch) {
  if (isDemo()) {
    const t = demoState().tasks.find((x) => x.row === ref.row && x.no === ref.no);
    if (!t) throw new Error("demo task not found");
    if (patch.status) t.status = normalizeStatus(patch.status);
    if (patch.prio) t.prio = patch.prio;
    if (patch.due !== undefined) {
      t.due = parseSheetDate(patch.due);
      t.dueText = "";
    }
    ref = { ...ref, title: ref.title ?? t.title };
  } else {
    await updateTaskRow(ref.row, ref.no, patch);
    revalidateTag(SHEET_TAG);
  }
  if (patch.status) {
    const key = taskKey(ref.no);
    if (patch.status === "完了") {
      await store.logDone({ taskKey: key, title: firstLine(ref.title ?? "", 120), doneAt: Date.now() });
      await store.clearConsult(key);
    } else {
      await store.unlogDone(key);
    }
  }
}

/** Append a task to the sheet. `due` is "YYYY-MM-DD" or empty. Returns the new No. */
export async function createTask(input: { title: string; prio: string; due?: string; note?: string }) {
  const dueMs = input.due ? parseDayKey(input.due) : null;
  const now = Date.now();
  const group = process.env.TASK_SOURCE_NAME || "タスクボード";
  if (isDemo()) {
    const s = demoState();
    const no = String(Math.max(0, ...s.tasks.map((t) => Number(t.no) || 0)) + 1);
    const task: Task = { key: taskKey(no), no, row: s.tasks.length + 2, status: "未着手", title: input.title, prio: input.prio, due: dueMs, dueText: "", posted: now, group, note: input.note ?? "", url: "" };
    s.tasks.unshift(task);
    return no;
  }
  const no = await appendTask({
    title: input.title,
    prio: input.prio,
    due: dueMs == null ? "" : fmtSheetDate(dueMs),
    posted: fmtSheetStamp(now),
    owner: process.env.TASK_OWNER_NAME || "Kei Kubota",
    group,
    note: input.note,
  });
  revalidateTag(SHEET_TAG);
  return no;
}

/** Append " #AI" to 備考 so the autonomous-dev patrol picks the task up. */
export async function markForDev(t: Task) {
  if (isDemo()) {
    const live = demoState().tasks.find((x) => x.row === t.row && x.no === t.no);
    if (!live) throw new Error("demo task not found");
    const next = withDevMarker(live.note);
    if (next == null) return false;
    live.note = next;
    return true;
  }
  const changed = await appendDevMarker(t.row, t.no);
  revalidateTag(SHEET_TAG);
  return changed;
}

/** Run one validated op. Returns a short message for the toast. */
export async function runOp(op: Op, tasks: Task[]): Promise<string> {
  const find = (key: string) => {
    const t = tasks.find((x) => x.key === key);
    if (!t) throw new Error(`task ${key} not found`);
    return t;
  };
  switch (op.type) {
    case "setStatus": {
      const t = find(op.taskKey);
      await patchTask(t, { status: op.status });
      return `No.${t.no} を「${op.status}」にしました`;
    }
    case "setPrio": {
      const t = find(op.taskKey);
      await patchTask(t, { prio: op.prio });
      return `No.${t.no} の優先度を「${op.prio}」にしました`;
    }
    case "setDue": {
      const t = find(op.taskKey);
      const ms = op.due ? parseDayKey(op.due) : null;
      await patchTask(t, { due: ms == null ? "" : fmtSheetDate(ms) });
      return ms == null ? `No.${t.no} の期日を消しました` : `No.${t.no} の期日を ${fmtSheetDate(ms)} にしました`;
    }
    case "addTask": {
      const no = await createTask({ title: op.title, prio: op.prio ?? "-", due: op.due, note: op.note });
      return `スプシに No.${no} として追加しました`;
    }
    case "dev": {
      const t = find(op.taskKey);
      const changed = await markForDev(t);
      return changed ? `No.${t.no} を自動開発に回しました（備考に #AI）` : `No.${t.no} はもう自動開発に回っています`;
    }
    case "none":
      return "わかりました";
  }
}
