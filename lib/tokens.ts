import "server-only";
import crypto from "node:crypto";
import { audit } from "./audit";
import type { Role } from "./auth/session";
import { db } from "./db";

export type ApiToken = {
  id: number;
  name: string;
  prefix: string;
  role: Role;
  created_by: string;
  created_at: number;
  last_used_at: number | null;
};

export function listTokens(): ApiToken[] {
  return db().prepare("SELECT id, name, prefix, role, created_by, created_at, last_used_at FROM api_tokens ORDER BY created_at DESC").all() as ApiToken[];
}

/** Returns the plaintext token once; only its SHA-256 is stored. */
export function createToken(actor: string, name: string, role: Role): string {
  if (!name.trim()) throw new Error("Token name is required.");
  const token = `berth_${crypto.randomBytes(24).toString("base64url")}`;
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  db()
    .prepare("INSERT INTO api_tokens (name, token_hash, prefix, role, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(name.trim(), hash, token.slice(0, 12), role, actor, Date.now());
  audit(actor, "token.create", name.trim(), { role });
  return token;
}

export function revokeToken(actor: string, id: number) {
  const row = db().prepare("SELECT name FROM api_tokens WHERE id = ?").get(id) as { name: string } | undefined;
  db().prepare("DELETE FROM api_tokens WHERE id = ?").run(id);
  if (row) audit(actor, "token.revoke", row.name);
}
