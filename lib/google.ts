import "server-only";
import { importPKCS8, SignJWT } from "jose";

// Service-account access tokens (JWT bearer flow), one cached token per scope.
// Shared by Sheets (read/write) and Calendar (read-only).

export class GoogleAuthError extends Error {
  constructor(message: string, readonly kind: "config" | "auth") {
    super(message);
  }
}

export function serviceAccountConfigured() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
}

const tokens = new Map<string, { value: string; exp: number }>();

export async function googleAccessToken(scope: string) {
  const cached = tokens.get(scope);
  if (cached && cached.exp - 60_000 > Date.now()) return cached.value;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const raw = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !raw) throw new GoogleAuthError("Googleのサービスアカウントが設定されていません。", "config");
  const key = await importPKCS8(raw.replace(/\\n/g, "\n"), "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    cache: "no-store",
  });
  if (!res.ok) throw new GoogleAuthError(`Googleの認証に失敗しました（${res.status}）。サービスアカウントの鍵を確認してください。`, "auth");
  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokens.set(scope, { value: json.access_token, exp: Date.now() + json.expires_in * 1000 });
  return json.access_token;
}
