import "server-only";
import { NextResponse } from "next/server";
import { workerAuthorized } from "./auth";

// Shared bits of the Mac worker API (/api/worker/*). The middleware already
// rejects bad tokens; each handler checks again so a matcher change can't open it.

export function denyUnlessWorker(req: Request) {
  if (workerAuthorized(req.headers.get("authorization"))) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
