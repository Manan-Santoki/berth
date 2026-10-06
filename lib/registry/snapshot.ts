import "server-only";
import { env } from "../env";
import { getImageConfig, getManifest, headManifest, listRepositories, listTags, mapLimit } from "./client";
import {
  isAttestation,
  manifestKind,
  platformLabel,
  type ImageDetail,
  type ImageManifest,
  type IndexManifest,
  type PlatformDetail,
  type RegistrySnapshot,
  type RepoSummary,
  type TagSummary,
} from "./types";

type Blob = { digest: string; size: number };

function uniqueSize(blobs: Blob[]): number {
  const seen = new Map<string, number>();
  for (const b of blobs) seen.set(b.digest, b.size);
  let total = 0;
  for (const s of seen.values()) total += s;
  return total;
}

function imageBlobs(m: ImageManifest): Blob[] {
  return [m.config, ...(m.layers ?? [])].filter(Boolean).map((d) => ({ digest: d.digest, size: d.size }));
}

async function summarizeTag(repo: string, tag: string): Promise<TagSummary> {
  try {
    const head = await headManifest(repo, tag);
    const { body, mediaType } = await getManifest(repo, head.digest);
    const kind = manifestKind(mediaType || head.mediaType, body);
    const blobs: Blob[] = [{ digest: head.digest, size: head.size }];
    let created: string | null = null;
    const platforms: string[] = [];

    if (kind === "index") {
      const index = body as IndexManifest;
      for (const child of index.manifests ?? []) {
        blobs.push({ digest: child.digest, size: child.size });
        let childManifest: ImageManifest | null = null;
        try {
          childManifest = (await getManifest(repo, child.digest)).body as ImageManifest;
        } catch {
          continue; // child not stored locally (e.g. partial multi-arch copy)
        }
        if (childManifest.layers) blobs.push(...imageBlobs(childManifest));
        if (isAttestation(child)) continue;
        platforms.push(platformLabel(child.platform));
        if (!created && childManifest.config?.digest) {
          created = (await getImageConfig(repo, childManifest.config.digest).catch(() => null))?.created ?? null;
        }
      }
    } else if (kind === "image") {
      const image = body as ImageManifest;
      blobs.push(...imageBlobs(image));
      const config = image.config?.digest ? await getImageConfig(repo, image.config.digest).catch(() => null) : null;
      created = config?.created ?? null;
      platforms.push(config ? platformLabel(config) : "unknown");
    }

    return { tag, digest: head.digest, mediaType: mediaType || head.mediaType, kind, size: uniqueSize(blobs.slice(1)), created, platforms, blobs };
  } catch (err) {
    return {
      tag,
      digest: "",
      mediaType: "",
      kind: "unknown",
      size: 0,
      created: null,
      platforms: [],
      blobs: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function newestFirst(a: TagSummary, b: TagSummary): number {
  const ta = a.created ? Date.parse(a.created) : 0;
  const tb = b.created ? Date.parse(b.created) : 0;
  return tb - ta || a.tag.localeCompare(b.tag);
}

export async function summarizeRepository(name: string): Promise<RepoSummary> {
  try {
    const tags = await listTags(name);
    const summaries = await mapLimit(tags, env.fetchConcurrency, (t) => summarizeTag(name, t));
    summaries.sort(newestFirst);
    const lastUpdated = summaries.find((t) => t.created)?.created ?? null;
    return { name, tags: summaries, size: uniqueSize(summaries.flatMap((t) => t.blobs)), lastUpdated };
  } catch (err) {
    return { name, tags: [], size: 0, lastUpdated: null, error: err instanceof Error ? err.message : String(err) };
  }
}

const g = globalThis as unknown as {
  __berthSnapshot?: RegistrySnapshot;
  __berthSnapshotInflight?: Promise<RegistrySnapshot>;
};

async function buildSnapshot(): Promise<RegistrySnapshot> {
  const started = Date.now();
  const names = await listRepositories();
  // Repos are scanned with limited parallelism; tags inside each repo use their own limit.
  const repos = await mapLimit(names, Math.max(1, Math.ceil(env.fetchConcurrency / 2)), summarizeRepository);
  const allTags = repos.flatMap((r) => r.tags);
  const errors = [
    ...repos.filter((r) => r.error).map((r) => `${r.name}: ${r.error}`),
    ...repos.flatMap((r) => r.tags.filter((t) => t.error).map((t) => `${r.name}:${t.tag}: ${t.error}`)),
  ];
  return {
    generatedAt: Date.now(),
    durationMs: Date.now() - started,
    repos,
    totals: {
      repos: repos.length,
      tags: allTags.length,
      manifests: new Set(allTags.map((t) => t.digest).filter(Boolean)).size,
      size: uniqueSize(allTags.flatMap((t) => t.blobs)),
    },
    errors,
  };
}

/** Full registry scan, cached in memory for SNAPSHOT_TTL_SECONDS and de-duplicated across concurrent callers. */
export async function getSnapshot(options: { fresh?: boolean } = {}): Promise<RegistrySnapshot> {
  const cached = g.__berthSnapshot;
  if (!options.fresh && cached && Date.now() - cached.generatedAt < env.snapshotTtl * 1000) return cached;
  if (!g.__berthSnapshotInflight) {
    g.__berthSnapshotInflight = buildSnapshot()
      .then((s) => {
        g.__berthSnapshot = s;
        return s;
      })
      .finally(() => {
        g.__berthSnapshotInflight = undefined;
      });
  }
  return g.__berthSnapshotInflight;
}

export function invalidateSnapshot() {
  g.__berthSnapshot = undefined;
}

export async function getRepository(name: string): Promise<RepoSummary | null> {
  const cached = g.__berthSnapshot;
  if (cached && Date.now() - cached.generatedAt < env.snapshotTtl * 1000) {
    return cached.repos.find((r) => r.name === name) ?? null;
  }
  const repo = await summarizeRepository(name);
  return repo;
}

export async function getImageDetail(repository: string, reference: string): Promise<ImageDetail> {
  const { digest, mediaType, raw, body } = await getManifest(repository, reference);
  const kind = manifestKind(mediaType, body);
  const platforms: PlatformDetail[] = [];

  const loadImage = async (d: { digest: string; mediaType: string; platform?: string; attestation: boolean; annotations?: Record<string, string> }, manifest?: ImageManifest) => {
    const m = manifest ?? ((await getManifest(repository, d.digest).catch(() => null))?.body as ImageManifest | undefined) ?? null;
    const config = m?.config?.digest && !d.attestation ? await getImageConfig(repository, m.config.digest).catch(() => null) : null;
    platforms.push({
      digest: d.digest,
      mediaType: d.mediaType,
      platform: d.platform ?? (config ? platformLabel(config) : "unknown"),
      attestation: d.attestation,
      manifest: m,
      config,
      size: m ? uniqueSize(imageBlobs(m)) : 0,
      annotations: d.annotations,
    });
  };

  if (kind === "index") {
    for (const child of (body as IndexManifest).manifests ?? []) {
      await loadImage({
        digest: child.digest,
        mediaType: child.mediaType,
        platform: isAttestation(child) ? "attestation" : platformLabel(child.platform),
        attestation: isAttestation(child),
        annotations: child.annotations,
      });
    }
  } else if (kind === "image") {
    await loadImage({ digest, mediaType, attestation: false }, body as ImageManifest);
  }

  const allBlobs = platforms.flatMap((p) => (p.manifest ? imageBlobs(p.manifest) : []));
  const repo = await getRepository(repository);
  const aliases = repo?.tags.filter((t) => t.digest === digest && t.tag !== reference).map((t) => t.tag) ?? [];

  return {
    repository,
    reference,
    digest,
    mediaType,
    kind,
    raw,
    manifest: body,
    platforms,
    size: uniqueSize(allBlobs),
    created: platforms.find((p) => p.config?.created)?.config?.created ?? null,
    aliases,
  };
}
