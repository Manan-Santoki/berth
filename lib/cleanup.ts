import "server-only";
import { audit } from "./audit";
import { db } from "./db";
import { finishJob, startJob } from "./jobs";
import { deleteManifest, listRepositories } from "./registry/client";
import { invalidateSnapshot, summarizeRepository } from "./registry/snapshot";

export type Policy = {
  id: number;
  name: string;
  repo_pattern: string;
  tag_pattern: string;
  protect_pattern: string;
  keep_last: number;
  older_than_days: number | null;
  schedule: "manual" | "daily";
  enabled: number;
  created_at: number;
  last_run_at: number | null;
};

export type PolicyInput = Omit<Policy, "id" | "created_at" | "last_run_at">;

export type PlanItem = {
  repository: string;
  tag: string;
  digest: string;
  created: string | null;
  size: number;
  action: "delete" | "keep" | "skip";
  reason: string;
};

/** `*` matches one path segment, `**` any depth; comma separates alternatives. */
export function globToRegExp(pattern: string): RegExp {
  const alts = pattern
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) =>
      p
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, "\u0000")
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]")
        .replace(/\u0000/g, ".*"),
    );
  return new RegExp(`^(?:${alts.join("|") || ".*"})$`);
}

export function validatePolicy(p: PolicyInput): string | null {
  if (!p.name.trim()) return "Name is required.";
  for (const [label, re] of [
    ["Tag pattern", p.tag_pattern],
    ["Protected tags", p.protect_pattern],
  ] as const) {
    try {
      new RegExp(re);
    } catch {
      return `${label} is not a valid regular expression.`;
    }
  }
  if (!Number.isInteger(p.keep_last) || p.keep_last < 0) return "Keep last must be 0 or more.";
  if (p.older_than_days !== null && (!Number.isInteger(p.older_than_days) || p.older_than_days < 1)) return "Older than must be at least 1 day.";
  if (p.keep_last === 0 && p.older_than_days === null) return "Set 'keep last' above 0 or an age limit, otherwise every matching tag is deleted.";
  return null;
}

export function listPolicies(): Policy[] {
  return db().prepare("SELECT * FROM policies ORDER BY id").all() as Policy[];
}

export function getPolicy(id: number): Policy | null {
  return (db().prepare("SELECT * FROM policies WHERE id = ?").get(id) as Policy | undefined) ?? null;
}

export function savePolicy(input: PolicyInput, id?: number): number {
  if (id) {
    db()
      .prepare(
        `UPDATE policies SET name=?, repo_pattern=?, tag_pattern=?, protect_pattern=?, keep_last=?, older_than_days=?, schedule=?, enabled=? WHERE id=?`,
      )
      .run(input.name, input.repo_pattern, input.tag_pattern, input.protect_pattern, input.keep_last, input.older_than_days, input.schedule, input.enabled, id);
    return id;
  }
  const r = db()
    .prepare(
      `INSERT INTO policies (name, repo_pattern, tag_pattern, protect_pattern, keep_last, older_than_days, schedule, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(input.name, input.repo_pattern, input.tag_pattern, input.protect_pattern, input.keep_last, input.older_than_days, input.schedule, input.enabled, Date.now());
  return Number(r.lastInsertRowid);
}

export function deletePolicy(id: number) {
  db().prepare("DELETE FROM policies WHERE id = ?").run(id);
}

/**
 * Works out what a policy would delete. Deletion in the registry is per digest,
 * so a tag is skipped whenever a tag we keep points at the same digest.
 */
export async function planPolicy(policy: Pick<Policy, "repo_pattern" | "tag_pattern" | "protect_pattern" | "keep_last" | "older_than_days">): Promise<PlanItem[]> {
  const repoRe = globToRegExp(policy.repo_pattern);
  const tagRe = new RegExp(policy.tag_pattern);
  const protectRe = policy.protect_pattern ? new RegExp(policy.protect_pattern) : null;
  const cutoff = policy.older_than_days ? Date.now() - policy.older_than_days * 86_400_000 : null;

  const repos = (await listRepositories()).filter((r) => repoRe.test(r));
  const plan: PlanItem[] = [];

  for (const name of repos) {
    const repo = await summarizeRepository(name);
    const items: PlanItem[] = [];
    let kept = 0;
    for (const t of repo.tags) {
      const base = { repository: name, tag: t.tag, digest: t.digest, created: t.created, size: t.size };
      if (t.error || !t.digest) {
        items.push({ ...base, action: "skip", reason: t.error ?? "Could not resolve digest" });
      } else if (!tagRe.test(t.tag)) {
        items.push({ ...base, action: "keep", reason: "Does not match tag pattern" });
      } else if (protectRe?.test(t.tag)) {
        items.push({ ...base, action: "keep", reason: "Protected tag" });
      } else if (kept < policy.keep_last) {
        kept++;
        items.push({ ...base, action: "keep", reason: `Within newest ${policy.keep_last}` });
      } else if (cutoff !== null && (!t.created || Date.parse(t.created) > cutoff)) {
        items.push({ ...base, action: "keep", reason: t.created ? `Newer than ${policy.older_than_days} days` : "Unknown creation date" });
      } else {
        items.push({ ...base, action: "delete", reason: cutoff !== null ? `Older than ${policy.older_than_days} days` : `Beyond newest ${policy.keep_last}` });
      }
    }
    const keptDigests = new Map(items.filter((i) => i.action !== "delete").map((i) => [i.digest, i.tag]));
    for (const i of items) {
      const sharedWith = keptDigests.get(i.digest);
      if (i.action === "delete" && sharedWith) {
        i.action = "skip";
        i.reason = `Same image as kept tag '${sharedWith}'`;
      }
    }
    plan.push(...items);
  }
  return plan;
}

export async function runPolicy(policy: Policy, actor: string, dryRun: boolean) {
  const jobId = startJob("cleanup", actor, dryRun);
  try {
    const plan = await planPolicy(policy);
    const targets = plan.filter((p) => p.action === "delete");
    const lines: string[] = [];
    const done = new Set<string>();
    let deleted = 0;
    let failed = 0;
    for (const t of targets) {
      const key = `${t.repository}@${t.digest}`;
      if (done.has(key)) {
        lines.push(`removed ${t.repository}:${t.tag} (same digest)`);
        continue;
      }
      done.add(key);
      if (dryRun) {
        lines.push(`would delete ${t.repository}:${t.tag} ${t.digest}`);
        deleted++;
        continue;
      }
      try {
        await deleteManifest(t.repository, t.digest);
        lines.push(`deleted ${t.repository}:${t.tag} ${t.digest}`);
        deleted++;
      } catch (err) {
        failed++;
        lines.push(`FAILED ${t.repository}:${t.tag}: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (!dryRun) {
      invalidateSnapshot();
      db().prepare("UPDATE policies SET last_run_at = ? WHERE id = ?").run(Date.now(), policy.id);
      audit(actor, "policy.run", policy.name, { deleted, failed });
    }
    const summary = `${dryRun ? "Dry run: " : ""}${deleted} manifest(s) ${dryRun ? "would be " : ""}deleted across ${new Set(targets.map((t) => t.repository)).size} repo(s)${failed ? `, ${failed} failed` : ""}`;
    finishJob(jobId, failed ? "failed" : "succeeded", summary, lines.join("\n") || "Nothing to delete.");
    return { jobId, summary };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    finishJob(jobId, "failed", msg);
    throw err;
  }
}
