"use server";

import { del, put } from "@vercel/blob";
import { revalidatePath, revalidateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authConfigured, createSession, isDemo, safeEqual, SESSION_COOKIE, SESSION_DAYS, verifySession } from "@/lib/auth";
import { loadBoard, SHEET_TAG } from "@/lib/data";
import { doneThisWeek, type Focus } from "@/lib/focus";
import { MAX_REQUEST_TEXT, validateOp, type AiRequest, type RequestKind } from "@/lib/ops";
import { SheetError, type TaskPatch } from "@/lib/sheets";
import * as store from "@/lib/store";
import { firstLine, PRIORITIES, STATUSES, type Decision, type Settings, type Triage } from "@/lib/tasks";
import { fmtSheetDate, mondayOf, parseDayKey, weekKey } from "@/lib/time";
import { createTask, patchTask, runOp } from "@/lib/writes";

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
    const t = (await loadBoard()).tasks.find((x) => x.row === input.row && x.no === input.no);
    if (isDemo() && !t) return fail("タスクが見つかりません。");
    await patchTask({ row: input.row, no: input.no, title: t?.title }, patch);
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
  const due = input.due && parseDayKey(input.due) != null ? input.due : "";
  try {
    return ok(await createTask({ title, prio, due }));
  } catch (e) {
    return fail(explain(e, "スプシへの追加に失敗しました。"));
  }
}

/* ---------- 今日: focus ---------- */

async function findTask(key: string) {
  if (typeof key !== "string") return null;
  return (await loadBoard()).tasks.find((t) => t.key === key) ?? null;
}

/** 始める: the sheet's 完了状態 becomes 進行中 and the task becomes the focus. */
export async function startTask(key: string): Promise<Result<Focus>> {
  await requireAuth();
  const t = await findTask(key);
  if (!t) return fail("タスクが見つかりません。再読み込みしてください。");
  if (t.status === "完了" || t.status === "メモ") return fail("このタスクは始められません。");
  try {
    if (t.status !== "進行中") await patchTask(t, { status: "進行中" });
    const focus = { taskKey: t.key, startedAt: Date.now() };
    await store.setFocus(focus);
    revalidatePath("/", "layout");
    return ok(focus);
  } catch (e) {
    return fail(explain(e, "始められませんでした。"));
  }
}

/** 終わった: 完了 in the sheet, focus cleared. Returns this week's done count for the celebration. */
export async function finishTask(key: string): Promise<Result<{ weekDone: number }>> {
  await requireAuth();
  const t = await findTask(key);
  if (!t) return fail("タスクが見つかりません。再読み込みしてください。");
  try {
    if (t.status !== "完了") await patchTask(t, { status: "完了" });
    const focus = await store.getFocus();
    if (focus?.taskKey === key) await store.setFocus(null);
    const board = await loadBoard();
    const now = Date.now();
    const done = doneThisWeek(board.tasks, board.triage, await store.listDone(mondayOf(now)), now);
    done.add(key);
    revalidatePath("/", "layout");
    return ok({ weekDone: done.size });
  } catch (e) {
    return fail(explain(e, "完了にできませんでした。"));
  }
}

/** 後にする: only the focus is cleared; the sheet is not touched. */
export async function postponeFocus(): Promise<Result> {
  await requireAuth();
  try {
    await store.setFocus(null);
    revalidatePath("/", "layout");
    return ok(undefined);
  } catch (e) {
    return fail(explain(e, "保存できませんでした。"));
  }
}

/** 相談したい: flag the task on the team page and ask リマ to draft the message. */
export async function askConsult(key: string): Promise<Result> {
  await requireAuth();
  const t = await findTask(key);
  if (!t) return fail("タスクが見つかりません。再読み込みしてください。");
  const now = Date.now();
  try {
    await store.setConsult({ taskKey: t.key, title: firstLine(t.title, 120), createdAt: now });
    await store.createRequest({
      id: crypto.randomUUID(),
      kind: "consult",
      text: `「${firstLine(t.title, 120)}」（No.${t.no}）で詰まっています。チームに送る相談の文面を短く下書きしてください。`,
      taskKey: t.key,
      status: "pending",
      reply: "",
      actions: [],
      createdAt: now,
      updatedAt: now,
    });
    revalidatePath("/", "layout");
    return ok(undefined);
  } catch (e) {
    return fail(explain(e, "相談の印を付けられませんでした。"));
  }
}

