import { TodayView } from "@/components/TodayView";
import { getBoard } from "@/lib/data";
import { reviewQueue } from "@/lib/tasks";

export default async function TodayPage() {
  const b = await getBoard();
  return (
    <TodayView
      initialTasks={b.tasks}
      triage={b.triage}
      settings={b.settings}
      now={b.now}
      queueCount={reviewQueue(b.tasks, b.triage, b.now).length}
    />
  );
}
