import { describe, expect, it } from "vitest";
import { doneThisWeek, nextUp, pickFocus, todayNumbers } from "@/lib/focus";
import { rowsToTasks } from "@/lib/sheets";
import type { Triage } from "@/lib/tasks";
import { fromJst } from "@/lib/time";

const HEADER = ["No", "完了状態", "タスク名", "優先度", "象限", "期日", "投稿日時"];
const NOW = fromJst(2026, 10, 8, 12); // Thu; week starts 2026-10-05
const tasks = rowsToTasks([
  HEADER,
  ["1", "未着手", "low todo", "-", "", "", "2026/10/01 10:00"],
  ["2", "進行中", "doing mid", "中", "", "", "2026/09/01 10:00"],
  ["3", "未着手", "high todo", "高", "", "2026/10/01", "2026/09/02 10:00"],
  ["4", "完了", "finished", "高"],
  ["5", "メモ", "memo", "高"],
  ["6", "未着手", "week do A", "-"],
  ["7", "未着手", "week do B", "-"],
  ["8", "未着手", "skipped high", "高"],
  ["9", "保留", "on hold", "高"],
]);
const tri = (key: string, decision: Triage["decision"], decidedAt: number, week = "2026-10-05"): Triage => ({ taskKey: key, decision, week, decidedAt, title: "" });

describe("pickFocus", () => {
  it("prefers the task the user started", () => {
    const p = pickFocus(tasks, {}, { taskKey: "s1", startedAt: 5 }, NOW);
    expect(p).toMatchObject({ reason: "started", startedAt: 5 });
    expect(p?.task.no).toBe("1");
  });

  it("ignores a started task that is finished or gone", () => {
    expect(pickFocus(tasks, {}, { taskKey: "s4", startedAt: 5 }, NOW)?.reason).not.toBe("started");
    expect(pickFocus(tasks, {}, { taskKey: "s999", startedAt: 5 }, NOW)?.reason).not.toBe("started");
  });

  it("falls back to the first 今週やる, in the order decided", () => {
    const triage = { s7: tri("s7", "do", 1), s6: tri("s6", "do", 2) };
    const p = pickFocus(tasks, triage, null, NOW);
    expect(p).toMatchObject({ reason: "week" });
    expect(p?.task.no).toBe("7");
  });

  it("ignores 今週やる from an earlier week", () => {
    const p = pickFocus(tasks, { s7: tri("s7", "do", 1, "2026-09-28") }, null, NOW);
    expect(p?.reason).toBe("priority");
  });

  it("otherwise takes the highest priority 進行中/未着手, skipping やらない and 来週考える", () => {
    const triage = { s8: tri("s8", "skip", 1, "2026-01-05") };
    const p = pickFocus(tasks, triage, null, NOW);
    expect(p).toMatchObject({ reason: "priority" });
    expect(p?.task.no).toBe("3");
    const p2 = pickFocus(tasks, { ...triage, s3: tri("s3", "later", 1) }, null, NOW);
    expect(p2?.task.no).toBe("2");
  });

  it("returns null when nothing is open", () => {
    expect(pickFocus(tasks.filter((t) => t.status === "完了"), {}, null, NOW)).toBeNull();
  });
});

describe("nextUp", () => {
  it("lists the next two without the focus or duplicates", () => {
    const triage = { s6: tri("s6", "do", 1), s7: tri("s7", "do", 2), s8: tri("s8", "skip", 1) };
    expect(nextUp(tasks, triage, "s6", NOW).map((t) => t.no)).toEqual(["7", "3"]);
    expect(nextUp(tasks, {}, "s3", NOW, 5).map((t) => t.no)).not.toContain("3");
  });
});

describe("numbers", () => {
  it("counts this week's completions from the log and finished 今週やる", () => {
    const log = [
      { taskKey: "s4", title: "finished", doneAt: fromJst(2026, 10, 6, 9) },
      { taskKey: "s100", title: "last week", doneAt: fromJst(2026, 10, 2, 9) },
    ];
    expect([...doneThisWeek(tasks, {}, log, NOW)]).toEqual(["s4"]);
    const n = todayNumbers(tasks, { s6: tri("s6", "do", 1) }, log, NOW);
    expect(n).toEqual({ doing: 1, weekDo: 1, weekDone: 1, carried: 1 });
  });
});
