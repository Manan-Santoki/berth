export const MEDIA = {
  ociIndex: "application/vnd.oci.image.index.v1+json",
  ociManifest: "application/vnd.oci.image.manifest.v1+json",
  dockerList: "application/vnd.docker.distribution.manifest.list.v2+json",
  dockerManifest: "application/vnd.docker.distribution.manifest.v2+json",
  dockerSchema1: "application/vnd.docker.distribution.manifest.v1+prettyjws",
} as const;

export const MANIFEST_ACCEPT = [
  MEDIA.ociIndex,
  MEDIA.dockerList,
  MEDIA.ociManifest,
  MEDIA.dockerManifest,
  MEDIA.dockerSchema1,
].join(", ");

export type Descriptor = {
  mediaType: string;
  digest: string;
  size: number;
  platform?: { architecture?: string; os?: string; variant?: string; "os.version"?: string };
  annotations?: Record<string, string>;
  artifactType?: string;
};

export type ImageManifest = {
  schemaVersion: number;
  mediaType?: string;
  artifactType?: string;
  config: Descriptor;
  layers: Descriptor[];
  subject?: Descriptor;
  annotations?: Record<string, string>;
};

export type IndexManifest = {
  schemaVersion: number;
  mediaType?: string;
  manifests: Descriptor[];
  annotations?: Record<string, string>;
};

export type AnyManifest = ImageManifest | IndexManifest;

export type ImageConfig = {
  created?: string;
  author?: string;
  architecture?: string;
  os?: string;
  variant?: string;
  config?: {
    User?: string;
    Env?: string[];
    Entrypoint?: string[] | null;
    Cmd?: string[] | null;
    WorkingDir?: string;
    ExposedPorts?: Record<string, object>;
    Volumes?: Record<string, object>;
    Labels?: Record<string, string> | null;
    StopSignal?: string;
    Healthcheck?: { Test?: string[]; Interval?: number; Timeout?: number; Retries?: number };
  };
  rootfs?: { type: string; diff_ids: string[] };
  history?: { created?: string; created_by?: string; comment?: string; empty_layer?: boolean; author?: string }[];
};

export type ManifestKind = "index" | "image" | "schema1" | "unknown";

export function manifestKind(mediaType: string | undefined, body?: Partial<AnyManifest>): ManifestKind {
  if (mediaType === MEDIA.ociIndex || mediaType === MEDIA.dockerList) return "index";
  if (mediaType === MEDIA.ociManifest || mediaType === MEDIA.dockerManifest) return "image";
  if (mediaType?.startsWith("application/vnd.docker.distribution.manifest.v1")) return "schema1";
  if (body && "manifests" in body) return "index";
  if (body && "layers" in body) return "image";
  return "unknown";
}

export function isAttestation(d: Descriptor): boolean {
  return (
    d.annotations?.["vnd.docker.reference.type"] === "attestation-manifest" ||
    (d.platform?.os === "unknown" && d.platform?.architecture === "unknown")
  );
}

export function platformLabel(p?: Descriptor["platform"] | { os?: string; architecture?: string; variant?: string }): string {
  if (!p || (!p.os && !p.architecture)) return "unknown";
  return [p.os, p.architecture, p.variant].filter(Boolean).join("/");
}

/** One tag as shown in lists. Sizes are compressed (on-the-wire / on-disk) bytes. */
export type TagSummary = {
  tag: string;
  digest: string;
  mediaType: string;
  kind: ManifestKind;
  size: number;
  created: string | null;
  platforms: string[];
  /** Every blob this tag keeps alive (configs, layers, child manifests). */
  blobs: { digest: string; size: number }[];
  error?: string;
};

export type RepoSummary = {
  name: string;
  tags: TagSummary[];
  /** Deduplicated bytes referenced by this repository. */
  size: number;
  lastUpdated: string | null;
  error?: string;
};

export type RegistrySnapshot = {
  generatedAt: number;
  durationMs: number;
  repos: RepoSummary[];
  totals: { repos: number; tags: number; manifests: number; size: number };
  errors: string[];
};

export type PlatformDetail = {
  digest: string;
  mediaType: string;
  platform: string;
  attestation: boolean;
  manifest: ImageManifest | null;
  config: ImageConfig | null;
  size: number;
  annotations?: Record<string, string>;
};

export type ImageDetail = {
  repository: string;
  reference: string;
  digest: string;
  mediaType: string;
  kind: ManifestKind;
  raw: string;
  manifest: AnyManifest;
  platforms: PlatformDetail[];
  size: number;
  created: string | null;
  /** Other tags in the repository pointing at the same digest. */
  aliases: string[];
};
