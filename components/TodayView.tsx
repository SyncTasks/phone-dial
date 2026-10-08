"use client";

import Link from "next/link";
import { decisionOf, newestFirst, openByGroup, summarize, weeklyFlow, type Settings, type Task, type Triage } from "@/lib/tasks";
import { fmtDate, fmtTime, lastSlot, nextSlot } from "@/lib/time";
import { AddTask } from "./AddTask";
import { CompletionRing, GroupBars, WeeklyBars } from "./Charts";
import { TaskRow } from "./TaskRow";
import { ToastView, useTasks, useToast } from "./useBoard";

const PER_GROUP = 8;

export function TodayView({
  initialTasks,
  triage,
  settings,
  now,
  queueCount,
}: {
  initialTasks: Task[];
  triage: Record<string, Triage>;
  settings: Settings;
  now: number;
  queueCount: number;
}) {
  const { toast, show } = useToast();
  const { tasks, patch, pending } = useTasks(initialTasks, show);
  const loaded = tasks.length > 0;
  const s = summarize(tasks, triage, now);
  const dec = (t: Task) => decisionOf(t, triage, now);

  const doing = tasks.filter((t) => t.status === "進行中" && dec(t) !== "do" && dec(t) !== "skip").sort(newestFirst);
  const groups: [string, Task[], string][] = [
    ["今週やる", [...s.weekDo].sort((a, b) => (triage[a.key]?.decidedAt ?? 0) - (triage[b.key]?.decidedAt ?? 0)), "var(--accent)"],
    ["期限切れ", [...s.late].sort((a, b) => a.due! - b.due!), "var(--late)"],
    ["3日以内に期日", [...s.dueSoon].sort((a, b) => a.due! - b.due!), "var(--doing)"],
    ["進行中", doing, "var(--doing)"],
    ["今日・昨日の新着", [...s.fresh].sort(newestFirst), "var(--todo)"],
  ];
  const shown = new Set<string>();
  const visible = groups
    .map(([name, list, c]) => {
      const uniq = list.filter((t) => !shown.has(t.key));
      uniq.forEach((t) => shown.add(t.key));
      return [name, uniq, c] as [string, Task[], string];
    })
    .filter(([, l]) => l.length);

  const due = !settings.lastReviewAt || settings.lastReviewAt < lastSlot(now, settings.reviewDow, settings.reviewTime);
  const nx = nextSlot(now, settings.reviewDow, settings.reviewTime);
  const counts: [string, number, string, string][] = [
    ["今週やる", s.weekDo.length, "var(--accent)", "/review"],
    ["進行中", s.by["進行中"], "var(--doing)", "/tasks?status=進行中"],
    ["未着手", s.by["未着手"], "var(--todo)", "/tasks?status=未着手"],
    ["保留", s.by["保留"], "var(--hold)", "/tasks?status=保留"],
    ["今日・昨日の新着", s.fresh.length, "var(--accent)", "#focus"],
    ["期限切れ", s.late.length, "var(--late)", "#focus"],
  ];

  return (
    <>
      <div className={`callout${due ? " due" : ""}`}>
        <div>
          <b>{due ? "週次整理の時間です" : "週次整理"}</b>
          <div className="note">
            {due ? `未判断 ${queueCount}件。` : `次は ${fmtDate(nx)} ${fmtTime(nx)}。`}
            {settings.lastReviewAt ? ` 前回 ${fmtDate(settings.lastReviewAt)}` : " まだ一度も整理していません"}
          </div>
        </div>
        <Link className="btn primary" href="/review">整理を始める</Link>
      </div>

      <section className="panel" aria-label="サマリー">
        <div className="kpis">
          <CompletionRing rate={s.rate} empty={!loaded} />
          <div className="counts">
            {counts.map(([label, n, c, href]) => (
              <Link className="count" key={label} href={href}>
                <span className="lab"><i className="dot" style={{ background: c }} />{label}</span>
                <span className="val">{loaded ? n : "–"}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="panel" aria-label="タスクを追加">
        <AddTask notify={show} />
      </section>

      <div className="grid2">
        <section className="panel" id="focus" aria-labelledby="h-today">
          <div className="panel-head">
            <h2 id="h-today">今日見るもの</h2>
            <span className="sub">今週やる・期限・進行中・新着</span>
          </div>
          {!visible.length ? (
            <p className="empty">急ぎのタスクはありません。週次整理で「今週やる」を決めるとここに出ます。</p>
          ) : (
            visible.map(([name, list, c]) => (
              <div className="focus-group" key={name}>
                <div className="fg-title">
                  <i className="dot" style={{ background: c }} />
                  <span>{name}</span>
                  <span className="n">{list.length}件</span>
                </div>
                <ul className="tasks">
                  {list.slice(0, PER_GROUP).map((t) => (
                    <TaskRow key={t.key} task={t} now={now} decision={dec(t)} pending={pending.has(t.key)} onPatch={patch} />
                  ))}
                </ul>
                {list.length > PER_GROUP && <p className="empty">ほか{list.length - PER_GROUP}件は<Link href="/tasks">一覧</Link>から</p>}
              </div>
            ))
          )}
        </section>
        <div className="col">
          <section className="panel" aria-labelledby="h-week">
            <div className="panel-head">
              <h2 id="h-week">週ごとの流入と消化</h2>
              <span className="sub">投稿日ベース・直近10週</span>
            </div>
            {loaded ? <WeeklyBars rows={weeklyFlow(tasks, now).rows} /> : <div className="skeleton" />}
            <div className="legend">
              <span><i className="dot" style={{ background: "var(--done)" }} />完了済み</span>
              <span><i className="dot" style={{ background: "var(--todo)" }} />残っている</span>
            </div>
          </section>
          <section className="panel" aria-labelledby="h-group">
            <div className="panel-head">
              <h2 id="h-group">残タスクの発生元</h2>
              <span className="sub">未着手＋進行中</span>
            </div>
            <GroupBars rows={openByGroup(tasks)} />
          </section>
        </div>
      </div>
      <ToastView toast={toast} />
    </>
  );
}
