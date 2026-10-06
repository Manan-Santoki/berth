import "server-only";
import path from "node:path";

function str(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function int(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * All runtime configuration lives here. Every path-based feature (htpasswd user
 * management, garbage collection, disk usage) switches itself off when its path
 * is unset, so Berth also works as a plain UI in front of any existing registry.
 */
export const env = {
  /** Registry base URL as seen from the Berth server (no trailing slash). */
  registryUrl: str("REGISTRY_URL", "http://localhost:5000").replace(/\/+$/, ""),
  /** Host users push/pull with, shown in copy-paste commands. */
  registryPublicHost: str("REGISTRY_PUBLIC_HOST", "localhost:5000"),
  /** Prometheus endpoint of the registry debug server (optional). */
  registryMetricsUrl: str("REGISTRY_METRICS_URL"),

  /** Bootstrap admin. Also the service account Berth uses to talk to the registry. */
  adminUsername: str("ADMIN_USERNAME", "admin"),
  adminPassword: str("ADMIN_PASSWORD"),

  /** htpasswd file shared with the registry. Enables user management when set. */
  htpasswdPath: str("HTPASSWD_PATH"),
  /** Registry storage root on a shared volume. Enables disk usage + GC when set. */
  registryStoragePath: str("REGISTRY_STORAGE_PATH"),
  /** Registry config file + binary, used to run `registry garbage-collect`. */
  registryConfigPath: str("REGISTRY_CONFIG_PATH"),
  registryBin: str("REGISTRY_BIN", "/usr/local/bin/registry"),

  dataDir: path.resolve(str("DATA_DIR", "./data")),
  sessionSecret: str("SESSION_SECRET"),
  /** Shared secret the registry sends with notification webhooks. */
  webhookToken: str("WEBHOOK_TOKEN"),

  /** Concurrent registry requests when building snapshots. */
  fetchConcurrency: int("REGISTRY_FETCH_CONCURRENCY", 8),
  /** Seconds a registry snapshot is reused before re-scanning. */
  snapshotTtl: int("SNAPSHOT_TTL_SECONDS", 30),
};

export const features = {
  get userManagement() {
    return env.htpasswdPath !== "";
  },
  get garbageCollection() {
    return env.registryStoragePath !== "" && env.registryConfigPath !== "";
  },
  get diskUsage() {
    return env.registryStoragePath !== "";
  },
  get metrics() {
    return env.registryMetricsUrl !== "";
  },
  get webhooks() {
    return env.webhookToken !== "";
  },
};
