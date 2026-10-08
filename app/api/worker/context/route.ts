import { loadSchedule } from "@/lib/calendar";
import { loadAppState, loadBoard } from "@/lib/data";
import { weekDoList } from "@/lib/focus";
import { eventsOn } from "@/lib/schedule";
import { decisionOf, isOpen } from "@/lib/tasks";
import { dayKey, fmtDate, fmtTime } from "@/lib/time";
import { denyUnlessWorker, json } from "@/lib/worker";

export const dynamic = "force-dynamic";

/** What リマ needs to answer a request: open tasks, focus, parking, today's events. */
export async function GET(req: Request) {
  const deny = denyUnlessWorker(req);
  if (deny) return deny;
  const now = Date.now();
  const [board, app, schedule] = await Promise.all([loadBoard(), loadAppState(now), loadSchedule(now)]);
  const weekDo = new Set(weekDoList(board.tasks, board.triage, now).map((t) => t.key));
  return json({
    now: new Date(now).toISOString(),
    today: dayKey(now),
    sheet: { source: board.source, error: board.error },
    tasks: board.tasks.filter(isOpen).map((t) => ({
      taskKey: t.key,
      no: t.no,
      status: t.status,
      title: t.title,
      prio: t.prio,
      due: t.due != null ? dayKey(t.due) : t.dueText || null,
      posted: t.posted != null ? new Date(t.posted).toISOString() : null,
      group: t.group,
      note: t.note,
      weekly: weekDo.has(t.key) ? "今週やる" : decisionOf(t, board.triage, now) === "later" ? "来週考える" : decisionOf(t, board.triage, now) === "skip" ? "やらない" : null,
    })),
    focus: app.focus ? { taskKey: app.focus.taskKey, startedAt: new Date(app.focus.startedAt).toISOString() } : null,
    parking: app.parking.map((p) => ({ id: p.id, text: p.text, createdAt: new Date(p.createdAt).toISOString() })),
    consults: app.consults.map((c) => ({ taskKey: c.taskKey, title: c.title })),
    calendar: schedule.configured
      ? eventsOn(schedule.events, now).map((e) => ({ title: e.title, start: e.allDay ? "終日" : `${fmtDate(e.start)} ${fmtTime(e.start)}`, end: e.allDay ? null : fmtTime(e.end), busy: e.busy }))
      : null,
    appError: app.error,
  });
}
