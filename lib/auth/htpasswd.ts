import "server-only";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { env } from "../env";

/**
 * Manages the htpasswd file the registry authenticates against. The registry
 * (distribution v3) re-reads this file whenever its mtime changes, so edits
 * take effect on the next push/pull without a restart.
 */

export const USERNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

type Entry = { username: string; hash: string };

function read(): Entry[] {
  if (!env.htpasswdPath || !fs.existsSync(env.htpasswdPath)) return [];
  return fs
    .readFileSync(env.htpasswdPath, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes(":"))
    .map((l) => {
      const i = l.indexOf(":");
      return { username: l.slice(0, i), hash: l.slice(i + 1) };
    });
}

function write(entries: Entry[]) {
  const file = env.htpasswdPath;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const content = entries.map((e) => `${e.username}:${e.hash}`).join("\n") + "\n";
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content, { mode: 0o640 });
  try {
    fs.renameSync(tmp, file);
  } catch {
    // Single-file bind mounts can't be replaced by rename; fall back to an in-place write.
    fs.writeFileSync(file, content, { mode: 0o640 });
    fs.rmSync(tmp, { force: true });
  }
}

export function listHtpasswdUsers(): string[] {
  return read().map((e) => e.username);
}

export function htpasswdHasUser(username: string): boolean {
  return read().some((e) => e.username === username);
}

export async function verifyHtpasswd(username: string, password: string): Promise<boolean> {
  const entry = read().find((e) => e.username === username);
  if (!entry || !entry.hash.startsWith("$2")) return false;
  return bcrypt.compare(password, entry.hash);
}

export async function setHtpasswdUser(username: string, password: string): Promise<void> {
  if (!USERNAME_RE.test(username)) throw new Error("Username may contain letters, digits, '.', '_' and '-' (max 64).");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  const hash = await bcrypt.hash(password, 10);
  const entries = read().filter((e) => e.username !== username);
  entries.push({ username, hash });
  entries.sort((a, b) => a.username.localeCompare(b.username));
  write(entries);
}

export function removeHtpasswdUser(username: string): void {
  write(read().filter((e) => e.username !== username));
}
