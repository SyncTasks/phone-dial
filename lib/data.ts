import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { isDemo } from "./auth";
import { demoTasks } from "./demo";
import { readTasks, SheetError, sheetConfigured } from "./sheets";
import type { DoneEntry, Focus } from "./focus";
import type { AiRequest } from "./ops";
import { getFocus, getSettings, listConsults, listDone, listParking, listRequests, listTriage, type Parking } from "./store";
import type { Consult } from "./team";
import type { Settings, Task, Triage } from "./tasks";

export const SHEET_TAG = "sheet";

type DemoState = { tasks: Task[] };
const g = globalThis as unknown as { __tbDemo?: DemoState };
export function demoState() {
  return (g.__tbDemo ??= { tasks: demoTasks(Date.now()) });
}

const cachedSheet = unstable_cache(
  async () => ({ tasks: await readTasks(), fetchedAt: Date.now() }),
  ["sheet-tasks"],
  { tags: [SHEET_TAG], revalidate: 60 },
);

export type Board = {
  tasks: Task[];
  triage: Record<string, Triage>;
  settings: Settings;
  now: number;
  fetchedAt: number | null;
  source: "sheet" | "demo" | "none";
  error: string | null;
};

export async function loadBoard(): Promise<Board> {
  const now = Date.now();
  const [triage, settings] = await Promise.all([listTriage(), getSettings()]);
  if (isDemo() || !sheetConfigured()) {
    if (!isDemo()) {
      return { tasks: [], triage, settings, now, fetchedAt: null, source: "none", error: "スプシの接続設定（SHEET_ID・サービスアカウント）がまだです。README の手順で環境変数を入れてください。" };
    }
    return { tasks: demoState().tasks, triage, settings, now, fetchedAt: now, source: "demo", error: null };
  }
  try {
    const { tasks, fetchedAt } = await cachedSheet();
    return { tasks, triage, settings, now, fetchedAt, source: "sheet", error: null };
  } catch (e) {
    const msg = e instanceof SheetError ? e.message : "スプシの読み込みに失敗しました。しばらくしてから再読み込みしてください。";
    console.error("[loadBoard]", e);
    return { tasks: [], triage, settings, now, fetchedAt: null, source: "sheet", error: msg };
  }
}

/** Per-request memo so the layout and the page share one load. */
export const getBoard = cache(loadBoard);

/* ---------- app-only state (Postgres / memory) ---------- */

export type AppState = {
  focus: Focus | null;
  parking: Parking[];
  consults: Consult[];
  /** Completions logged by the app in the last 8 days (covers this week and the team page's 7 days). */
  doneLog: DoneEntry[];
  requests: AiRequest[];
  error: string | null;
};

export async function loadAppState(now = Date.now()): Promise<AppState> {
  try {
    const [focus, parking, consults, doneLog, requests] = await Promise.all([
      getFocus(),
      listParking(),
      listConsults(),
      listDone(now - 8 * 86400000),
      listRequests(20),
    ]);
    return { focus, parking, consults, doneLog, requests, error: null };
  } catch (e) {
    console.error("[loadAppState]", e);
    return { focus: null, parking: [], consults: [], doneLog: [], requests: [], error: "アプリのデータベースを読めませんでした。" };
  }
}

export const getAppState = cache(() => loadAppState());
