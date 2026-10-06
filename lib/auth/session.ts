import "server-only";
import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify, SignJWT } from "jose";
import { db, kvGet, kvSet } from "../db";
import { env } from "../env";

export const SESSION_COOKIE = "berth_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type Role = "admin" | "viewer";
export type Principal = { username: string; role: Role; via: "session" | "token" };

function secretKey(): Uint8Array {
  let secret = env.sessionSecret;
  if (!secret) {
    // No SESSION_SECRET configured: generate one once and persist it with the data.
    secret = kvGet<string>("session_secret") ?? "";
    if (!secret) {
      secret = crypto.randomBytes(48).toString("base64url");
      kvSet("session_secret", secret);
    }
  }
  return new TextEncoder().encode(secret);
}

export function roleOf(username: string): Role {
  if (username === env.adminUsername) return "admin";
  const row = db().prepare("SELECT role FROM users WHERE username = ?").get(username) as { role: Role } | undefined;
  return row?.role === "admin" ? "admin" : "viewer";
}

export async function createSession(username: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(username)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
  const h = await headers();
  const secure = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim() === "https";
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

async function principalFromToken(raw: string): Promise<Principal | null> {
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const row = db().prepare("SELECT id, role, name FROM api_tokens WHERE token_hash = ?").get(hash) as
    | { id: number; role: Role; name: string }
    | undefined;
  if (!row) return null;
  db().prepare("UPDATE api_tokens SET last_used_at = ? WHERE id = ?").run(Date.now(), row.id);
  return { username: `token:${row.name}`, role: row.role === "admin" ? "admin" : "viewer", via: "token" };
}

/** Resolves the caller from a Bearer API token or the session cookie. */
export async function currentPrincipal(): Promise<Principal | null> {
  const h = await headers();
  const auth = h.get("authorization");
  if (auth?.startsWith("Bearer berth_")) return principalFromToken(auth.slice("Bearer ".length).trim());

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return { username: payload.sub, role: roleOf(payload.sub), via: "session" };
  } catch {
    return null;
  }
}

/** For pages and server actions: redirects to /login when signed out. */
export async function requireUser(): Promise<Principal> {
  const p = await currentPrincipal();
  if (!p) redirect("/login");
  return p;
}

export async function requireAdmin(): Promise<Principal> {
  const p = await requireUser();
  if (p.role !== "admin") throw new Error("This action requires the admin role.");
  return p;
}
