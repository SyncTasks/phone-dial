import { ReviewView } from "@/components/ReviewView";
import { getBoard } from "@/lib/data";

export const metadata = { title: "週次整理 | 久保田タスクボード" };

export default async function ReviewPage() {
  const b = await getBoard();
  return <ReviewView initialTasks={b.tasks} initialTriage={b.triage} initialSettings={b.settings} now={b.now} />;
}
