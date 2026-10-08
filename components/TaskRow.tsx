"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { DECISION_LABEL, PRIORITIES, STATUSES, type Decision, type Status, type Task } from "@/lib/tasks";
import { dayKey, daysFrom, fmtDate } from "@/lib/time";
import type { TaskPatchInput } from "./useBoard";

export const STATUS_COLOR: Record<Status, string> = {
  進行中: "var(--doing)",
  未着手: "var(--todo)",
  保留: "var(--hold)",
  メモ: "var(--memo)",
  完了: "var(--done)",
};

const isActive = (t: Task) => t.status === "未着手" || t.status === "進行中";

export function TaskRow({
  task: t,
  now,
  decision,
  pending,
  onPatch,
  extra,
}: {
  task: Task;
  now: number;
  decision?: Decision | null;
  pending?: boolean;
  onPatch?: (t: Task, p: TaskPatchInput) => void;
  extra?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const days = t.due != null ? daysFrom(t.due, now) : null;
  const bodyId = `task-${t.key}`;

  return (
    <li className={`task${open ? " open" : ""}${pending ? " pending" : ""}`} style={{ ["--c" as string]: STATUS_COLOR[t.status] }}>
      <button type="button" className="task-head" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)}>
        <div className="t-title">{t.title || "(無題)"}</div>
        <div className="t-meta">
          <span className="chip" style={{ color: STATUS_COLOR[t.status] }}>{t.status}</span>
          {decision === "do" && <span className="chip go">{DECISION_LABEL.do}</span>}
          {t.prio === "高" && <span className="chip hi">優先度 高</span>}
          {t.prio === "中" && <span className="chip mid">優先度 中</span>}
          {t.due != null ? (
            <span>
              期日 {fmtDate(t.due)}
              {days! < 0 && isActive(t) ? `・${-days!}日繰り越し` : days === 0 ? "・今日" : ""}
            </span>
          ) : t.dueText ? (
            <span>期日 {t.dueText}</span>
          ) : null}
          {t.group && <span>{t.group}</span>}
          {t.posted != null && <span className="mono">{fmtDate(t.posted, true)}</span>}
        </div>
      </button>
      {open && (
        <div className="t-body" id={bodyId}>
          {onPatch && (
            <>
              <div className="status-pick" role="group" aria-label="状態を変える">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={t.status === s}
                    style={{ ["--c" as string]: STATUS_COLOR[s] }}
                    disabled={pending}
                    onClick={() => t.status !== s && onPatch(t, { status: s })}
                  >
                    <i className="dot" style={{ background: STATUS_COLOR[s] }} />
                    {s}
                  </button>
                ))}
              </div>
              <div className="t-fields">
                <label>
                  優先度
                  <select
                    className="field"
                    value={(PRIORITIES as readonly string[]).includes(t.prio) ? t.prio : "-"}
                    disabled={pending}
                    onChange={(e) => onPatch(t, { prio: e.target.value })}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label>
                  期日
                  <input
                    className="field"
                    type="date"
                    defaultValue={t.due != null ? dayKey(t.due) : ""}
                    disabled={pending}
                    onBlur={(e) => {
                      const v = e.target.value;
                      const cur = t.due != null ? dayKey(t.due) : "";
                      if (v !== cur) onPatch(t, { due: v || null });
                    }}
                  />
                </label>
              </div>
            </>
          )}
          <div className="t-extra">
            {t.note && <div>備考: {t.note}</div>}
            {/^https?:\/\//.test(t.url) ? (
              <a className="ext" href={t.url} target="_blank" rel="noopener noreferrer">参照URL<ExternalLink size={13} aria-hidden="true" /></a>
            ) : t.url ? (
              <div>参照: {t.url}</div>
            ) : null}
            <div className="mono">No.{t.no}・{t.row}行目</div>
          </div>
          {extra}
        </div>
      )}
    </li>
  );
}
