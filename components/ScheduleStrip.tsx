"use client";

import { CalendarDays, Clock } from "lucide-react";
import { eventsOn, nextEvents, type CalEvent } from "@/lib/schedule";
import { daysFrom, fmtTime, jst, startOfDay } from "@/lib/time";
import { fmtSpan, useNow } from "./useBoard";

/** 次の予定まで あと◯分 + today's schedule as a thin timeline and a row of chips. */
export function ScheduleStrip({ events, initialNow }: { events: CalEvent[]; initialNow: number }) {
  const now = useNow(initialNow);
  const today = eventsOn(events, now);
  const timed = today.filter((e) => !e.allDay);
  const allDay = today.filter((e) => e.allDay);
  const { current, next } = nextEvents(events, now);

  const day0 = startOfDay(now);
  const firstH = timed.length ? Math.min(8, jst(Math.max(timed[0].start, day0)).h) : 8;
  const lastH = timed.length ? Math.max(20, Math.min(24, Math.ceil((Math.max(...timed.map((e) => e.end)) - day0) / 3600000))) : 20;
  const from = day0 + firstH * 3600000;
  const span = (lastH - firstH) * 3600000;
  const pct = (ms: number) => Math.min(100, Math.max(0, ((ms - from) / span) * 100));

  let headline: React.ReactNode;
  if (current) {
    headline = (
      <>
        <b>いま</b> {current.title}
        <span className="muted">（{fmtTime(current.end)}まで・あと{fmtSpan(current.end - now)}）</span>
      </>
    );
  } else if (next) {
    const d = daysFrom(next.start, now);
    headline = (
      <>
        次の予定まで <b className="mono">あと{fmtSpan(next.start - now)}</b>
        <span className="muted">
          {d === 0 ? "" : d === 1 ? "明日 " : `${jst(next.start).m}/${jst(next.start).d} `}
          {fmtTime(next.start)} {next.title}
        </span>
      </>
    );
  } else {
    headline = <>このあとの予定はありません</>;
  }

  return (
    <section className="sched" aria-label="今日の予定">
      <p className="sched-head">
        <Clock size={16} aria-hidden="true" />
        <span>{headline}</span>
      </p>
      {current && next && daysFrom(next.start, now) === 0 && (
        <p className="sched-sub muted">
          次は {fmtTime(next.start)} {next.title}（あと{fmtSpan(next.start - now)}）
        </p>
      )}
      {timed.length > 0 && (
        <div className="sched-bar" aria-hidden="true">
          {timed.map((e) => (
            <i key={e.id} className={e.end <= now ? "past" : e.start <= now ? "now" : ""} style={{ left: `${pct(e.start)}%`, width: `${Math.max(0.8, pct(e.end) - pct(e.start))}%` }} />
          ))}
          {now >= from && now <= from + span && <b style={{ left: `${pct(now)}%` }} />}
          <small style={{ left: 0 }}>{firstH}</small>
          <small style={{ right: 0 }}>{lastH}</small>
        </div>
      )}
      {(timed.length > 0 || allDay.length > 0) && (
        <ul className="sched-chips">
          {allDay.map((e) => (
            <li key={e.id}><CalendarDays size={12} aria-hidden="true" />終日 {e.title}</li>
          ))}
          {timed.map((e) => (
            <li key={e.id} className={e.end <= now ? "past" : e.start <= now ? "now" : ""}>
              <span className="mono">{fmtTime(e.start)}</span> {e.title}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
