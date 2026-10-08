import { ReviewView } from "@/components/ReviewView";
import { getAppState, getBoard } from "@/lib/data";

export const metadata = { title: "週次整理 | 久保田タスクボード" };

export default async function ReviewPage() {
  const [b, app] = await Promise.all([getBoard(), getAppState()]);
  return <ReviewView initialTasks={b.tasks} initialTriage={b.triage} initialSettings={b.settings} initialParking={app.parking} now={b.now} />;
}
