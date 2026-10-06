import "server-only";
import crypto from "node:crypto";
import { audit } from "./audit";
import { htpasswdHasUser, listHtpasswdUsers, removeHtpasswdUser, setHtpasswdUser, verifyHtpasswd } from "./auth/htpasswd";
import { roleOf, type Role } from "./auth/session";
import { checkCredentials } from "./registry/client";
import { db } from "./db";
import { env, features } from "./env";

export type UserRow = { username: string; role: Role; created_at: number | null; last_login: number | null; bootstrap: boolean; registryAccess: boolean };

export function listUsers(): UserRow[] {
  const meta = new Map(
    (db().prepare("SELECT * FROM users").all() as { username: string; role: Role; created_at: number; last_login: number | null }[]).map((u) => [u.username, u]),
  );
  const names = new Set<string>([env.adminUsername, ...meta.keys(), ...listHtpasswdUsers()]);
  const inHtpasswd = new Set(listHtpasswdUsers());
  return [...names].sort().map((username) => {
    const m = meta.get(username);
    return {
      username,
      role: roleOf(username),
      created_at: m?.created_at ?? null,
      last_login: m?.last_login ?? null,
      bootstrap: username === env.adminUsername,
      registryAccess: !features.userManagement || inHtpasswd.has(username),
    };
  });
}

function upsertMeta(username: string, role?: Role) {
  db()
    .prepare(
      `INSERT INTO users (username, role, created_at) VALUES (?, ?, ?)
       ON CONFLICT(username) DO UPDATE SET role = COALESCE(?, users.role)`,
    )
    .run(username, role ?? "viewer", Date.now(), role ?? null);
}

export async function createUser(actor: string, username: string, password: string, role: Role) {
  if (!features.userManagement) throw new Error("User management needs HTPASSWD_PATH.");
  if (username === env.adminUsername || htpasswdHasUser(username)) throw new Error(`User '${username}' already exists.`);
  await setHtpasswdUser(username, password);
  upsertMeta(username, role);
  audit(actor, "user.create", username, { role });
}

export async function setPassword(actor: string, username: string, password: string) {
  if (!features.userManagement) throw new Error("User management needs HTPASSWD_PATH.");
  if (username === env.adminUsername) throw new Error("The bootstrap admin's password comes from ADMIN_PASSWORD.");
  await setHtpasswdUser(username, password);
  upsertMeta(username);
  audit(actor, "user.password", username);
}

export function setRole(actor: string, username: string, role: Role) {
  if (username === env.adminUsername) throw new Error("The bootstrap admin is always an admin.");
  upsertMeta(username, role);
  db().prepare("UPDATE users SET role = ? WHERE username = ?").run(role, username);
  audit(actor, "user.role", username, { role });
}

export function deleteUser(actor: string, username: string) {
  if (username === env.adminUsername) throw new Error("The bootstrap admin can't be deleted.");
  if (features.userManagement) removeHtpasswdUser(username);
  db().prepare("DELETE FROM users WHERE username = ?").run(username);
  audit(actor, "user.delete", username);
}

export function generatePassword(): string {
  return crypto.randomBytes(18).toString("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Dashboard login. The bootstrap admin is checked against env; everyone else
 * against the shared htpasswd file, or the registry itself when Berth doesn't
 * manage htpasswd.
 */
export async function authenticate(username: string, password: string): Promise<boolean> {
  let ok = false;
  if (username === env.adminUsername) {
    ok = env.adminPassword !== "" && safeEqual(password, env.adminPassword);
  } else if (features.userManagement) {
    ok = await verifyHtpasswd(username, password);
  } else {
    // An open registry accepts any credentials, so it can't vouch for anyone.
    ok = (await checkCredentials(username, password).catch(() => "invalid" as const)) === "valid";
  }
  if (ok) {
    upsertMeta(username);
    db().prepare("UPDATE users SET last_login = ? WHERE username = ?").run(Date.now(), username);
  }
  return ok;
}

/** Makes sure the bootstrap admin can authenticate to the registry. Runs at boot. */
export async function ensureBootstrapAdmin() {
  upsertMeta(env.adminUsername, "admin");
  if (!features.userManagement || !env.adminPassword) return;
  if (!(await verifyHtpasswd(env.adminUsername, env.adminPassword))) {
    await setHtpasswdUser(env.adminUsername, env.adminPassword);
    console.log(`[berth] synced bootstrap admin '${env.adminUsername}' into ${env.htpasswdPath}`);
  }
}

const attempts = new Map<string, { n: number; reset: number }>();

/** 10 failed attempts per key per 10 minutes. */
export function loginThrottled(key: string): boolean {
  const a = attempts.get(key);
  return Boolean(a && a.reset > Date.now() && a.n >= 10);
}

export function recordLoginFailure(key: string) {
  const a = attempts.get(key);
  if (!a || a.reset < Date.now()) attempts.set(key, { n: 1, reset: Date.now() + 10 * 60_000 });
  else a.n++;
}
