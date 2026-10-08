import { NotesView } from "@/components/NotesView";
import { getBoard } from "@/lib/data";
import { listNotes } from "@/lib/store";

export const metadata = { title: "手書き | 久保田タスクボード" };

export default async function NotesPage() {
  const [b, notes] = await Promise.all([getBoard(), listNotes()]);
  return <NotesView initialNotes={notes} now={b.now} />;
}
