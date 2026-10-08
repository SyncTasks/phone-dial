"use client";

import { Check, CircleCheck, HandHelping, ListTodo, Pause, Play, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { askConsult, clearConsultFlag, finishTask, postponeFocus, startTask } from "@/app/actions";
import { nextUp, pickFocus, todayNumbers, type DoneEntry, type Focus, type FocusPick } from "@/lib/focus";
import type { CalEvent } from "@/lib/schedule";
import type { Settings, Task, Triage } from "@/lib/tasks";
import { daysFrom, fmtDate, lastSlot } from "@/lib/time";
import { ParkingCapture } from "./ParkingCapture";
import { ScheduleStrip } from "./ScheduleStrip";
import { fmtSpan, ToastView, useNow, useToast } from "./useBoard";

const REASON: Record<FocusPick["reason"], string> = {
  started: "始めたタスク",
  week: "今週やるの一番上",
  priority: "優先度が高い順",
};

export function TodayView({
  tasks,
  triage,
  settings,
  now: serverNow,
  focus,
  consultKeys,
  doneLog,
  parkingCount,
  schedule,
  queueCount,
}: {
  tasks: Task[];
  triage: Record<string, Triage>;
  settings: Settings;
  now: number;
  focus: Focus | null;
  consultKeys: string[];
  doneLog: DoneEntry[];
  parkingCount: number;
  schedule: CalEvent[] | null;
  queueCount: number;
}) {
  const router = useRouter();
  const { toast, show } = useToast();
  const now = useNow(serverNow);
  const [refreshing, start] = useTransition();
  const [finishing, setFinishing] = useState(false);
  const busy = refreshing || finishing;
  const [celebrate, setCelebrate] = useState<{ title: string; weekDone: number } | null>(null);

  const pick = pickFocus(tasks, triage, focus, serverNow);
  const next = nextUp(tasks, triage, pick?.task.key ?? null, serverNow, 2);
  const nums = todayNumbers(tasks, triage, doneLog, serverNow);
  const consults = new Set(consultKeys);
  const reviewDue = !settings.lastReviewAt || settings.lastReviewAt < lastSlot(serverNow, settings.reviewDow, settings.reviewTime);

  useEffect(() => {
    if (!celebrate) return;
    const id = setTimeout(() => setCelebrate(null), 4000);
    return () => clearTimeout(id);
  }, [celebrate]);

  const act = (fn: () => Promise<{ ok: true; value: unknown } | { ok: false; error: string }>, okText?: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return show(res.error, true);
      if (okText) show(okText);
      router.refresh();
    });

  const begin = (t: Task) => act(() => startTask(t.key), "始めました。チームのページにも「進行中」で出ます");
  // Celebrate as soon as the sheet says 完了, without waiting for the page refresh.
  const finish = async (t: Task) => {
    setFinishing(true);
    const res = await finishTask(t.key);
    setFinishing(false);
    if (!res.ok) return show(res.error, true);
    setCelebrate({ title: t.title, weekDone: res.value.weekDone });
    start(() => router.refresh());
  };

  return (
    <>
      {schedule && <ScheduleStrip events={schedule} initialNow={serverNow} />}

      <p className="nums" aria-label="今の状況">
        <Link href="/tasks?status=進行中"><span>進行中</span> <b>{nums.doing}</b></Link>
        <Link href="/review"><span>今週やる</span> <b>{nums.weekDo}</b></Link>
        <span><span>今週完了</span> <b>{nums.weekDone}</b></span>
        <span><span>繰り越し</span> <b>{nums.carried}</b></span>
      </p>

      <div className="today-grid">
      <section className={`now-card${busy ? " is-busy" : ""}`} aria-labelledby="h-now">
        <div className="now-top">
          <h2 id="h-now">今やること</h2>
          {pick && (
            <span className="now-why">
              {pick.reason === "started" && pick.startedAt ? `始めて${fmtSpan(now - pick.startedAt)}` : REASON[pick.reason]}
            </span>
          )}
        </div>
        {!pick ? (
          <div className="now-empty">
            <p>今やることはありません。</p>
            <p className="note">週次整理で「今週やる」を決めるか、一覧から選んで始めましょう。</p>
          </div>
        ) : (
          <>
            <p className="now-title">{pick.task.title}</p>
            <TaskMeta t={pick.task} now={serverNow} />
            {consults.has(pick.task.key) && (
              <p className="now-flag">
                <HandHelping size={14} aria-hidden="true" />
                <span>相談の印あり（チームのページに表示中）</span>
                <button type="button" className="btn sm ghost" disabled={busy} onClick={() => act(() => clearConsultFlag(pick.task.key), "相談の印を外しました")}>
                  外す
                </button>
              </p>
            )}
            <div className="now-actions">
              {pick.reason === "started" ? (
                <button type="button" className="big primary" disabled={busy} onClick={() => finish(pick.task)}>
                  <Check size={20} aria-hidden="true" />終わった
                </button>
              ) : (
                <button type="button" className="big primary" disabled={busy} onClick={() => begin(pick.task)}>
                  <Play size={20} aria-hidden="true" />始める
                </button>
              )}
              <div className="now-sub">
                {pick.reason === "started" ? (
                  <button type="button" className="btn" disabled={busy} onClick={() => act(postponeFocus, "後にしました。また選び直せます")}>
                    <Pause size={16} aria-hidden="true" />後にする
                  </button>
                ) : (
                  <button type="button" className="btn" disabled={busy} onClick={() => finish(pick.task)}>
                    <Check size={16} aria-hidden="true" />終わった
                  </button>
                )}
                {!consults.has(pick.task.key) && (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => act(() => askConsult(pick.task.key), "相談の印を付けました。リマが文面を下書きします")}
                  >
                    <HandHelping size={16} aria-hidden="true" />相談したい
                  </button>
                )}
              </div>
            </div>
          </>
        )}
        <ParkingCapture count={parkingCount} notify={show} />
      </section>

      <div className="today-side">
      {next.length > 0 && (
        <section className="next" aria-labelledby="h-next">
          <h2 id="h-next">次の2つ</h2>
          <ul>
            {next.map((t) => (
              <li key={t.key}>
                <div className="next-body">
                  <p className="next-title">{t.title}</p>
                  <TaskMeta t={t} now={serverNow} />
                </div>
                <button type="button" className="btn sm" disabled={busy} onClick={() => begin(t)} aria-label={`「${t.title.slice(0, 30)}」を先に始める`}>
                  <Play size={14} aria-hidden="true" />先にやる
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="today-links">
        <Link className="btn ghost" href="/tasks"><ListTodo size={16} aria-hidden="true" />一覧ですべて見る</Link>
        {reviewDue && (
          <Link className="btn" href="/review">週次整理の時間です{queueCount ? `（未判断 ${queueCount}件）` : ""}</Link>
        )}
      </p>
      </div>
      </div>

      {celebrate && (
        <div className="celebrate" role="status" onClick={() => setCelebrate(null)}>
          <div className="celebrate-card">
            <CircleCheck size={44} aria-hidden="true" className="celebrate-icon" />
            <p className="celebrate-big">おつかれさま！</p>
            <p>今週 <b className="mono">{celebrate.weekDone}</b> 件目の完了です</p>
            <p className="note celebrate-title">{celebrate.title.split("\n")[0].slice(0, 60)}</p>
            <button type="button" className="btn sm ghost"><X size={14} aria-hidden="true" />閉じる</button>
          </div>
        </div>
      )}
      <ToastView toast={toast} />
    </>
  );
}

function TaskMeta({ t, now }: { t: Task; now: number }) {
  const days = t.due != null ? daysFrom(t.due, now) : null;
  return (
    <p className="t-meta">
      <span className="mono">No.{t.no}</span>
      <span>{t.status}</span>
      {(t.prio === "高" || t.prio === "中") && <span className={`chip ${t.prio === "高" ? "hi" : "mid"}`}>優先度 {t.prio}</span>}
      {t.due != null ? (
        <span>{days! < 0 ? `${-days!}日繰り越し` : days === 0 ? "期日 今日" : `期日 ${fmtDate(t.due)}`}</span>
      ) : t.dueText ? (
        <span>期日 {t.dueText}</span>
      ) : null}
    </p>
  );
}
