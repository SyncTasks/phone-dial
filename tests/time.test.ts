import { describe, expect, it } from "vitest";
import { daysFrom, dayKey, fmtDate, fmtSheetStamp, fromJst, lastSlot, nextSlot, parseSheetDate, weekKey } from "@/lib/time";

describe("JST calendar helpers", () => {
  it("parses the sheet's date formats as JST", () => {
    expect(parseSheetDate("2026/10/08(木) 15:09")).toBe(fromJst(2026, 10, 8, 15, 9));
    expect(parseSheetDate("2026/10/06 9:37:00")).toBe(fromJst(2026, 10, 6, 9, 37));
    expect(parseSheetDate("2026/02/28")).toBe(fromJst(2026, 2, 28));
    expect(parseSheetDate("なる早")).toBeNull();
    expect(parseSheetDate("")).toBeNull();
  });

  it("uses Japan's calendar day even when UTC is still the previous day", () => {
    const earlyMorningJst = fromJst(2026, 10, 8, 1, 0); // 2026-10-07 16:00 UTC
    expect(dayKey(earlyMorningJst)).toBe("2026-10-08");
    expect(fmtDate(earlyMorningJst)).toBe("10/8(木)");
  });

  it("counts calendar days, not 24h spans", () => {
    const now = fromJst(2026, 10, 8, 23, 50);
    expect(daysFrom(fromJst(2026, 10, 9, 0, 10), now)).toBe(1);
    expect(daysFrom(fromJst(2026, 10, 7, 23, 0), now)).toBe(-1);
  });

  it("keys weeks by Monday", () => {
    expect(weekKey(fromJst(2026, 10, 8))).toBe("2026-10-05"); // Thursday
    expect(weekKey(fromJst(2026, 10, 11, 23))).toBe("2026-10-05"); // Sunday night
    expect(weekKey(fromJst(2026, 10, 12))).toBe("2026-10-12"); // Monday
  });

  it("finds the last and next review slot", () => {
    const thu = fromJst(2026, 10, 8, 12);
    expect(lastSlot(thu, 1, "09:00")).toBe(fromJst(2026, 10, 5, 9));
    expect(nextSlot(thu, 1, "09:00")).toBe(fromJst(2026, 10, 12, 9));
    const monEarly = fromJst(2026, 10, 12, 8, 59);
    expect(lastSlot(monEarly, 1, "09:00")).toBe(fromJst(2026, 10, 5, 9));
    expect(lastSlot(fromJst(2026, 10, 12, 9), 1, "09:00")).toBe(fromJst(2026, 10, 12, 9));
  });

  it("formats the 投稿日時 stamp like the sheet", () => {
    expect(fmtSheetStamp(fromJst(2026, 10, 8, 9, 5))).toBe("2026/10/08(木) 09:05");
  });
});
