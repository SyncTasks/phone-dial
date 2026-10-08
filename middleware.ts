import { NextResponse, type NextRequest } from "next/server";
import { isDemo, SESSION_COOKIE, teamTokenOk, verifySession, workerAuthorized } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Mac worker: no login, but only with a valid WORKER_TOKEN (the route handlers check again).
  if (path.startsWith("/api/worker/")) {
    if (workerAuthorized(req.headers.get("authorization"))) return NextResponse.next();
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Read-only team page: no login for /team/<TEAM_VIEW_TOKEN> only; anything else under /team is a 404.
  if (path === "/team" || path.startsWith("/team/")) {
    const parts = path.split("/");
    let token = "";
    try {
      token = decodeURIComponent(parts[2] ?? "");
    } catch {
      token = "";
    }
    if (parts.length === 3 && teamTokenOk(token)) {
      const res = NextResponse.next();
      res.headers.set("X-Robots-Tag", "noindex, nofollow");
      return res;
    }
    return new NextResponse("Not Found", { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } });
  }

  if (isDemo()) return NextResponse.next();
  const ok = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = path === "/" ? "" : `?next=${encodeURIComponent(path)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the login page, Next internals and static files.
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
