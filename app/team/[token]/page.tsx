import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDays, CircleCheck, HandHelping, Play, Target } from "lucide-react";
import { teamTokenOk } from "@/lib/auth";
import { loadSchedule } from "@/lib/calendar";
import { loadAppState, loadBoard } from "@/lib/data";
import { teamView, type TeamItem, type TeamView } from "@/lib/team";
import { fmtDate, fmtTime, jst, WEEKDAYS } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "久保田の作業状況",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

/** Hours shown in the busy chart: 8–20, widened to fit the week's blocks. */
function hourRange(week: TeamView["week"]) {
  let from = 8;
  let to = 20;
  for (const d of week)
    for (const b of d.blocks) {
      from = Math.min(from, jst(b.start).h);
      const e = jst(b.end - 1);
      to = Math.max(to, e.h + 1);
    }
  return [from, Math.min(24, to)] as const;
}

export default async function TeamPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!teamTokenOk(decodeURIComponent(token))) notFound();

  const now = Date.now();
  const [board, app, schedule] = await Promise.all([loadBoard(), loadAppState(now), loadSchedule(now)]);
  const v = teamView(board.tasks, board.triage, app.doneLog, app.consults, schedule.events, now);
  const today = jst(now);
  const [DAY_FROM, DAY_TO] = hourRange(v.week);
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round(DAY_FROM + ((DAY_TO - DAY_FROM) * i) / 4));

  return (
    <main className="team wrap">
      <header className="team-head">
        <h1>久保田の作業状況</h1>
        <p className="note">
          {fmtDate(now)} {fmtTime(now)} 時点・閲覧専用。久保田が「始める」「終わった」を押すと自動で変わります。
        </p>
      </header>
      {board.error && <p className="banner">タスクを読み込めませんでした。少し時間をおいて開き直してください。</p>}

      {v.consult.length > 0 && (
        <section className="panel team-consult" aria-labelledby="h-consult">
          <h2 id="h-consult"><HandHelping size={18} aria-hidden="true" />相談したいこと</h2>
          <p className="note">声をかけてもらえると助かります。</p>
          <Items items={v.consult} />
        </section>
      )}

      <div className="team-grid">
        <section className="panel" aria-labelledby="h-doing">
          <h2 id="h-doing"><Play size={16} aria-hidden="true" />進行中<span className="n">{v.doing.length}</span></h2>
          <Items items={v.doing} empty="いまは無し" />
        </section>
        <section className="panel" aria-labelledby="h-week">
          <h2 id="h-week"><Target size={16} aria-hidden="true" />今週やる<span className="n">{v.weekDo.length}</span></h2>
          <Items items={v.weekDo} empty="まだ決めていません" />
        </section>
        <section className="panel" aria-labelledby="h-done">
          <h2 id="h-done"><CircleCheck size={16} aria-hidden="true" />最近7日の完了<span className="n">{v.doneRecent.length}</span></h2>
          <Items items={v.doneRecent} empty="まだ無し" />
        </section>
      </div>

      {schedule.configured && (
        <section className="panel" aria-labelledby="h-busy">
          <h2 id="h-busy"><CalendarDays size={16} aria-hidden="true" />今週の予定の埋まり具合</h2>
          <p className="note">色の付いた時間は予定あり（中身は表示していません）。{DAY_FROM}時〜{DAY_TO}時。</p>
          <div className="busy-week" role="list">
            {v.week.map((d) => {
              const p = jst(d.date);
              const isToday = p.y === today.y && p.m === today.m && p.d === today.d;
              const span = (DAY_TO - DAY_FROM) * 3600000;
              const base = d.date + DAY_FROM * 3600000;
              return (
                <div className={`busy-day${isToday ? " today" : ""}`} role="listitem" key={d.day} aria-label={`${p.m}/${p.d}(${WEEKDAYS[p.dow]}) ${d.allDay ? "終日予定あり" : `予定 ${d.blocks.length}件`}`}>
                  <span className="busy-label mono">{p.m}/{p.d}<small>{WEEKDAYS[p.dow]}</small></span>
                  <span className="busy-track">
                    {d.allDay && <i className="busy-all" />}
                    {d.blocks.map((b) => {
                      const l = Math.max(0, (b.start - base) / span);
                      const r = Math.min(1, (b.end - base) / span);
                      if (r <= 0 || l >= 1) return null;
                      return <i key={b.start} style={{ left: `${l * 100}%`, width: `${(r - l) * 100}%` }} title={`${fmtTime(b.start)}〜${fmtTime(b.end)}`} />;
                    })}
                    {isToday && now > base && now < base + span && <b className="busy-now" style={{ left: `${((now - base) / span) * 100}%` }} />}
                  </span>
                </div>
              );
            })}
            <div className="busy-day axis" aria-hidden="true">
              <span />
              <span className="busy-ticks mono">
                {ticks.map((h) => (
                  <small key={h} style={{ left: `${((h - DAY_FROM) / (DAY_TO - DAY_FROM)) * 100}%` }}>{h}</small>
                ))}
              </span>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function Items({ items, empty }: { items: TeamItem[]; empty?: string }) {
  if (!items.length) return <p className="empty">{empty}</p>;
  return (
    <ul className="team-list">
      {items.map((t, i) => (
        <li key={`${t.no}-${i}`}>
          <span>{t.title}</span>
          {t.no && <span className="mono note">No.{t.no}</span>}
        </li>
      ))}
    </ul>
  );
}
