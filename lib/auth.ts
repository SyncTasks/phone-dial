import { jwtVerify, SignJWT } from "jose";

// Single-user password login. The session is an HS256 JWT in an httpOnly cookie.

export const SESSION_COOKIE = "tb_session";
export const SESSION_DAYS = 30;

export const isDemo = () => process.env.DEMO === "1";

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) return null;
  return new TextEncoder().encode(s);
}

export function authConfigured() {
  return Boolean(process.env.APP_PASSWORD && secret());
}

export async function createSession() {
  const key = secret();
  if (!key) throw new Error("AUTH_SECRET is not set");
  return new SignJWT({ sub: "owner" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key);
}

export async function verifySession(token: string | undefined) {
  const key = secret();
  if (!token || !key) return false;
  try {
    await jwtVerify(token, key, { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}

/** Constant-time string comparison (edge- and node-safe). */
export function safeEqual(a: string, b: string) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

/* ---------- machine & team access (no login) ---------- */

const MIN_TOKEN = 16;

/**
 * True when an `Authorization: Bearer <token>` header carries WORKER_TOKEN.
 * A missing or short WORKER_TOKEN disables the worker API entirely.
 */
export function workerAuthorized(header: string | null | undefined, token = process.env.WORKER_TOKEN) {
  if (!token || token.length < MIN_TOKEN || !header) return false;
  const m = header.match(/^Bearer\s+(\S+)\s*$/i);
  return Boolean(m && safeEqual(m[1], token));
}

/** The secret path segment of the team page. In DEMO without TEAM_VIEW_TOKEN it is "demo-team". */
export function teamViewToken(env: Record<string, string | undefined> = process.env) {
  const t = env.TEAM_VIEW_TOKEN;
  if (t && t.length >= MIN_TOKEN) return t;
  return env.DEMO === "1" ? "demo-team" : null;
}

export function teamTokenOk(candidate: string | undefined) {
  const t = teamViewToken();
  return Boolean(t && candidate && safeEqual(candidate, t));
}
