"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { decisionOf, newestFirst, openByGroup, STATUSES, weeklyFlow, type Task, type Triage } from "@/lib/tasks";
import { GroupBars, WeeklyBars } from "./Charts";
import { AddTask } from "./AddTask";
import { TaskRow } from "./TaskRow";
import { ToastView, useTasks, useToast } from "./useBoard";

const FILTERS = [...STATUSES, "すべて"] as const;
type Filter = (typeof FILTERS)[number];
const PAGE = 50;

export function TaskListView({ initialTasks, triage, now }: { initialTasks: Task[]; triage: Record<string, Triage>; now: number }) {
  const params = useSearchParams();
  const router = useRouter();
  const initialFilter = (FILTERS as readonly string[]).includes(params.get("status") ?? "") ? (params.get("status") as Filter) : "未着手";
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [limit, setLimit] = useState(PAGE);
  const { toast, show } = useToast();
  const { tasks, patch, pending } = useTasks(initialTasks, show);

  const counts = useMemo(() => {
    const c: Record<string, number> = { すべて: tasks.length };
    for (const s of STATUSES) c[s] = 0;
    for (const t of tasks) c[t.status]++;
    return c;
  }, [tasks]);

  const q = query.trim().toLowerCase();
  const list = tasks
    .filter((t) => filter === "すべて" || t.status === filter)
    .filter((t) => !q || `${t.title} ${t.note} ${t.group} ${t.no}`.toLowerCase().includes(q))
    .sort(newestFirst);

  const pick = (f: Filter) => {
    setFilter(f);
    setLimit(PAGE);
    router.replace(`/tasks?status=${encodeURIComponent(f)}`, { scroll: false });
  };

  return (
    <>
      <section className="panel" aria-label="タスクを追加">
        <AddTask notify={show} />
      </section>
      <section className="panel" aria-labelledby="h-list">
        <div className="panel-head">
          <h2 id="h-list">タスク一覧</h2>
          <span className="sub">新しい順・タップで状態や期日を変更（スプシに反映）</span>
        </div>
        <div className="controls">
          <div className="tabs" role="group" aria-label="状態で絞り込み">
            {FILTERS.map((f) => (
              <button key={f} type="button" className="tab" aria-pressed={filter === f} onClick={() => pick(f)}>
                {f}
                <span className="n">{counts[f]}</span>
              </button>
            ))}
          </div>
          <label className="visually-hidden" htmlFor="q">キーワードで検索</label>
          <input id="q" className="field search" type="search" placeholder="キーワード・Noで検索" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} />
        </div>
        {list.length ? (
          <ul className="tasks">
            {list.slice(0, limit).map((t) => (
              <TaskRow key={t.key} task={t} now={now} decision={decisionOf(t, triage, now)} pending={pending.has(t.key)} onPatch={patch} />
            ))}
          </ul>
        ) : (
          <p className="empty">{tasks.length ? "該当するタスクはありません。" : "スプシを読み込むとここに一覧が出ます。"}</p>
        )}
        {list.length > limit && (
          <button className="btn" type="button" style={{ marginTop: 10 }} onClick={() => setLimit((l) => l + PAGE * 2)}>
            もっと見る（残り{list.length - limit}件）
          </button>
        )}
      </section>
      {tasks.length > 0 && (
        <details className="panel trends">
          <summary>傾向を見る（週ごとの流入と消化・発生元）</summary>
          <div className="grid2">
            <div>
              <h3>週ごとの流入と消化</h3>
              <WeeklyBars rows={weeklyFlow(tasks, now).rows} />
              <div className="legend">
                <span><i className="dot" style={{ background: "var(--done)" }} />完了済み</span>
                <span><i className="dot" style={{ background: "var(--todo)" }} />残っている</span>
              </div>
            </div>
            <div>
              <h3>残タスクの発生元（未着手＋進行中）</h3>
              <GroupBars rows={openByGroup(tasks)} />
            </div>
          </div>
        </details>
      )}
      <ToastView toast={toast} />
    </>
  );
}
