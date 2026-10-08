"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { decide, restoreDecision, saveReviewSettings } from "@/app/actions";
import { decisionOf, DECISION_LABEL, firstLine, isOpen, newestFirst, reviewQueue, type Decision, type Settings, type Task, type Triage } from "@/lib/tasks";
import { addDays, fmtDate, fmtTime, mondayOf, nextSlot, weekKey, WEEKDAYS } from "@/lib/time";
import type { Parking } from "@/lib/store";
import { ParkingSort } from "./ParkingSort";
import { STATUS_COLOR, TaskRow } from "./TaskRow";
import { ToastView, useTasks, useToast, useTriage } from "./useBoard";

type Undo = { key: string; previous: Triage | null };

export function ReviewView({
  initialTasks,
  initialTriage,
  initialSettings,
  initialParking,
  now,
}: {
  initialTasks: Task[];
  initialTriage: Record<string, Triage>;
  initialSettings: Settings;
  initialParking: Parking[];
  now: number;
}) {
  const { toast, show } = useToast();
  const { tasks, patch, pending } = useTasks(initialTasks, show);
  const [triage, setTriage] = useTriage(initialTriage);
  const [settings, setSettings] = useState(initialSettings);
  const [undo, setUndo] = useState<Undo[]>([]);
  const [, start] = useTransition();

  const queue = reviewQueue(tasks, triage, now);
  const current = queue[0];
  const pool = tasks.filter(isOpen);
  const c = { do: 0, later: 0, skip: 0 };
  for (const t of pool) {
    const d = decisionOf(t, triage, now);
    if (d) c[d]++;
  }
  const total = pool.length || 1;

  const markReviewed = useCallback(async () => {
    const res = await saveReviewSettings({ markReviewed: true });
    if (res.ok) setSettings(res.value);
    else show(res.error, true);
  }, [show]);

  const choose = useCallback(
    (t: Task, decision: Decision) => {
      const previous = triage[t.key] ?? null;
      const optimistic: Triage = { taskKey: t.key, decision, week: weekKey(now), decidedAt: Date.now(), title: firstLine(t.title, 80) };
      setTriage((m) => ({ ...m, [t.key]: optimistic }));
      setUndo((u) => [...u, { key: t.key, previous }]);
      start(async () => {
        const res = await decide({ taskKey: t.key, decision, title: optimistic.title });
        if (!res.ok) {
          setTriage((m) => restore(m, t.key, previous));
          setUndo((u) => u.slice(0, -1));
          show(res.error, true);
          return;
        }
        setTriage((m) => ({ ...m, [t.key]: res.value }));
        if (queue.length === 1) await markReviewed();
      });
    },
    [triage, now, queue.length, markReviewed, show, setTriage],
  );

  const revert = useCallback(
    (key: string, previous: Triage | null) => {
      const before = triage[key] ?? null;
      setTriage((m) => restore(m, key, previous));
      start(async () => {
        const res = await restoreDecision({ taskKey: key, previous });
        if (!res.ok) {
          setTriage((m) => restore(m, key, before));
          show(res.error, true);
        }
      });
    },
    [triage, setTriage, show],
  );

  const undoLast = () => {
    const last = undo[undo.length - 1];
    if (!last) return;
    setUndo((u) => u.slice(0, -1));
    revert(last.key, last.previous);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!current || /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName ?? "")) return;
      const d = ({ "1": "do", "2": "later", "3": "skip" } as const)[e.key as "1" | "2" | "3"];
      if (d) {
        e.preventDefault();
        choose(current, d);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, choose]);

  const saveSlot = (patchSlot: Partial<Pick<Settings, "reviewDow" | "reviewTime">>) => {
    const prev = settings;
    setSettings({ ...settings, ...patchSlot });
    start(async () => {
      const res = await saveReviewSettings(patchSlot);
      if (res.ok) {
        setSettings(res.value);
        show("整理の時間を保存しました");
      } else {
        setSettings(prev);
        show(res.error, true);
      }
    });
  };

  const nx = nextSlot(now, settings.reviewDow, settings.reviewTime);
  const mon = mondayOf(now);
  const doList = tasks.filter((t) => decisionOf(t, triage, now) === "do").sort((a, b) => Number(a.status === "完了") - Number(b.status === "完了"));
  const skipList = tasks.filter((t) => decisionOf(t, triage, now) === "skip" && t.status !== "完了").sort(newestFirst);

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>週次整理</h2>
          <span className="sub mono">{fmtDate(mon)}〜{fmtDate(addDays(mon, 6))}</span>
        </div>
        <div className="slot">
          <span>整理する時間</span>
          <label className="visually-hidden" htmlFor="slot-dow">曜日</label>
          <select id="slot-dow" className="field" value={settings.reviewDow} onChange={(e) => saveSlot({ reviewDow: Number(e.target.value) })}>
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>{d}曜</option>
            ))}
          </select>
          <label className="visually-hidden" htmlFor="slot-time">時刻</label>
          <input id="slot-time" className="field" type="time" defaultValue={settings.reviewTime} onBlur={(e) => e.target.value && e.target.value !== settings.reviewTime && saveSlot({ reviewTime: e.target.value })} />
          <span className="note">
            次回 {fmtDate(nx)} {fmtTime(nx)}
            {settings.lastReviewAt ? `・前回 ${fmtDate(settings.lastReviewAt)}` : ""}
          </span>
        </div>
        <div style={{ marginTop: 14 }}>
          <div className="progress" aria-hidden="true">
            <i style={{ width: `${(c.do / total) * 100}%`, background: "var(--accent)" }} />
            <i style={{ width: `${(c.later / total) * 100}%`, background: "var(--hold)" }} />
            <i style={{ width: `${(c.skip / total) * 100}%`, background: "var(--memo)" }} />
          </div>
          <div className="tri-stats">
            {([["今週やる", c.do, "var(--accent)"], ["来週考える", c.later, "var(--hold)"], ["やらない", c.skip, "var(--memo)"], ["未判断", queue.length, "var(--line)"]] as const).map(([l, n, col]) => (
              <span key={l}><i className="dot" style={{ background: col }} />{l} <b>{n}</b></span>
            ))}
          </div>
        </div>
      </section>

      <ParkingSort initial={initialParking} notify={show} />

      {!tasks.length ? (
        <div className="panel empty">スプシを読み込むと整理を始められます。</div>
      ) : !current ? (
        <div className="card">
          <h3>今週の整理は完了です</h3>
          <p className="note">新しいタスクが入ると、また未判断として並びます。</p>
          <div className="row-actions">
            <button className="btn" type="button" disabled={!undo.length} onClick={undoLast}>ひとつ戻す</button>
          </div>
        </div>
      ) : (
        <div className="card" aria-live="polite">
          <div className="t-meta">
            <span className="chip" style={{ color: STATUS_COLOR[current.status] }}>{current.status}</span>
            {(current.prio === "高" || current.prio === "中") && <span className={`chip ${current.prio === "高" ? "hi" : "mid"}`}>優先度 {current.prio}</span>}
            {current.group && <span>{current.group}</span>}
            {current.posted != null && <span className="mono">{fmtDate(current.posted, true)}</span>}
            {triage[current.key] && <span>前回: {DECISION_LABEL[triage[current.key].decision]}</span>}
            <span className="mono">残り {queue.length}件</span>
          </div>
          <div className="ct">{current.title}</div>
          {current.note && <p className="note">備考: {current.note}</p>}
          <div className="decide">
            {([["do", "1"], ["later", "2"], ["skip", "3"]] as const).map(([k, key]) => (
              <button key={k} type="button" className={k} onClick={() => choose(current, k)}>
                {DECISION_LABEL[k]}
                <small>{key}</small>
              </button>
            ))}
          </div>
          <div className="row-actions">
            <button className="btn sm" type="button" disabled={!undo.length} onClick={undoLast}>ひとつ戻す</button>
            <button className="btn sm" type="button" disabled={pending.has(current.key)} onClick={() => patch(current, { status: "完了" })}>もう終わってる（完了にする）</button>
            <button className="btn sm" type="button" onClick={() => start(markReviewed)}>今週はここまで</button>
            <span className="note kbd-hint">キーボードの 1 / 2 / 3 でも選べます</span>
          </div>
        </div>
      )}

      <div className="grid2">
        <section className="panel">
          <div className="panel-head">
            <h2>今週やる</h2>
            <span className="sub">「今日」の一番上に出ます</span>
          </div>
          {doList.length ? (
            <ul className="tasks">
              {doList.map((t) => (
                <TaskRow key={t.key} task={t} now={now} pending={pending.has(t.key)} onPatch={patch}
                  extra={<button className="btn sm" type="button" onClick={() => revert(t.key, null)}>今週やるから外す</button>} />
              ))}
            </ul>
          ) : (
            <p className="empty">まだありません。</p>
          )}
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>やらないと決めたもの</h2>
            <span className="sub">戻すと次の整理でまた聞きます</span>
          </div>
          {skipList.length ? (
            <ul className="tasks">
              {skipList.slice(0, 40).map((t) => (
                <TaskRow key={t.key} task={t} now={now} pending={pending.has(t.key)} onPatch={patch}
                  extra={<button className="btn sm" type="button" onClick={() => revert(t.key, null)}>未判断に戻す</button>} />
              ))}
            </ul>
          ) : (
            <p className="empty">まだありません。</p>
          )}
        </section>
      </div>
      <ToastView toast={toast} />
    </>
  );
}

function restore(m: Record<string, Triage>, key: string, previous: Triage | null) {
  const next = { ...m };
  if (previous) next[key] = previous;
  else delete next[key];
  return next;
}
