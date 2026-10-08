import { TodayView } from "@/components/TodayView";
import { loadSchedule } from "@/lib/calendar";
import { getAppState, getBoard } from "@/lib/data";
import { reviewQueue } from "@/lib/tasks";
import { addDays, startOfDay } from "@/lib/time";

export default async function TodayPage() {
  const [b, app] = await Promise.all([getBoard(), getAppState()]);
  const schedule = await loadSchedule(b.now);
  // Today and tomorrow are enough for the strip and "次の予定".
  const until = addDays(startOfDay(b.now), 2);
  const events = schedule.configured ? schedule.events.filter((e) => e.end > startOfDay(b.now) && e.start < until) : null;
  return (
    <TodayView
      tasks={b.tasks}
      triage={b.triage}
      settings={b.settings}
      now={b.now}
      focus={app.focus}
      consultKeys={app.consults.map((c) => c.taskKey)}
      doneLog={app.doneLog}
      parkingCount={app.parking.length}
      schedule={events}
      queueCount={reviewQueue(b.tasks, b.triage, b.now).length}
    />
  );
}
