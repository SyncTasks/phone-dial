import { describe, expect, it } from "vitest";
import { teamView, publicTitle } from "@/lib/team";
import { rowsToTasks } from "@/lib/sheets";
import type { CalEvent } from "@/lib/schedule";
import type { Triage } from "@/lib/tasks";
import { fromJst } from "@/lib/time";

const NOW = fromJst(2026, 10, 8, 12);
const tasks = rowsToTasks([
  ["No", "完了状態", "タスク名", "優先度", "期日", "投稿日時", "発生元グループ", "備考", "参照URL"],
  ["1", "進行中", "公開してよい進行中", "高", "", "", "GROUP-SECRET", "NOTE-SECRET", "https://secret.example/a"],
  ["2", "未着手", "UNSTARTED-SECRET のアイデア", "-", "", "", "G", "NOTE-SECRET-2", ""],
  ["3", "未着手", "今週やる未着手 https://leak.example/x", "-", "", "", "G", "", ""],
  ["4", "メモ", "MEMO-SECRET", "-"],
  ["5", "完了", "終わったこと", "-"],
  ["6", "保留", "HOLD-SECRET", "-"],
  ["7", "完了", "先月終わった OLD-DONE", "-"],
]);
const triage: Record<string, Triage> = { s3: { taskKey: "s3", decision: "do", week: "2026-10-05", decidedAt: 1, title: "" } };
const events: CalEvent[] = [
  { id: "e1", title: "EVENT-SECRET 面談", start: fromJst(2026, 10, 8, 14), end: fromJst(2026, 10, 8, 15), allDay: false, busy: true },
];

describe("teamView", () => {
  const v = teamView(
    tasks,
    triage,
    [
      { taskKey: "s5", title: "終わったこと", doneAt: NOW - 86400000 },
      { taskKey: "s7", title: "先月終わった OLD-DONE", doneAt: NOW - 30 * 86400000 },
    ],
    [{ taskKey: "s1", title: "公開してよい進行中", createdAt: NOW }],
    events,
    NOW,
  );
  const dump = JSON.stringify(v);

  it("shows only 進行中, 今週やる, recent done and consult flags", () => {
    expect(v.doing.map((t) => t.no)).toEqual(["1"]);
    expect(v.weekDo.map((t) => t.no)).toEqual(["3"]);
    expect(v.doneRecent.map((t) => t.no)).toEqual(["5"]);
    expect(v.consult.map((t) => t.no)).toEqual(["1"]);
  });

  it("leaks nothing private", () => {
    for (const secret of ["SECRET", "secret.example", "leak.example", "http", "OLD-DONE", "面談", "GROUP"]) {
      expect(dump).not.toContain(secret);
    }
  });

  it("returns items as {no, title} only", () => {
    for (const t of [...v.doing, ...v.weekDo]) expect(Object.keys(t).sort()).toEqual(["no", "title"]);
    expect(v.weekDo[0].title).toBe("今週やる未着手 （リンク）");
  });

  it("strips URLs and extra lines from titles", () => {
    expect(publicTitle("一行目 www.example.com/x\n二行目")).toBe("一行目 （リンク）");
  });
});
