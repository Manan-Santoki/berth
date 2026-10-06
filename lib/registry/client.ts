import "server-only";
import { db } from "../db";
import { env } from "../env";
import { MANIFEST_ACCEPT, type AnyManifest, type ImageConfig } from "./types";

export class RegistryError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "RegistryError";
  }
}

/** Lets the webhook receiver drop events caused by Berth's own scans. */
export const BERTH_USER_AGENT = "Berth (registry dashboard)";

function authHeader(): Record<string, string> {
  if (!env.adminPassword) return { "User-Agent": BERTH_USER_AGENT };
  const token = Buffer.from(`${env.adminUsername}:${env.adminPassword}`).toString("base64");
  return { Authorization: `Basic ${token}`, "User-Agent": BERTH_USER_AGENT };
}

async function request(path: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<Response> {
  const url = path.startsWith("http") ? path : `${env.registryUrl}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: { ...authHeader(), ...(init.headers as Record<string, string> | undefined) },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new RegistryError(`Registry unreachable at ${env.registryUrl}: ${reason}`, 0);
  }
  if (!res.ok) {
    let code: string | undefined;
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { errors?: { code: string; message: string }[] };
      if (body.errors?.[0]) {
        code = body.errors[0].code;
        message = `${body.errors[0].code}: ${body.errors[0].message}`;
      }
    } catch {
      // HEAD requests and some proxies return no JSON body
    }
    throw new RegistryError(message, res.status, code);
  }
  return res;
}

/** Follows the registry's RFC 5988 `Link: <...>; rel="next"` pagination. */
async function paginate<T>(first: string, pick: (body: unknown) => T[]): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = first;
  for (let page = 0; next && page < 1000; page++) {
    const res = await request(next);
    out.push(...pick(await res.json()));
    const link = res.headers.get("link");
    const match = link?.match(/<([^>]+)>;\s*rel="?next"?/);
    next = match ? match[1] : null;
  }
  return out;
}

const encodeRepo = (repo: string) => repo.split("/").map(encodeURIComponent).join("/");

export type PingResult = {
  ok: boolean;
  status: number;
  apiVersion: string | null;
  latencyMs: number;
  error?: string;
};

export async function ping(): Promise<PingResult> {
  const started = performance.now();
  try {
    const res = await request("/v2/", {}, 5_000);
    return {
      ok: true,
      status: res.status,
      apiVersion: res.headers.get("docker-distribution-api-version"),
      latencyMs: Math.round(performance.now() - started),
    };
  } catch (err) {
    const e = err as RegistryError;
    return { ok: false, status: e.status ?? 0, apiVersion: null, latencyMs: Math.round(performance.now() - started), error: e.message };
  }
}

/** Checks credentials directly against the registry (used for login without htpasswd access). */
export async function checkCredentials(username: string, password: string): Promise<"valid" | "invalid" | "open"> {
  const basic = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  const anon = await fetch(`${env.registryUrl}/v2/`, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
  if (anon.ok) return "open";
  const res = await fetch(`${env.registryUrl}/v2/`, {
    cache: "no-store",
    headers: { Authorization: basic },
    signal: AbortSignal.timeout(5_000),
  });
  return res.ok ? "valid" : "invalid";
}

export async function listRepositories(): Promise<string[]> {
  const repos = await paginate("/v2/_catalog?n=1000", (b) => (b as { repositories?: string[] }).repositories ?? []);
  return [...new Set(repos)].sort((a, b) => a.localeCompare(b));
}

export async function listTags(repo: string): Promise<string[]> {
  try {
    const tags = await paginate(`/v2/${encodeRepo(repo)}/tags/list?n=1000`, (b) => (b as { tags?: string[] | null }).tags ?? []);
    return tags;
  } catch (err) {
    // A repository whose tags were all deleted still shows up in the catalog.
    if (err instanceof RegistryError && err.code === "NAME_UNKNOWN") return [];
    throw err;
  }
}

export type ManifestHead = { digest: string; mediaType: string; size: number };

export async function headManifest(repo: string, reference: string): Promise<ManifestHead> {
  const res = await request(`/v2/${encodeRepo(repo)}/manifests/${encodeURIComponent(reference)}`, {
    method: "HEAD",
    headers: { Accept: MANIFEST_ACCEPT },
  });
  const digest = res.headers.get("docker-content-digest");
  if (!digest) throw new RegistryError(`Registry returned no digest for ${repo}:${reference}`, res.status);
  return {
    digest,
    mediaType: (res.headers.get("content-type") ?? "").split(";")[0],
    size: Number(res.headers.get("content-length") ?? 0),
  };
}

type CachedManifest = { digest: string; mediaType: string; raw: string };

function cacheGet(key: string): string | null {
  const row = db().prepare("SELECT body FROM blob_cache WHERE key = ?").get(key) as { body: string } | undefined;
  return row?.body ?? null;
}

function cachePut(key: string, body: string) {
  db()
    .prepare("INSERT INTO blob_cache (key, body, fetched_at) VALUES (?, ?, ?) ON CONFLICT(key) DO NOTHING")
    .run(key, body, Date.now());
}

/**
 * Fetches a manifest. Lookups by digest are content-addressed and therefore
 * cached forever in SQLite; lookups by tag always hit the registry.
 */
export async function getManifest(
  repo: string,
  reference: string,
): Promise<{ digest: string; mediaType: string; raw: string; body: AnyManifest }> {
  const byDigest = reference.startsWith("sha256:") || reference.startsWith("sha512:");
  if (byDigest) {
    const hit = cacheGet(`m:${reference}`);
    if (hit) {
      const cached = JSON.parse(hit) as CachedManifest;
      return { ...cached, body: JSON.parse(cached.raw) as AnyManifest };
    }
  }
  const res = await request(`/v2/${encodeRepo(repo)}/manifests/${encodeURIComponent(reference)}`, {
    headers: { Accept: MANIFEST_ACCEPT },
  });
  const raw = await res.text();
  const body = JSON.parse(raw) as AnyManifest;
  const digest = res.headers.get("docker-content-digest") ?? (byDigest ? reference : "");
  const mediaType = (res.headers.get("content-type") ?? body.mediaType ?? "").split(";")[0];
  if (digest) cachePut(`m:${digest}`, JSON.stringify({ digest, mediaType, raw } satisfies CachedManifest));
  return { digest, mediaType, raw, body };
}

export async function getImageConfig(repo: string, digest: string): Promise<ImageConfig> {
  const hit = cacheGet(`c:${digest}`);
  if (hit) return JSON.parse(hit) as ImageConfig;
  const res = await request(`/v2/${encodeRepo(repo)}/blobs/${digest}`);
  const text = await res.text();
  cachePut(`c:${digest}`, text);
  return JSON.parse(text) as ImageConfig;
}

/**
 * Deletes a manifest by digest. The registry has no "untag" operation: every
 * tag pointing at this digest disappears with it.
 */
export async function deleteManifest(repo: string, digest: string): Promise<void> {
  if (!digest.startsWith("sha256:") && !digest.startsWith("sha512:")) {
    throw new RegistryError("Manifests can only be deleted by digest", 400);
  }
  try {
    await request(`/v2/${encodeRepo(repo)}/manifests/${digest}`, { method: "DELETE" });
  } catch (err) {
    if (err instanceof RegistryError && err.status === 405) {
      throw new RegistryError(
        "Deletes are disabled on this registry. Set storage.delete.enabled: true (REGISTRY_STORAGE_DELETE_ENABLED=true) and restart it.",
        405,
        "UNSUPPORTED",
      );
    }
    throw err;
  }
}

/** Runs async work over a list with bounded concurrency, preserving order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
