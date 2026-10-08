import { describe, expect, it } from "vitest";
import { STALE_DOING_MS, validateActions, validateOp, validateWorkerUpdate, workQueue, type AiRequest } from "@/lib/ops";
import { rowsToTasks, withDevMarker } from "@/lib/sheets";

const tasks = rowsToTasks([
  ["No", "完了状態", "タスク名", "備考"],
  ["10", "未着手", "open task", ""],
  ["11", "完了", "done task", ""],
]);

describe("validateOp", () => {
  it("accepts the whitelisted ops and drops unknown fields", () => {
    expect(validateOp({ type: "setStatus", taskKey: "s10", status: "進行中", row: 999, extra: "x" }, tasks)).toEqual({
      ok: true,
      value: { type: "setStatus", taskKey: "s10", status: "進行中" },
    });
    expect(validateOp({ type: "setPrio", taskKey: "s10", prio: "高" }, tasks).ok).toBe(true);
    expect(validateOp({ type: "setDue", taskKey: "s10", due: "2026-10-31" }, tasks).ok).toBe(true);
    expect(validateOp({ type: "setDue", taskKey: "s10", due: "" }, tasks).ok).toBe(true);
    expect(validateOp({ type: "addTask", title: " 新しい ", prio: "中", due: "2026-11-01", note: "n" }, tasks)).toEqual({
      ok: true,
      value: { type: "addTask", title: "新しい", prio: "中", due: "2026-11-01", note: "n" },
    });
    expect(validateOp({ type: "dev", taskKey: "s10" }, tasks).ok).toBe(true);
    expect(validateOp({ type: "none" }, tasks)).toEqual({ ok: true, value: { type: "none" } });
  });

  it("rejects unknown types and malformed input", () => {
    for (const raw of [null, "setStatus", [], {}, { type: "deleteRow", taskKey: "s10" }, { type: "SETSTATUS", taskKey: "s10", status: "完了" }, { type: "__proto__" }]) {
      expect(validateOp(raw, tasks).ok).toBe(false);
    }
  });

  it("rejects invalid values", () => {
    expect(validateOp({ type: "setStatus", taskKey: "s10", status: "済" }, tasks).ok).toBe(false);
    expect(validateOp({ type: "setStatus", taskKey: "s10", status: 1 }, tasks).ok).toBe(false);
    expect(validateOp({ type: "setPrio", taskKey: "s10", prio: "最高" }, tasks).ok).toBe(false);
    expect(validateOp({ type: "setDue", taskKey: "s10", due: "2026/10/31" }, tasks).ok).toBe(false);
    expect(validateOp({ type: "setDue", taskKey: "s10", due: "2026-02-30" }, tasks).ok).toBe(false);
    expect(validateOp({ type: "addTask", title: "" }, tasks).ok).toBe(false);
    expect(validateOp({ type: "addTask", title: "x".repeat(201) }, tasks).ok).toBe(false);
    expect(validateOp({ type: "addTask", title: "ok", prio: "急ぎ" }, tasks).ok).toBe(false);
    expect(validateOp({ type: "addTask", title: "ok", due: "tomorrow" }, tasks).ok).toBe(false);
  });

  it("requires the task to exist (and dev only for unfinished tasks)", () => {
    expect(validateOp({ type: "setStatus", taskKey: "s999", status: "完了" }, tasks).ok).toBe(false);
    expect(validateOp({ type: "setPrio", taskKey: "10", prio: "高" }, tasks).ok).toBe(false);
    expect(validateOp({ type: "setPrio", taskKey: "s10'; drop", prio: "高" }, tasks).ok).toBe(false);
    expect(validateOp({ type: "dev", taskKey: "s11" }, tasks).ok).toBe(false);
  });
});

describe("validateActions / validateWorkerUpdate", () => {
  it("assigns ids itself and rejects the whole list if one button is bad", () => {
    const ok = validateActions([{ id: "evil", label: "進める", op: { type: "setStatus", taskKey: "s10", status: "進行中" }, done: true }], tasks);
    expect(ok).toEqual({ ok: true, value: [{ id: "a1", label: "進める", op: { type: "setStatus", taskKey: "s10", status: "進行中" }, done: false }] });
    expect(validateActions([{ label: "a", op: { type: "none" } }, { label: "b", op: { type: "rm" } }], tasks).ok).toBe(false);
    expect(validateActions([{ label: "", op: { type: "none" } }], tasks).ok).toBe(false);
    expect(validateActions(Array(4).fill({ label: "a", op: { type: "none" } }), tasks).ok).toBe(false);
    expect(validateActions({ label: "a" }, tasks).ok).toBe(false);
  });

  it("checks status and only allows actions with done", () => {
    expect(validateWorkerUpdate({ status: "doing" }, tasks).ok).toBe(true);
    expect(validateWorkerUpdate({ status: "pending" }, tasks).ok).toBe(false);
    expect(validateWorkerUpdate({ status: "doing", actions: [{ label: "a", op: { type: "none" } }] }, tasks).ok).toBe(false);
    expect(validateWorkerUpdate({ status: "done", reply: 5 }, tasks).ok).toBe(false);
    expect(validateWorkerUpdate({ status: "done", reply: "x".repeat(4001) }, tasks).ok).toBe(false);
    const r = validateWorkerUpdate({ status: "done", reply: "はい", actions: [{ label: "OK", op: { type: "none" } }] }, tasks);
    expect(r.ok && r.value.actions?.length).toBe(1);
  });
});

describe("workQueue", () => {
  const req = (id: string, status: AiRequest["status"], createdAt: number, updatedAt = createdAt): AiRequest => ({
    id, kind: "chat", text: "", taskKey: null, status, reply: "", actions: [], createdAt, updatedAt,
  });
  it("hands out pending, and doing only when stale, oldest first", () => {
    const now = 10 * STALE_DOING_MS;
    const q = workQueue([req("b", "pending", 5), req("a", "pending", 1), req("fresh", "doing", 2, now - 1000), req("stale", "doing", 3, now - STALE_DOING_MS - 1), req("d", "done", 0)], now);
    expect(q.map((r) => r.id)).toEqual(["a", "stale", "b"]);
  });
});

describe("withDevMarker", () => {
  it("appends #AI once", () => {
    expect(withDevMarker("")).toBe("#AI");
    expect(withDevMarker("メモ ")).toBe("メモ #AI");
    expect(withDevMarker("やる #AI")).toBeNull();
    expect(withDevMarker("やる ＃ai")).toBeNull();
    expect(withDevMarker("#AIRDROP調査")).toBe("#AIRDROP調査 #AI");
  });
});
