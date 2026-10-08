import { describe, expect, it } from "vitest";
import { teamViewToken, workerAuthorized } from "@/lib/auth";

const TOKEN = "w".repeat(32);

describe("workerAuthorized", () => {
  it("accepts only the exact bearer token", () => {
    expect(workerAuthorized(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(workerAuthorized(`bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(workerAuthorized(`Bearer ${TOKEN}x`, TOKEN)).toBe(false);
    expect(workerAuthorized(`Bearer ${TOKEN.slice(1)}`, TOKEN)).toBe(false);
    expect(workerAuthorized(TOKEN, TOKEN)).toBe(false);
    expect(workerAuthorized(`Basic ${TOKEN}`, TOKEN)).toBe(false);
    expect(workerAuthorized(null, TOKEN)).toBe(false);
    expect(workerAuthorized("", TOKEN)).toBe(false);
  });
  it("is disabled when WORKER_TOKEN is missing or too short", () => {
    expect(workerAuthorized("Bearer ", "")).toBe(false);
    expect(workerAuthorized("Bearer undefined", undefined)).toBe(false);
    expect(workerAuthorized("Bearer short", "short")).toBe(false);
  });
});

describe("teamViewToken", () => {
  it("uses TEAM_VIEW_TOKEN, a demo token only in DEMO, and nothing otherwise", () => {
    expect(teamViewToken({ TEAM_VIEW_TOKEN: "t".repeat(24) })).toBe("t".repeat(24));
    expect(teamViewToken({ TEAM_VIEW_TOKEN: "short", DEMO: "1" })).toBe("demo-team");
    expect(teamViewToken({})).toBeNull();
    expect(teamViewToken({ TEAM_VIEW_TOKEN: "short" })).toBeNull();
  });
});
