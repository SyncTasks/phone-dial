import "server-only";
import { unstable_cache } from "next/cache";
import { isDemo } from "./auth";
import { googleAccessToken, serviceAccountConfigured } from "./google";
import { parseGoogleEvents, type CalEvent, type GoogleEvent } from "./schedule";
import { addDays, fromJst, jst, mondayOf, startOfDay } from "./time";

// Google Calendar, read-only. The calendar (GOOGLE_CALENDAR_ID) must be shared
// with the service account ("予定の表示（すべての予定の詳細）").

const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

export type Schedule = { configured: boolean; events: CalEvent[] };

export function calendarConfigured() {
  return Boolean(process.env.GOOGLE_CALENDAR_ID && serviceAccountConfigured());
}

/** This week (Mon–Sun) plus the next day, so "次の予定" works on Sunday night. Day-aligned, so the cache key is stable. */
function windowFor(now: number) {
  const from = mondayOf(now);
  return { from, to: Math.max(addDays(from, 7), startOfDay(addDays(now, 2))) };
}

async function fetchEvents(from: number, to: number): Promise<CalEvent[]> {
  const id = process.env.GOOGLE_CALENDAR_ID!;
  const q = new URLSearchParams({
    timeMin: new Date(from).toISOString(),
    timeMax: new Date(to).toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
    timeZone: "Asia/Tokyo",
  });
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events?${q}`, {
    headers: { authorization: `Bearer ${await googleAccessToken(SCOPE)}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google Calendar API ${res.status}`);
  const json = (await res.json()) as { items?: GoogleEvent[] };
  return parseGoogleEvents(json.items ?? []);
}

// Errors are cached too (as an empty list), so a broken share logs once a minute, not per request.
const cachedEvents = unstable_cache(
  async (from: number, to: number) => {
    try {
      return await fetchEvents(from, to);
    } catch (e) {
      console.error("[calendar]", e instanceof Error ? e.message : e);
      return [];
    }
  },
  ["calendar-events"],
  { revalidate: 60, tags: ["calendar"] },
);

export async function loadSchedule(now = Date.now()): Promise<Schedule> {
  if (isDemo()) return { configured: true, events: demoEvents(now) };
  if (!calendarConfigured()) return { configured: false, events: [] };
  const { from, to } = windowFor(now);
  return { configured: true, events: await cachedEvents(from, to) };
}

/** Invented events around `now` for DEMO=1. */
export function demoEvents(now: number): CalEvent[] {
  const p = jst(now);
  const mon = mondayOf(now);
  const at = (dayOffset: number, h: number, m = 0) => {
    const d = jst(addDays(mon, dayOffset));
    return fromJst(d.y, d.m, d.d, h, m);
  };
  const soon = Math.ceil((now + 35 * 60000) / (15 * 60000)) * 15 * 60000;
  const today = fromJst(p.y, p.m, p.d);
  const list: CalEvent[] = [
    { id: "d1", title: "朝会", start: today + 9.5 * 3600000, end: today + 10 * 3600000, allDay: false, busy: true },
    { id: "d2", title: "CA定例", start: soon, end: soon + 3600000, allDay: false, busy: true },
    { id: "d3", title: "1on1（佐藤さん）", start: soon + 3 * 3600000, end: soon + 3.5 * 3600000, allDay: false, busy: true },
  ];
  for (let i = 0; i < 7; i++) {
    if (i === (p.dow + 6) % 7) continue;
    list.push({ id: `w${i}a`, title: "朝会", start: at(i, 9, 30), end: at(i, 10), allDay: false, busy: i < 5 });
    if (i % 2 === 0) list.push({ id: `w${i}b`, title: "打ち合わせ", start: at(i, 14), end: at(i, 15, 30), allDay: false, busy: true });
    if (i === 3) list.push({ id: `w${i}c`, title: "外出", start: at(i, 0), end: at(i + 1, 0), allDay: true, busy: true });
  }
  return list.sort((a, b) => a.start - b.start);
}
