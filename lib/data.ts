import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { isDemo } from "./auth";
import { demoTasks } from "./demo";
import { readTasks, SheetError, sheetConfigured } from "./sheets";
import { getSettings, listTriage } from "./store";
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
