// All calendar logic runs in Japan time (UTC+9, no DST), whatever the server's zone.
// Instants are epoch milliseconds; calendar days are "YYYY-MM-DD" strings in JST.

const JST_OFFSET = 9 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** Calendar fields of an instant as seen in JST. */
export function jst(ms: number) {
  const d = new Date(ms + JST_OFFSET);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    h: d.getUTCHours(),
    min: d.getUTCMinutes(),
    dow: d.getUTCDay(),
  };
}

/** Epoch ms for a JST wall-clock time. */
export function fromJst(y: number, m: number, d: number, h = 0, min = 0) {
  return Date.UTC(y, m - 1, d, h, min) - JST_OFFSET;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function dayKey(ms: number) {
  const p = jst(ms);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function startOfDay(ms: number) {
  const p = jst(ms);
  return fromJst(p.y, p.m, p.d);
}

/** Whole calendar days from `today` to `ms` (negative = past). */
export function daysFrom(ms: number, today: number) {
  return Math.round((startOfDay(ms) - startOfDay(today)) / DAY);
}

/** Monday 00:00 JST of the week containing `ms`. */
export function mondayOf(ms: number) {
  const start = startOfDay(ms);
  const back = (jst(ms).dow + 6) % 7;
  return start - back * DAY;
}

/** Stable id of the week containing `ms`: its Monday's day key. */
export function weekKey(ms: number) {
  return dayKey(mondayOf(ms));
}

export function addDays(ms: number, n: number) {
  return ms + n * DAY;
}

/** "10/8(木)" or with time "10/8(木) 15:09" (time only when not midnight). */
export function fmtDate(ms: number | null | undefined, withTime = false) {
  if (ms == null) return "";
  const p = jst(ms);
  const s = `${p.m}/${p.d}(${WEEKDAYS[p.dow]})`;
  return withTime && (p.h || p.min) ? `${s} ${p.h}:${pad(p.min)}` : s;
}

export function fmtTime(ms: number) {
  const p = jst(ms);
  return `${p.h}:${pad(p.min)}`;
}

/** Format used by the sheet's 投稿日時 column: "2026/10/08(木) 15:09". */
export function fmtSheetStamp(ms: number) {
  const p = jst(ms);
  return `${p.y}/${pad(p.m)}/${pad(p.d)}(${WEEKDAYS[p.dow]}) ${pad(p.h)}:${pad(p.min)}`;
}

/** Format used by the sheet's 期日 column: "2026/10/08". */
export function fmtSheetDate(ms: number) {
  const p = jst(ms);
  return `${p.y}/${pad(p.m)}/${pad(p.d)}`;
}

/**
 * Parse the sheet's date strings, read as JST:
 * "2026/10/08(木) 15:09", "2026/10/06 9:37:00", "2026/02/28", "2026-02-28".
 * Returns null for anything else ("なる早", "").
 */
export function parseSheetDate(v: unknown): number | null {
  const m = String(v ?? "").match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?:\D+?(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const [y, mo, d, h, mi] = [+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0)];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return fromJst(y, mo, d, h, mi);
}

/** Parse "YYYY-MM-DD" from a date input as a JST day. */
export function parseDayKey(s: string): number | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? fromJst(+m[1], +m[2], +m[3]) : null;
}

/** Most recent review slot at or before `now` (weekday 0-6, "HH:MM", JST). */
export function lastSlot(now: number, dow: number, time: string) {
  const [h, mi] = time.split(":").map(Number);
  const p = jst(now);
  let slot = fromJst(p.y, p.m, p.d, h || 0, mi || 0) - ((p.dow - dow + 7) % 7) * DAY;
  if (slot > now) slot -= 7 * DAY;
  return slot;
}

export function nextSlot(now: number, dow: number, time: string) {
  return lastSlot(now, dow, time) + 7 * DAY;
}
