import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { env } from "./env";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id            TEXT PRIMARY KEY,
  ts            INTEGER NOT NULL,
  action        TEXT NOT NULL,
  repository    TEXT,
  tag           TEXT,
  digest        TEXT,
  media_type    TEXT,
  size          INTEGER,
  actor         TEXT,
  source_addr   TEXT,
  user_agent    TEXT,
  method        TEXT
);
CREATE INDEX IF NOT EXISTS events_ts ON events (ts DESC);
CREATE INDEX IF NOT EXISTS events_repo ON events (repository, ts DESC);

CREATE TABLE IF NOT EXISTS audit (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      INTEGER NOT NULL,
  actor   TEXT NOT NULL,
  action  TEXT NOT NULL,
  target  TEXT,
  detail  TEXT
);
CREATE INDEX IF NOT EXISTS audit_ts ON audit (ts DESC);

CREATE TABLE IF NOT EXISTS users (
  username    TEXT PRIMARY KEY,
  role        TEXT NOT NULL DEFAULT 'viewer',
  created_at  INTEGER NOT NULL,
  last_login  INTEGER
);

CREATE TABLE IF NOT EXISTS blob_cache (
  key         TEXT PRIMARY KEY,
  body        TEXT NOT NULL,
  fetched_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS policies (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  repo_pattern     TEXT NOT NULL DEFAULT '*',
  tag_pattern      TEXT NOT NULL DEFAULT '.*',
  protect_pattern  TEXT NOT NULL DEFAULT '^(latest|main|master|stable)$',
  keep_last        INTEGER NOT NULL DEFAULT 10,
  older_than_days  INTEGER,
  schedule         TEXT NOT NULL DEFAULT 'manual',
  enabled          INTEGER NOT NULL DEFAULT 1,
  created_at       INTEGER NOT NULL,
  last_run_at      INTEGER
);

CREATE TABLE IF NOT EXISTS jobs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT NOT NULL,
  status       TEXT NOT NULL,
  dry_run      INTEGER NOT NULL DEFAULT 0,
  actor        TEXT NOT NULL,
  started_at   INTEGER NOT NULL,
  finished_at  INTEGER,
  summary      TEXT,
  output       TEXT
);
CREATE INDEX IF NOT EXISTS jobs_started ON jobs (started_at DESC);

CREATE TABLE IF NOT EXISTS api_tokens (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  prefix       TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'viewer',
  created_by   TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER
);

CREATE TABLE IF NOT EXISTS kv (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
`;

const globalForDb = globalThis as unknown as { __berthDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (!globalForDb.__berthDb) {
    fs.mkdirSync(env.dataDir, { recursive: true });
    const conn = new DatabaseSync(path.join(env.dataDir, "berth.db"));
    conn.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
    conn.exec(SCHEMA);
    globalForDb.__berthDb = conn;
  }
  return globalForDb.__berthDb;
}

export function kvGet<T>(key: string): T | null {
  const row = db().prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as T) : null;
}

export function kvSet(key: string, value: unknown): void {
  db()
    .prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, JSON.stringify(value));
}
