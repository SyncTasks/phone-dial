import { describe, expect, it } from "vitest";
import { busyWeek, eventsOn, nextEvents, parseGoogleEvents, type CalEvent } from "@/lib/schedule";
import { fromJst } from "@/lib/time";

const NOW = fromJst(2026, 10, 8, 12); // Thu
const ev = (id: string, s: number, e: number, extra: Partial<CalEvent> = {}): CalEvent => ({ id, title: id, start: s, end: e, allDay: false, busy: true, ...extra });

describe("parseGoogleEvents", () => {
  it("reads timed and all-day events in JST, dropping cancelled/declined/broken ones", () => {
    const out = parseGoogleEvents([
      { id: "a", summary: "朝会", start: { dateTime: "2026-10-08T09:30:00+09:00" }, end: { dateTime: "2026-10-08T10:00:00+09:00" } },
      { id: "b", summary: "休み", start: { date: "2026-10-09" }, end: { date: "2026-10-10" } },
      { id: "c", status: "cancelled", start: { dateTime: "2026-10-08T11:00:00+09:00" }, end: { dateTime: "2026-10-08T12:00:00+09:00" } },
      { id: "d", attendees: [{ self: true, responseStatus: "declined" }], start: { dateTime: "2026-10-08T13:00:00+09:00" }, end: { dateTime: "2026-10-08T14:00:00+09:00" } },
      { id: "e", start: { dateTime: "nope" }, end: { dateTime: "nope" } },
      { id: "f", transparency: "transparent", start: { dateTime: "2026-10-08T16:00:00+09:00" }, end: { dateTime: "2026-10-08T17:00:00+09:00" } },
    ]);
    expect(out.map((e) => e.id)).toEqual(["a", "f", "b"]);
    expect(out[0]).toMatchObject({ start: fromJst(2026, 10, 8, 9, 30), allDay: false, busy: true });
    expect(out[1]).toMatchObject({ title: "(タイトルなし)", busy: false });
    expect(out[2]).toMatchObject({ start: fromJst(2026, 10, 9), end: fromJst(2026, 10, 10), allDay: true });
  });
});

describe("busyWeek", () => {
  const week = busyWeek(
    [
      ev("a", fromJst(2026, 10, 8, 9), fromJst(2026, 10, 8, 10)),
      ev("b", fromJst(2026, 10, 8, 9, 30), fromJst(2026, 10, 8, 11)), // overlaps a
      ev("c", fromJst(2026, 10, 8, 11), fromJst(2026, 10, 8, 12)), // touches b
      ev("d", fromJst(2026, 10, 8, 14), fromJst(2026, 10, 8, 15)),
      ev("free", fromJst(2026, 10, 8, 16), fromJst(2026, 10, 8, 17), { busy: false }),
      ev("night", fromJst(2026, 10, 6, 23), fromJst(2026, 10, 7, 1)), // spans midnight
      ev("off", fromJst(2026, 10, 9), fromJst(2026, 10, 10), { allDay: true }),
      ev("next-week", fromJst(2026, 10, 12, 9), fromJst(2026, 10, 12, 10)),
    ],
    NOW,
  );

  it("covers Mon–Sun of the current week", () => {
    expect(week.map((d) => d.day)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
  });
  it("merges overlapping and touching blocks and ignores free time", () => {
    expect(week[3].blocks.map((b) => [b.start, b.end])).toEqual([
      [fromJst(2026, 10, 8, 9), fromJst(2026, 10, 8, 12)],
      [fromJst(2026, 10, 8, 14), fromJst(2026, 10, 8, 15)],
    ]);
  });
  it("clips events at midnight and flags all-day days", () => {
    expect(week[1].blocks).toEqual([{ day: "2026-10-06", start: fromJst(2026, 10, 6, 23), end: fromJst(2026, 10, 7) }]);
    expect(week[2].blocks).toEqual([{ day: "2026-10-07", start: fromJst(2026, 10, 7), end: fromJst(2026, 10, 7, 1) }]);
    expect(week[4]).toMatchObject({ allDay: true, blocks: [] });
  });
  it("carries no titles", () => {
    expect(JSON.stringify(week)).not.toMatch(/"(a|b|night|off)"|title/);
  });
});

describe("today helpers", () => {
  const list = [ev("past", fromJst(2026, 10, 8, 9), fromJst(2026, 10, 8, 10)), ev("now", fromJst(2026, 10, 8, 11, 30), fromJst(2026, 10, 8, 12, 30)), ev("later", fromJst(2026, 10, 8, 15), fromJst(2026, 10, 8, 16)), ev("tomorrow", fromJst(2026, 10, 9, 9), fromJst(2026, 10, 9, 10))];
  it("finds the current and next event", () => {
    expect(nextEvents(list, NOW)).toMatchObject({ current: { id: "now" }, next: { id: "later" } });
    expect(eventsOn(list, NOW).map((e) => e.id)).toEqual(["past", "now", "later"]);
  });
});
