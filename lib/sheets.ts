import "server-only";
import { GoogleAuthError, googleAccessToken, serviceAccountConfigured } from "./google";
import { normalizeStatus, taskKey, type Task } from "./tasks";
import { parseSheetDate } from "./time";

// Google Sheets REST access with a service account. The sheet must be shared
// (as editor) with GOOGLE_SERVICE_ACCOUNT_EMAIL.

const API = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export const HEADERS = {
  no: "No",
  status: "完了状態",
  title: "タスク名",
  prio: "優先度",
  quad: "象限",
  due: "期日",
  posted: "投稿日時",
  owner: "担当者",
  group: "発生元グループ",
  note: "備考",
  url: "参照URL",
} as const;
type Field = keyof typeof HEADERS;

export class SheetError extends Error {
  constructor(message: string, readonly kind: "config" | "auth" | "conflict" | "upstream" = "upstream") {
    super(message);
  }
}

export function sheetConfigured() {
  return Boolean(process.env.SHEET_ID && serviceAccountConfigured());
}

const tab = () => process.env.SHEET_TAB || "久保田";
const range = (a1: string) => encodeURIComponent(`'${tab().replace(/'/g, "''")}'!${a1}`);

async function accessToken() {
  try {
    return await googleAccessToken(SCOPE);
  } catch (e) {
    if (e instanceof GoogleAuthError) throw new SheetError(e.message, e.kind);
    throw e;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const id = process.env.SHEET_ID;
  if (!id) throw new SheetError("SHEET_ID が設定されていません。", "config");
  const res = await fetch(`${API}/${id}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (res.status === 403 || res.status === 404) {
    throw new SheetError(
      `スプシを開けません（${res.status}）。サービスアカウント ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL} を編集者として共有してください。`,
      "auth",
    );
  }
  if (!res.ok) throw new SheetError(`Google Sheets API エラー（${res.status}）`);
  return (await res.json()) as T;
}

/** Column index (0-based) of each known header; missing headers map to -1. */
function headerMap(header: string[]) {
  const trimmed = header.map((h) => String(h ?? "").trim());
  return Object.fromEntries(
    (Object.keys(HEADERS) as Field[]).map((f) => [f, trimmed.indexOf(HEADERS[f])]),
  ) as Record<Field, number>;
}

function colLetter(i: number) {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export function rowsToTasks(values: string[][]): Task[] {
  if (!values.length) return [];
  const col = headerMap(values[0]);
  if (col.no < 0 || col.status < 0 || col.title < 0) {
    throw new SheetError("シートの見出し（No / 完了状態 / タスク名）が見つかりません。", "config");
  }
  const get = (r: string[], f: Field) => (col[f] >= 0 ? String(r[col[f]] ?? "").trim() : "");
  const tasks: Task[] = [];
  values.slice(1).forEach((r, i) => {
    const title = get(r, "title");
    if (!title) return;
    const dueRaw = get(r, "due");
    const due = parseSheetDate(dueRaw);
    tasks.push({
      key: taskKey(get(r, "no")),
      no: get(r, "no"),
      row: i + 2,
      status: normalizeStatus(get(r, "status")),
      title,
      prio: get(r, "prio"),
      due,
      dueText: due == null ? dueRaw : "",
      posted: parseSheetDate(get(r, "posted")),
      group: get(r, "group"),
      note: get(r, "note"),
      url: get(r, "url"),
    });
  });
  return tasks;
}

export async function readTasks(): Promise<Task[]> {
  const data = await call<{ values?: string[][] }>(
    `/values/${range("A1:Z")}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
  );
  return rowsToTasks(data.values ?? []);
}

export type TaskPatch = Partial<{ status: string; prio: string; due: string }>;

/**
 * Write fields of one task back to its row. The row is re-read first and must
 * still hold the same No, so a sheet edited in the meantime is never clobbered.
 */
/** Re-read the header and one row; throw unless that row still holds `no`. */
async function verifiedRow(row: number, no: string) {
  if (!Number.isInteger(row) || row < 2) throw new SheetError("行番号が不正です。", "conflict");
  const head = await call<{ values?: string[][] }>(`/values/${range("1:1")}`);
  const col = headerMap(head.values?.[0] ?? []);
  const current = await call<{ values?: string[][] }>(`/values/${range(`${row}:${row}`)}`);
  const cells = current.values?.[0] ?? [];
  if (col.no < 0 || String(cells[col.no] ?? "").trim() !== no) {
    throw new SheetError("スプシの行がずれています。再読み込みしてからもう一度お試しください。", "conflict");
  }
  return { col, cells };
}

export async function updateTaskRow(row: number, no: string, patch: TaskPatch) {
  const { col } = await verifiedRow(row, no);
  const data = (Object.keys(patch) as (keyof TaskPatch)[])
    .filter((f) => patch[f] !== undefined && col[f] >= 0)
    .map((f) => ({ range: `'${tab()}'!${colLetter(col[f])}${row}`, values: [[patch[f]]] }));
  if (!data.length) return;
  await call(`/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
  });
}

/** Append a new task as the next No. Returns the new No. */
export async function appendTask(fields: { title: string; prio: string; due: string; posted: string; owner: string; group: string; note?: string }) {
  const values = (await call<{ values?: string[][] }>(`/values/${range("A1:Z")}`)).values ?? [];
  const header = values[0] ?? [];
  const col = headerMap(header);
  if (col.no < 0 || col.title < 0) throw new SheetError("シートの見出しが見つかりません。", "config");
  const maxNo = values.slice(1).reduce((m, r) => Math.max(m, Number(r[col.no]) || 0), 0);
  const no = String(maxNo + 1);
  const row: string[] = Array(header.length).fill("");
  const set = (f: Field, v: string) => {
    if (col[f] >= 0) row[col[f]] = v;
  };
  set("no", no);
  set("status", "未着手");
  set("title", fields.title);
  set("prio", fields.prio || "-");
  set("due", fields.due);
  set("posted", fields.posted);
  set("owner", fields.owner);
  set("group", fields.group);
  if (fields.note) set("note", fields.note);
  await call(`/values/${range("A1")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ values: [row] }),
  });
  return no;
}

/** The marker the autonomous-dev patrol (kubota_tasks.py list --ai) looks for in タスク名 / 備考. */
export const AI_MARK = /[#＃]\s?AI(?![A-Za-z])/i;

/** 備考 with " #AI" appended, or null when the marker is already there. */
export function withDevMarker(note: string) {
  if (AI_MARK.test(note)) return null;
  return note.trim() ? `${note.trimEnd()} #AI` : "#AI";
}

/**
 * Hand a task to the autonomous-dev patrol: append " #AI" to its 備考.
 * Same No verification as other writes, and only the 備考 cell is written.
 * Returns false when the marker was already there.
 */
export async function appendDevMarker(row: number, no: string) {
  const { col, cells } = await verifiedRow(row, no);
  if (col.note < 0) throw new SheetError("シートに「備考」列が見つかりません。", "config");
  const next = withDevMarker(String(cells[col.note] ?? ""));
  if (next == null) return false;
  await call(`/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "RAW", data: [{ range: `'${tab()}'!${colLetter(col.note)}${row}`, values: [[next]] }] }),
  });
  return true;
}
