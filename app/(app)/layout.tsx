import { Nav } from "@/components/Nav";
import { SyncButton } from "@/components/SyncButton";
import { getBoard } from "@/lib/data";
import { reviewQueue } from "@/lib/tasks";
import { fmtDate, fmtTime, jst, lastSlot, WEEKDAYS } from "@/lib/time";
import { logout } from "../actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const board = await getBoard();
  const { now, settings } = board;
  const p = jst(now);
  const due = !settings.lastReviewAt || settings.lastReviewAt < lastSlot(now, settings.reviewDow, settings.reviewTime);
  const queue = due ? reviewQueue(board.tasks, board.triage, now).length : 0;
  const sheetUrl = process.env.SHEET_ID ? `https://docs.google.com/spreadsheets/d/${process.env.SHEET_ID}/edit` : null;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <div>
              <div className="date">{`${p.y}.${String(p.m).padStart(2, "0")}.${String(p.d).padStart(2, "0")} (${WEEKDAYS[p.dow]})`}</div>
              <h1>久保田タスクボード</h1>
            </div>
            <div className="brand-actions">
              <span>{board.fetchedAt ? `読み込み ${fmtDate(board.fetchedAt)} ${fmtTime(board.fetchedAt)}` : "未読み込み"}</span>
              <SyncButton />
              {sheetUrl && (
                <a href={sheetUrl} target="_blank" rel="noopener noreferrer">スプシ ↗</a>
              )}
              {board.source !== "demo" && (
                <form action={logout}>
                  <button className="btn sm ghost" type="submit">ログアウト</button>
                </form>
              )}
            </div>
          </div>
          <Nav reviewBadge={queue} />
        </div>
      </header>
      <main className="wrap">
        {board.source === "demo" && (
          <p className="banner demo">デモモードです。表示しているのは架空のサンプルデータで、変更はサーバーを再起動すると消えます。</p>
        )}
        {board.error && <p className="banner err" role="alert">{board.error}</p>}
        {children}
      </main>
    </>
  );
}