export async function clearConsultFlag(key: string): Promise<Result> {
  await requireAuth();
  try {
    await store.clearConsult(String(key));
    revalidatePath("/", "layout");
    return ok(undefined);
  } catch (e) {
    return fail(explain(e, "印を外せませんでした。"));
  }
}

/* ---------- parking (思いついたことのメモ) ---------- */

export async function addParking(text: string): Promise<Result<store.Parking>> {
  await requireAuth();
  const t = String(text ?? "").trim().slice(0, 500);
  if (!t) return fail("メモが空です。");
  const p = { id: crypto.randomUUID(), text: t, createdAt: Date.now() };
  try {
    await store.addParking(p);
    revalidatePath("/", "layout");
    return ok(p);
  } catch (e) {
    return fail(explain(e, "メモを保存できませんでした。"));
  }
}

export async function discardParking(id: string): Promise<Result> {
  await requireAuth();
  try {
    await store.removeParking(String(id));
    revalidatePath("/", "layout");
    return ok(undefined);
  } catch (e) {
    return fail(explain(e, "捨てられませんでした。"));
  }
}

/** タスクにする: add to the sheet (existing add path), then drop the memo. */
export async function parkingToTask(id: string): Promise<Result<string>> {
  await requireAuth();
  const p = (await store.listParking()).find((x) => x.id === id);
  if (!p) return fail("メモが見つかりません。");
  try {
    const no = await createTask({ title: p.text.slice(0, 2000), prio: "-" });
    await store.removeParking(id);
    revalidatePath("/", "layout");
    return ok(no);
  } catch (e) {
    return fail(explain(e, "タスクにできませんでした。"));
  }
}

/* ---------- リマに話す (AI requests processed on the Mac) ---------- */

export async function sendToRima(input: { text: string; kind?: RequestKind; taskKey?: string | null }): Promise<Result<AiRequest>> {
  await requireAuth();
  const text = String(input.text ?? "").trim().slice(0, MAX_REQUEST_TEXT);
  if (!text) return fail("話す内容を入れてください。");
  const kind: RequestKind = input.kind === "dev" ? "dev" : "chat";
  const now = Date.now();
  const r: AiRequest = { id: crypto.randomUUID(), kind, text, taskKey: input.taskKey ?? null, status: "pending", reply: "", actions: [], createdAt: now, updatedAt: now };
  try {
    await store.createRequest(r);
    return ok(r);
  } catch (e) {
    return fail(explain(e, "リマに送れませんでした。"));
  }
}

export async function fetchRequests(): Promise<Result<AiRequest[]>> {
  await requireAuth();
  try {
    return ok(await store.listRequests(20));
  } catch (e) {
    return fail(explain(e, "リマとのやりとりを読めませんでした。"));
  }
}

/**
 * The user pressed an action button: that press is the approval. The op is
 * validated again against the current sheet before it runs, and runs at most once.
 */
export async function runAction(input: { requestId: string; actionId: string }): Promise<Result<string>> {
  await requireAuth();
  const req = await store.getRequest(String(input.requestId));
  const action = req?.actions.find((a) => a.id === input.actionId);
  if (!req || !action) return fail("ボタンが見つかりません。");
  if (action.done) return fail("このボタンはもう実行しました。");
  revalidateTag(SHEET_TAG); // validate against a fresh read, not the 60s cache
  const board = await loadBoard();
  if (board.error) return fail(board.error);
  const op = validateOp(action.op, board.tasks);
  if (!op.ok) return fail(`実行できません: ${op.error}`);
  if (!(await store.setActionDone(req.id, action.id, true))) return fail("このボタンはもう実行しました。");
  try {
    const msg = await runOp(op.value, board.tasks);
    revalidateTag(SHEET_TAG);
    revalidatePath("/", "layout");
    return ok(msg);
  } catch (e) {
    await store.setActionDone(req.id, action.id, false).catch(() => {});
    return fail(explain(e, "実行できませんでした。"));
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
