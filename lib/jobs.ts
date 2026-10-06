import "server-only";
import { db } from "./db";

export type JobType = "gc" | "cleanup" | "delete";
export type JobStatus = "running" | "succeeded" | "failed";
export type Job = {
  id: number;
  type: JobType;
  status: JobStatus;
  dry_run: number;
  actor: string;
  started_at: number;
  finished_at: number | null;
  summary: string | null;
  output: string | null;
};

export function startJob(type: JobType, actor: string, dryRun: boolean): number {
  const r = db()
    .prepare("INSERT INTO jobs (type, status, dry_run, actor, started_at) VALUES (?, 'running', ?, ?, ?)")
    .run(type, dryRun ? 1 : 0, actor, Date.now());
  return Number(r.lastInsertRowid);
}

export function finishJob(id: number, status: Exclude<JobStatus, "running">, summary: string, output?: string) {
  db()
    .prepare("UPDATE jobs SET status = ?, finished_at = ?, summary = ?, output = ? WHERE id = ?")
    .run(status, Date.now(), summary, output ?? null, id);
}

export function listJobs(type?: JobType, limit = 50): Job[] {
  return (type
    ? db().prepare("SELECT * FROM jobs WHERE type = ? ORDER BY started_at DESC LIMIT ?").all(type, limit)
    : db().prepare("SELECT * FROM jobs ORDER BY started_at DESC LIMIT ?").all(limit)) as Job[];
}

export function getJob(id: number): Job | null {
  return (db().prepare("SELECT * FROM jobs WHERE id = ?").get(id) as Job | undefined) ?? null;
}

/** Jobs left "running" by a crash or restart are marked failed at boot. */
export function failOrphanedJobs() {
  db()
    .prepare("UPDATE jobs SET status = 'failed', finished_at = ?, summary = 'Interrupted by a restart' WHERE status = 'running'")
    .run(Date.now());
}
