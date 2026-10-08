import { ExternalLink, LogOut } from "lucide-react";
import { Nav } from "@/components/Nav";
import { RimaDock } from "@/components/RimaDock";
import { SyncButton } from "@/components/SyncButton";
import { getAppState, getBoard } from "@/lib/data";
import { reviewQueue } from "@/lib/tasks";
import { fmtTime, jst, lastSlot, WEEKDAYS } from "@/lib/time";
import { logout } from "../actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [board, app] = await Promise.all([getBoard(), getAppState()]);
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
            <h1>
              <span className="date mono">{`${p.m}/${p.d}(${WEEKDAYS[p.dow]})`}</span>
              タスクボード
            </h1>
            <div className="brand-actions">
              <span className="loaded">{board.fetchedAt ? `${fmtTime(board.fetchedAt)} 読み込み` : "未読み込み"}</span>
              <SyncButton />
              {sheetUrl && (
                <a className="icon-btn" href={sheetUrl} target="_blank" rel="noopener noreferrer" aria-label="スプシを開く" title="スプシを開く">
                  <ExternalLink size={17} aria-hidden="true" />
                </a>
              )}
              {board.source !== "demo" && (
                <form action={logout}>
                  <button className="icon-btn" type="submit" aria-label="ログアウト" title="ログアウト">
                    <LogOut size={17} aria-hidden="true" />
                  </button>
                </form>
              )}
            </div>
          </div>
          <Nav reviewBadge={queue} />
        </div>
      </header>
      <main className="wrap app-main">
        {board.source === "demo" && (
          <p className="banner demo">デモ表示（架空のデータ・再起動で消えます）</p>
        )}
        {board.error && <p className="banner err" role="alert">{board.error}</p>}
        {app.error && <p className="banner err" role="alert">{app.error}</p>}
        {children}
      </main>
      <RimaDock initial={app.requests} initialNow={now} />
    </>
  );
}
