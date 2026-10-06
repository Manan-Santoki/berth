import "server-only";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { audit } from "./audit";
import { kvGet, kvSet } from "./db";
import { env, features } from "./env";
import { finishJob, startJob } from "./jobs";
import { invalidateSnapshot } from "./registry/snapshot";

const g = globalThis as unknown as { __berthGcRunning?: boolean };

export function gcRunning(): boolean {
  return Boolean(g.__berthGcRunning);
}

/**
 * Runs `registry garbage-collect` against the shared storage volume. Deleting a
 * manifest only removes the reference; this is what actually frees disk space.
 */
export async function runGarbageCollect(actor: string, opts: { dryRun: boolean; deleteUntagged: boolean }) {
  if (!features.garbageCollection) throw new Error("Garbage collection needs REGISTRY_STORAGE_PATH and REGISTRY_CONFIG_PATH.");
  if (!fs.existsSync(env.registryBin)) throw new Error(`Registry binary not found at ${env.registryBin}.`);
  if (g.__berthGcRunning) throw new Error("A garbage collection is already running.");
  g.__berthGcRunning = true;

  const before = opts.dryRun ? null : await diskUsage({ fresh: true }).catch(() => null);
  const jobId = startJob("gc", actor, opts.dryRun);
  const args = ["garbage-collect", env.registryConfigPath];
  if (opts.dryRun) args.push("--dry-run");
  if (opts.deleteUntagged) args.push("--delete-untagged");

  const output: string[] = [];
  const done = new Promise<void>((resolve) => {
    const child = spawn(env.registryBin, args, {
      env: { ...process.env, REGISTRY_STORAGE_FILESYSTEM_ROOTDIRECTORY: env.registryStoragePath, OTEL_TRACES_EXPORTER: "none" },
    });
    const collect = (buf: Buffer) => {
      for (const line of buf.toString().split(/\r?\n/)) if (line.trim()) output.push(line);
      if (output.length > 20_000) output.splice(0, output.length - 20_000);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (err) => {
      output.push(`spawn error: ${err.message}`);
    });
    child.on("close", async (code) => {
      try {
        const summaryLine = [...output].reverse().find((l) => /blobs marked|eligible for deletion/.test(l)) ?? "";
        let summary = summaryLine.replace(/^.*?(\d+ blobs marked)/, "$1").trim() || `exit code ${code}`;
        if (!opts.dryRun && before) {
          const after = await diskUsage({ fresh: true }).catch(() => null);
          if (after) summary += ` · freed ${formatBytes(Math.max(0, before.bytes - after.bytes))}`;
          invalidateSnapshot();
        }
        finishJob(jobId, code === 0 ? "succeeded" : "failed", (opts.dryRun ? "Dry run: " : "") + summary, output.join("\n"));
        if (!opts.dryRun) audit(actor, "gc.run", undefined, { deleteUntagged: opts.deleteUntagged, exitCode: code });
      } finally {
        g.__berthGcRunning = false;
        resolve();
      }
    });
  });
  // Runs in the background; the UI polls the job.
  void done;
  return jobId;
}

function formatBytes(n: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export type DiskUsage = { bytes: number; blobs: number; blobBytes: number; repositories: number; measuredAt: number };

async function walk(dir: string, onFile: (p: string, size: number) => void): Promise<void> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, onFile);
    else if (e.isFile()) {
      const st = await fs.promises.stat(p).catch(() => null);
      if (st) onFile(p, st.size);
    }
  }
}

const v2Root = () => path.join(env.registryStoragePath, "docker", "registry", "v2");

/** Measures the registry volume. Cached for 10 minutes since large stores take a while to walk. */
export async function diskUsage(opts: { fresh?: boolean } = {}): Promise<DiskUsage | null> {
  if (!features.diskUsage) return null;
  const cached = kvGet<DiskUsage>("disk_usage");
  if (!opts.fresh && cached && Date.now() - cached.measuredAt < 10 * 60_000) return cached;

  let bytes = 0;
  let blobs = 0;
  let blobBytes = 0;
  const blobsDir = path.join(v2Root(), "blobs");
  await walk(env.registryStoragePath, (p, size) => {
    bytes += size;
    if (p.startsWith(blobsDir) && path.basename(p) === "data") {
      blobs++;
      blobBytes += size;
    }
  });
  const repositories = (await listStorageRepositories()).length;
  const usage: DiskUsage = { bytes, blobs, blobBytes, repositories, measuredAt: Date.now() };
  kvSet("disk_usage", usage);
  return usage;
}

/** Repository directories on disk (a repo is any dir holding `_manifests`, `_layers` or `_uploads`). */
async function listStorageRepositories(): Promise<{ name: string; dir: string }[]> {
  const root = path.join(v2Root(), "repositories");
  const out: { name: string; dir: string }[] = [];
  const visit = async (dir: string, prefix: string) => {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const names = entries.map((e) => e.name);
    if (names.some((n) => n === "_manifests" || n === "_layers" || n === "_uploads")) {
      out.push({ name: prefix, dir });
    }
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith("_")) await visit(path.join(dir, e.name), prefix ? `${prefix}/${e.name}` : e.name);
    }
  };
  await visit(root, "");
  return out;
}

/** Repositories that still appear in the catalog but have no tags left. */
export async function findEmptyRepositories(): Promise<string[]> {
  if (!features.diskUsage) return [];
  const repos = await listStorageRepositories();
  const empty: string[] = [];
  for (const r of repos) {
    const tagsDir = path.join(r.dir, "_manifests", "tags");
    const tags = await fs.promises.readdir(tagsDir).catch(() => [] as string[]);
    if (tags.length === 0) empty.push(r.name);
  }
  return empty;
}

/**
 * Removes the repository directories of tagless repositories so they disappear
 * from the catalog. Blob data is shared and stays until the next GC.
 */
export async function pruneEmptyRepositories(actor: string, names: string[]): Promise<string[]> {
  const empty = new Set(await findEmptyRepositories());
  const repos = await listStorageRepositories();
  const removed: string[] = [];
  for (const name of names) {
    if (!empty.has(name)) continue;
    const r = repos.find((x) => x.name === name);
    if (!r) continue;
    // Only remove the repository's own metadata dirs; nested repositories (a/b under a) stay.
    for (const sub of ["_manifests", "_layers", "_uploads"]) {
      await fs.promises.rm(path.join(r.dir, sub), { recursive: true, force: true });
    }
    const left = await fs.promises.readdir(r.dir).catch(() => ["?"]);
    if (left.length === 0) await fs.promises.rmdir(r.dir).catch(() => undefined);
    removed.push(name);
  }
  if (removed.length) {
    invalidateSnapshot();
    audit(actor, "repository.prune", removed.join(", "));
  }
  return removed;
}

export type MetricsSummary = { requests: { handler: string; code: string; method: string; count: number }[]; raw: string };

/** Pulls a few counters from the registry's Prometheus endpoint. */
export async function registryMetrics(): Promise<MetricsSummary | null> {
  if (!features.metrics) return null;
  const res = await fetch(env.registryMetricsUrl, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`Metrics endpoint returned ${res.status}`);
  const raw = await res.text();
  const requests: MetricsSummary["requests"] = [];
  for (const line of raw.split("\n")) {
    const m = line.match(/^registry_http_requests_total\{([^}]*)\}\s+([0-9.e+]+)/);
    if (!m) continue;
    const labels = Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map((x) => [x[1], x[2]]));
    requests.push({ handler: labels.handler ?? "", code: labels.code ?? "", method: labels.method ?? "", count: Number(m[2]) });
  }
  return { requests, raw };
}
