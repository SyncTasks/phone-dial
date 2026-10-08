"use server";

import { del, put } from "@vercel/blob";
import { revalidatePath, revalidateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authConfigured, createSession, isDemo, safeEqual, SESSION_COOKIE, SESSION_DAYS, verifySession } from "@/lib/auth";
import { demoState, SHEET_TAG } from "@/lib/data";
import { appendTask, SheetError, updateTaskRow, type TaskPatch } from "@/lib/sheets";
import * as store from "@/lib/store";
import { normalizeStatus, PRIORITIES, STATUSES, taskKey, type Decision, type Settings, type Triage } from "@/lib/tasks";
import { fmtSheetDate, fmtSheetStamp, parseDayKey, parseSheetDate, weekKey } from "@/lib/time";

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

async function requireAuth() {
  if (isDemo()) return;
  const jar = await cookies();
  if (!(await verifySession(jar.get(SESSION_COOKIE)?.value))) throw new Error("unauthorized");
}

function explain(e: unknown, fallback: string) {
  if (e instanceof SheetError) return e.message;
  console.error(e);
  return fallback;
}

/* ---------- session ---------- */

export async function login(_: string | null, form: FormData): Promise<string | null> {
  if (!authConfigured()) return "APP_PASSWORD と AUTH_SECRET（32文字以上）を環境変数に設定してください。";
  const password = String(form.get("password") ?? "");
  if (!safeEqual(password, process.env.APP_PASSWORD!)) return "パスワードが違います。";
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  const next = String(form.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

/* ---------- sheet ---------- */

export async function refreshSheet() {
  await requireAuth();
  revalidateTag(SHEET_TAG);
  revalidatePath("/", "layout");
}

export async function updateTask(input: { row: number; no: string; status?: string; prio?: string; due?: string | null }): Promise<Result> {
  await requireAuth();
  const patch: TaskPatch = {};
  if (input.status !== undefined) {
    if (!(STATUSES as readonly string[]).includes(input.status)) return fail("状態の値が不正です。");
    patch.status = input.status;
  }
  if (input.prio !== undefined) {
    if (!(PRIORITIES as readonly string[]).includes(input.prio)) return fail("優先度の値が不正です。");
    patch.prio = input.prio;
  }
  if (input.due !== undefined) {
    const ms = input.due ? parseDayKey(input.due) : null;
    if (input.due && ms == null) return fail("期日の形式が不正です。");
    patch.due = ms == null ? "" : fmtSheetDate(ms);
  }
  try {
    if (isDemo()) {
      const t = demoState().tasks.find((x) => x.row === input.row && x.no === input.no);
      if (!t) return fail("タスクが見つかりません。");
      if (patch.status) t.status = normalizeStatus(patch.status);
      if (patch.prio) t.prio = patch.prio;
      if (patch.due !== undefined) {
        t.due = parseSheetDate(patch.due);
        t.dueText = "";
      }
    } else {
      await updateTaskRow(input.row, input.no, patch);
      revalidateTag(SHEET_TAG);
    }
    return ok(undefined);
  } catch (e) {
    return fail(explain(e, "スプシへの書き込みに失敗しました。"));
  }
}

export async function addTask(input: { title: string; prio?: string; due?: string }): Promise<Result<string>> {
  await requireAuth();
  const title = input.title.trim().slice(0, 2000);
  if (!title) return fail("タスク名を入れてください。");
  const prio = input.prio && (PRIORITIES as readonly string[]).includes(input.prio) ? input.prio : "-";
  const dueMs = input.due ? parseDayKey(input.due) : null;
  const now = Date.now();
  try {
    if (isDemo()) {
      const s = demoState();
      const no = String(Math.max(0, ...s.tasks.map((t) => Number(t.no) || 0)) + 1);
      s.tasks.unshift({ key: taskKey(no), no, row: s.tasks.length + 2, status: "未着手", title, prio, due: dueMs, dueText: "", posted: now, group: process.env.TASK_SOURCE_NAME || "タスクボード", note: "", url: "" });
      return ok(no);
    }
    const no = await appendTask({
      title,
      prio,
      due: dueMs == null ? "" : fmtSheetDate(dueMs),
      posted: fmtSheetStamp(now),
      owner: process.env.TASK_OWNER_NAME || "Kei Kubota",
      group: process.env.TASK_SOURCE_NAME || "タスクボード",
    });
    revalidateTag(SHEET_TAG);
    return ok(no);
  } catch (e) {
    return fail(explain(e, "スプシへの追加に失敗しました。"));
  }
}

/* ---------- weekly review ---------- */

export async function decide(input: { taskKey: string; decision: Decision; title: string }): Promise<Result<Triage>> {
  await requireAuth();
  if (!["do", "later", "skip"].includes(input.decision)) return fail("判断の値が不正です。");
  const t: Triage = { taskKey: input.taskKey, decision: input.decision, week: weekKey(Date.now()), decidedAt: Date.now(), title: input.title.slice(0, 200) };
  try {
    await store.setTriage(t);
    return ok(t);
  } catch (e) {
    return fail(explain(e, "判断を保存できませんでした。"));
  }
}

/** Remove a decision, or put back the one it replaced. */
export async function restoreDecision(input: { taskKey: string; previous: Triage | null }): Promise<Result> {
  await requireAuth();
  try {
    if (input.previous) await store.setTriage({ ...input.previous, taskKey: input.taskKey });
    else await store.deleteTriage(input.taskKey);
    return ok(undefined);
  } catch (e) {
    return fail(explain(e, "元に戻せませんでした。"));
  }
}

export async function saveReviewSettings(patch: Partial<Pick<Settings, "reviewDow" | "reviewTime">> & { markReviewed?: boolean }): Promise<Result<Settings>> {
  await requireAuth();
  const next: Partial<Settings> = {};
  if (patch.reviewDow !== undefined) {
    if (!Number.isInteger(patch.reviewDow) || patch.reviewDow < 0 || patch.reviewDow > 6) return fail("曜日が不正です。");
    next.reviewDow = patch.reviewDow;
  }
  if (patch.reviewTime !== undefined) {
    if (!/^\d{2}:\d{2}$/.test(patch.reviewTime)) return fail("時刻が不正です。");
    next.reviewTime = patch.reviewTime;
  }
  if (patch.markReviewed) next.lastReviewAt = Date.now();
  try {
    return ok(await store.saveSettings(next));
  } catch (e) {
    return fail(explain(e, "設定を保存できませんでした。"));
  }
}

/* ---------- handwritten notes ---------- */

export async function saveNote(form: FormData): Promise<Result<store.Note>> {
  await requireAuth();
  const file = form.get("image");
  if (!(file instanceof Blob) || file.size === 0) return fail("画像がありません。");
  if (file.type !== "image/png") return fail("PNG以外は保存できません。");
  if (file.size > 3_500_000) return fail("画像が大きすぎます。");
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  try {
    let imageUrl: string;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(`notes/${id}.png`, file, { access: "public", contentType: "image/png", addRandomSuffix: true });
      imageUrl = blob.url;
    } else if (isDemo()) {
      imageUrl = `data:image/png;base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
    } else {
      return fail("手書きの保存先（Vercel Blob）がまだ繋がっていません。");
    }
    const note = { id, imageUrl, createdAt, memo: String(form.get("memo") ?? "").slice(0, 2000) };
    await store.addNote(note);
    revalidatePath("/notes");
    return ok(note);
  } catch (e) {
    return fail(explain(e, "手書きを保存できませんでした。"));
  }
}

export async function setNoteMemo(input: { id: string; memo: string }): Promise<Result> {
  await requireAuth();
  try {
    await store.updateNoteMemo(input.id, input.memo.slice(0, 2000));
    return ok(undefined);
  } catch (e) {
    return fail(explain(e, "メモを保存できませんでした。"));
  }
}

export async function deleteNote(id: string): Promise<Result> {
  await requireAuth();
  try {
    const n = await store.removeNote(id);
    if (n && n.imageUrl.startsWith("http") && process.env.BLOB_READ_WRITE_TOKEN) await del(n.imageUrl).catch(() => {});
    revalidatePath("/notes");
    return ok(undefined);
  } catch (e) {
    return fail(explain(e, "削除できませんでした。"));
  }
}
