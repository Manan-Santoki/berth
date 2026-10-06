import "server-only";
import { db } from "./db";

export type AuditEntry = { id: number; ts: number; actor: string; action: string; target: string | null; detail: string | null };

export function audit(actor: string, action: string, target?: string, detail?: unknown) {
  db()
    .prepare("INSERT INTO audit (ts, actor, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .run(Date.now(), actor, action, target ?? null, detail === undefined ? null : typeof detail === "string" ? detail : JSON.stringify(detail));
}

export function listAudit(limit = 200, offset = 0): AuditEntry[] {
  return db().prepare("SELECT * FROM audit ORDER BY ts DESC LIMIT ? OFFSET ?").all(limit, offset) as AuditEntry[];
}
