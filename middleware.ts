import { NextResponse, type NextRequest } from "next/server";
import { isDemo, SESSION_COOKIE, verifySession } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  if (isDemo()) return NextResponse.next();
  const ok = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = req.nextUrl.pathname === "/" ? "" : `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the login page, Next internals and static files.
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
