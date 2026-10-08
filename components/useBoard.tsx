"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { updateTask } from "@/app/actions";
import type { Status, Task, Triage } from "@/lib/tasks";
import { parseDayKey } from "@/lib/time";

export type Toast = { text: string; err?: boolean } | null;

export function useToast() {
  const [toast, setToast] = useState<Toast>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string, err = false) => {
    setToast({ text, err });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), err ? 6000 : 2500);
  }, []);
  return { toast, show };
}

export type TaskPatchInput = { status?: Status; prio?: string; due?: string | null };

/** Local copy of the sheet's tasks with optimistic writes back to the sheet. */
export function useTasks(initial: Task[], notify: (text: string, err?: boolean) => void) {
  const [tasks, setTasks] = useState(initial);
  const [pending, setPending] = useState<Set<string>>(new Set());
  useEffect(() => setTasks(initial), [initial]);

  const patch = useCallback(
    async (t: Task, p: TaskPatchInput) => {
      const before = t;
      const after: Task = {
        ...t,
        ...(p.status ? { status: p.status } : {}),
        ...(p.prio ? { prio: p.prio } : {}),
        ...(p.due !== undefined ? { due: p.due ? parseDayKey(p.due) : null, dueText: "" } : {}),
      };
      setTasks((list) => list.map((x) => (x.key === t.key ? after : x)));
      setPending((s) => new Set(s).add(t.key));
      const res = await updateTask({ row: t.row, no: t.no, ...p });
      setPending((s) => {
        const n = new Set(s);
        n.delete(t.key);
        return n;
      });
      if (!res.ok) {
        setTasks((list) => list.map((x) => (x.key === t.key ? before : x)));
        notify(res.error, true);
      } else if (p.status) {
        notify(`「${p.status}」にしました`);
      } else {
        notify("スプシに保存しました");
      }
    },
    [notify],
  );

  return { tasks, setTasks, patch, pending };
}

export function useTriage(initial: Record<string, Triage>) {
  const [triage, setTriage] = useState(initial);
  useEffect(() => setTriage(initial), [initial]);
  return [triage, setTriage] as const;
}

export function ToastView({ toast }: { toast: Toast }) {
  if (!toast) return null;
  return (
    <div className={`toast${toast.err ? " err" : ""}`} role={toast.err ? "alert" : "status"}>
      {toast.text}
    </div>
  );
}

/** Current time, re-rendered every `every` ms (starts from the server's `initial` to avoid a hydration mismatch). */
export function useNow(initial: number, every = 30000) {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(id);
  }, [every]);
  return now;
}

/** "25分" / "1時間5分" */
export function fmtSpan(ms: number) {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min}分`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}時間${m}分` : `${h}時間`;
}
