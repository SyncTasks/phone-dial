import { describe, expect, it } from "vitest";
import { rowsToTasks } from "@/lib/sheets";
import { decisionOf, reviewQueue, summarize, taskKey, type Triage } from "@/lib/tasks";
import { fromJst } from "@/lib/time";

const HEADER = ["No", "完了状態", "タスク名", "優先度", "象限", "期日", "投稿日時", "担当者", "発生元グループ", "備考", "参照URL"];
const NOW = fromJst(2026, 10, 8, 12);

describe("rowsToTasks", () => {
  const tasks = rowsToTasks([
    HEADER,
    ["1", "完了", "粗利プログラム修正", "高", "", "2025/12/12", "", "Kei", "G1"],
    ["539.0", "進行中", "ソフィアマックス確認", "中", "", "なる早", "2026/10/06 9:37:00", "Kei", "G2"],
    ["540", "", "空の状態は未着手", "-", "", "", "2026/10/07(水) 10:43", "Kei", "G2"],
    ["541", "未着手", "", "-"],
  ]);

  it("skips rows without a title and keeps sheet row numbers", () => {
    expect(tasks.map((t) => t.row)).toEqual([2, 3, 4]);
  });
  it("normalizes No into a stable key", () => {
    expect(tasks[1].key).toBe("s539");
    expect(taskKey("539")).toBe("s539");
  });
  it("splits real due dates from free text", () => {
    expect(tasks[0].due).toBe(fromJst(2025, 12, 12));
    expect(tasks[1].due).toBeNull();
    expect(tasks[1].dueText).toBe("なる早");
  });
  it("defaults an empty status to 未着手", () => {
    expect(tasks[2].status).toBe("未着手");
  });
  it("finds columns by header name, not position", () => {
    const swapped = rowsToTasks([["タスク名", "No", "完了状態"], ["A", "7", "保留"]]);
    expect(swapped[0]).toMatchObject({ title: "A", no: "7", status: "保留" });
  });
});

describe("weekly decisions", () => {
  const tasks = rowsToTasks([
    HEADER,
    ["1", "未着手", "a", "-", "", "", "2026/10/01 10:00"],
    ["2", "進行中", "b", "-", "", "", "2026/09/01 10:00"],
    ["3", "未着手", "c", "高", "", "", "2026/09/02 10:00"],
    ["4", "完了", "d", "-"],
    ["5", "メモ", "e", "-"],
  ]);
  const t = (decision: Triage["decision"], week: string): Triage => ({ taskKey: "", decision, week, decidedAt: 0, title: "" });

  it("expires do/later at the end of the week but keeps skip", () => {
    const triage = { s1: t("do", "2026-09-28"), s2: t("skip", "2026-09-28"), s3: t("later", "2026-10-05") };
    expect(decisionOf(tasks[0], triage, NOW)).toBeNull();
    expect(decisionOf(tasks[1], triage, NOW)).toBe("skip");
    expect(decisionOf(tasks[2], triage, NOW)).toBe("later");
  });

  it("queues open tasks: in progress first, then priority, then newest", () => {
    expect(reviewQueue(tasks, {}, NOW).map((x) => x.no)).toEqual(["2", "3", "1"]);
  });

  it("computes completion rate without memos", () => {
    expect(summarize(tasks, {}, NOW).rate).toBe(25); // 1 done of 4 non-memo
  });
});
