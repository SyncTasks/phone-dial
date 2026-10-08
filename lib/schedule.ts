import { addDays, dayKey, mondayOf, parseDayKey, startOfDay } from "./time";

// Calendar events as the app uses them, and the pure conversions on them.

export type CalEvent = {
  id: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  /** "free" events (transparency=transparent) are shown but do not count as busy. */
  busy: boolean;
};

type GDate = { dateTime?: string; date?: string };
export type GoogleEvent = {
  id?: string;
  status?: string;
  summary?: string;
  start?: GDate;
  end?: GDate;
  transparency?: string;
  attendees?: { self?: boolean; responseStatus?: string }[];
};

function toMs(d: GDate | undefined): { ms: number; allDay: boolean } | null {
  if (d?.dateTime) {
    const ms = Date.parse(d.dateTime);
    return Number.isFinite(ms) ? { ms, allDay: false } : null;
  }
  if (d?.date) {
    const ms = parseDayKey(d.date);
    return ms == null ? null : { ms, allDay: true };
  }
  return null;
}

/** Google Calendar API items → CalEvent. Drops cancelled and declined events. */
export function parseGoogleEvents(items: GoogleEvent[]): CalEvent[] {
  const out: CalEvent[] = [];
  for (const it of items) {
    if (it.status === "cancelled") continue;
    if (it.attendees?.some((a) => a.self && a.responseStatus === "declined")) continue;
    const s = toMs(it.start);
    const e = toMs(it.end);
    if (!s || !e || e.ms <= s.ms) continue;
    out.push({
      id: it.id ?? `${s.ms}`,
      title: (it.summary ?? "").trim() || "(タイトルなし)",
      start: s.ms,
      end: e.ms,
      allDay: s.allDay,
      busy: it.transparency !== "transparent",
    });
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

/** Timed events overlapping the JST day of `now`. */
export function eventsOn(events: CalEvent[], now: number) {
  const from = startOfDay(now);
  const to = addDays(from, 1);
  return events.filter((e) => e.start < to && e.end > from);
}

/** The event in progress (if any) and the next one to start after `now` (timed events only). */
export function nextEvents(events: CalEvent[], now: number) {
  const timed = events.filter((e) => !e.allDay);
  return {
    current: timed.find((e) => e.start <= now && e.end > now) ?? null,
    next: timed.find((e) => e.start > now) ?? null,
  };
}

export type BusyBlock = { day: string; start: number; end: number };
export type BusyDay = { day: string; date: number; allDay: boolean; blocks: BusyBlock[] };

/**
 * The week (Mon–Sun, JST) containing `now` as busy blocks without titles:
 * busy timed events clipped to each day and merged where they overlap or touch.
 * All-day busy events only set the day's `allDay` flag.
 */
export function busyWeek(events: CalEvent[], now: number): BusyDay[] {
  const mon = mondayOf(now);
  return Array.from({ length: 7 }, (_, i) => {
    const from = addDays(mon, i);
    const to = addDays(from, 1);
    const day = dayKey(from);
    let allDay = false;
    const spans: [number, number][] = [];
    for (const e of events) {
      if (!e.busy || e.end <= from || e.start >= to) continue;
      if (e.allDay) {
        allDay = true;
        continue;
      }
      spans.push([Math.max(e.start, from), Math.min(e.end, to)]);
    }
    spans.sort((a, b) => a[0] - b[0]);
    const blocks: BusyBlock[] = [];
    for (const [s, e] of spans) {
      const last = blocks[blocks.length - 1];
      if (last && s <= last.end) last.end = Math.max(last.end, e);
      else blocks.push({ day, start: s, end: e });
    }
    return { day, date: from, allDay, blocks };
  });
}
