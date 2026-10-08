import { Suspense } from "react";
import { TaskListView } from "@/components/TaskListView";
import { getBoard } from "@/lib/data";

export const metadata = { title: "一覧 | 久保田タスクボード" };

export default async function TasksPage() {
  const b = await getBoard();
  return (
    <Suspense>
      <TaskListView initialTasks={b.tasks} triage={b.triage} now={b.now} />
    </Suspense>
  );
}
