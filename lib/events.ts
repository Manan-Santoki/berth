import "server-only";
import { db } from "./db";
import { BERTH_USER_AGENT } from "./registry/client";

/** Shape of a distribution notification event (subset we store). */
export type RegistryNotification = {
  id: string;
  timestamp: string;
  action: string;
  target?: {
    mediaType?: string;
    size?: number;
    digest?: string;
    length?: number;
    repository?: string;
    url?: string;
    tag?: string;
  };
  request?: { id?: string; addr?: string; host?: string; method?: string; useragent?: string };
  actor?: { name?: string };
  source?: { addr?: string; instanceID?: string };
};

export type StoredEvent = {
  id: string;
  ts: number;
  action: string;
  repository: string | null;
  tag: string | null;
  digest: string | null;
  media_type: string | null;
  size: number | null;
  actor: string | null;
  source_addr: string | null;
  user_agent: string | null;
  method: string | null;
};

const BLOB_MEDIA = /octet-stream|layer|rootfs|image\.config|container\.image/;

/**
 * Stores registry events. Blob-level pulls/pushes are dropped: one `docker pull`
 * produces an event per layer, which would drown out the manifest events that
 * actually describe what happened.
 */
export function ingestEvents(events: RegistryNotification[]): number {
  const insert = db().prepare(`
    INSERT INTO events (id, ts, action, repository, tag, digest, media_type, size, actor, source_addr, user_agent, method)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING`);
  let stored = 0;
  for (const e of events) {
    const media = e.target?.mediaType ?? "";
    const isBlob = BLOB_MEDIA.test(media) && !media.includes("manifest") && !media.includes("index");
    if (isBlob && e.action !== "delete") continue;
    // Berth reads manifests to build its views; those reads aren't real pulls.
    if (e.action === "pull" && e.request?.useragent === BERTH_USER_AGENT) continue;
    const ts = Date.parse(e.timestamp);
    const r = insert.run(
      e.id,
      Number.isFinite(ts) ? ts : Date.now(),
      e.action,
      e.target?.repository ?? null,
      e.target?.tag ?? null,
      e.target?.digest ?? null,
      media || null,
      e.target?.size ?? e.target?.length ?? null,
      e.actor?.name ?? null,
      e.request?.addr ?? null,
      e.request?.useragent ?? null,
      e.request?.method ?? null,
    );
    stored += Number(r.changes);
  }
  return stored;
}

export type EventFilter = { repository?: string; action?: string; tag?: string; limit?: number; offset?: number };

export function listEvents(f: EventFilter = {}): { rows: StoredEvent[]; total: number } {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (f.repository) {
    where.push("repository = ?");
    args.push(f.repository);
  }
  if (f.action) {
    where.push("action = ?");
    args.push(f.action);
  }
  if (f.tag) {
    where.push("tag = ?");
    args.push(f.tag);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = (db().prepare(`SELECT COUNT(*) AS n FROM events ${clause}`).get(...args) as { n: number }).n;
  const rows = db()
    .prepare(`SELECT * FROM events ${clause} ORDER BY ts DESC LIMIT ? OFFSET ?`)
    .all(...args, f.limit ?? 50, f.offset ?? 0) as StoredEvent[];
  return { rows, total };
}

export type DailyActivity = { day: string; push: number; pull: number; delete: number };

export function dailyActivity(days = 30): DailyActivity[] {
  const since = Date.now() - days * 86_400_000;
  const rows = db()
    .prepare(
      `SELECT strftime('%Y-%m-%d', ts / 1000, 'unixepoch') AS day, action, COUNT(*) AS n
       FROM events WHERE ts >= ? GROUP BY day, action`,
    )
    .all(since) as { day: string; action: string; n: number }[];
  const byDay = new Map<string, DailyActivity>();
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    byDay.set(day, { day, push: 0, pull: 0, delete: 0 });
  }
  for (const r of rows) {
    const d = byDay.get(r.day);
    if (d && (r.action === "push" || r.action === "pull" || r.action === "delete")) d[r.action] += r.n;
  }
  return [...byDay.values()];
}

/** Last push/pull per repository, used to enrich repository lists. */
export function repoActivity(): Map<string, { lastPush: number | null; lastPull: number | null; pulls30d: number }> {
  const since = Date.now() - 30 * 86_400_000;
  const rows = db()
    .prepare(
      `SELECT repository,
              MAX(CASE WHEN action = 'push' THEN ts END) AS last_push,
              MAX(CASE WHEN action = 'pull' THEN ts END) AS last_pull,
              SUM(CASE WHEN action = 'pull' AND ts >= ? THEN 1 ELSE 0 END) AS pulls
       FROM events WHERE repository IS NOT NULL GROUP BY repository`,
    )
    .all(since) as { repository: string; last_push: number | null; last_pull: number | null; pulls: number }[];
  return new Map(rows.map((r) => [r.repository, { lastPush: r.last_push, lastPull: r.last_pull, pulls30d: r.pulls }]));
}

/** Every digest a tag has pointed to, newest first, from push events. */
export function tagTimeline(repository: string, tag: string): StoredEvent[] {
  return db()
    .prepare(`SELECT * FROM events WHERE repository = ? AND tag = ? AND action = 'push' ORDER BY ts DESC LIMIT 100`)
    .all(repository, tag) as StoredEvent[];
}

export function pruneEvents(olderThanDays: number): number {
  const r = db().prepare("DELETE FROM events WHERE ts < ?").run(Date.now() - olderThanDays * 86_400_000);
  return Number(r.changes);
}
