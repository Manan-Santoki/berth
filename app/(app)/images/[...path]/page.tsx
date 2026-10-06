import Link from "next/link";
import { notFound } from "next/navigation";
import { CommandLine, CopyButton, TimeAgo } from "@/components/client-bits";
import { KeyValue, Mono, PageHeader, Section, StatCard } from "@/components/shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { tagTimeline } from "@/lib/events";
import { formatBytes, formatDate, repoHref, shortDigest, tagHref } from "@/lib/format";
import { RegistryError } from "@/lib/registry/client";
import { getImageDetail } from "@/lib/registry/snapshot";
import type { ImageDetail, PlatformDetail } from "@/lib/registry/types";
import { DeleteImageButton } from "./delete-image-button";

function splitPath(path: string[]) {
  const parts = path.map(decodeURIComponent);
  return { repository: parts.slice(0, -1).join("/"), reference: parts[parts.length - 1] };
}

export async function generateMetadata({ params }: PageProps<"/images/[...path]">) {
  const { repository, reference } = splitPath((await params).path);
  return { title: `${repository}:${reference}` };
}

export default async function ImagePage({ params }: PageProps<"/images/[...path]">) {
  const user = await requireUser();
  const { repository, reference } = splitPath((await params).path);
  if (!repository) notFound();

  let detail: ImageDetail;
  try {
    detail = await getImageDetail(repository, reference);
  } catch (err) {
    if (err instanceof RegistryError && (err.status === 404 || err.code === "MANIFEST_UNKNOWN" || err.code === "NAME_UNKNOWN")) notFound();
    throw err;
  }

  const images = detail.platforms.filter((p) => !p.attestation);
  const attestations = detail.platforms.filter((p) => p.attestation);
  const timeline = tagTimeline(repository, reference);
  const layerCount = images[0]?.manifest?.layers?.length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="font-mono">
            {repository}:<span className="text-primary">{reference}</span>
          </span>
        }
        description={
          <span className="inline-flex items-center gap-1">
            <Mono>{detail.digest}</Mono>
            <CopyButton value={detail.digest} label="Copy digest" />
          </span>
        }
        actions={user.role === "admin" && <DeleteImageButton repository={repository} reference={reference} aliases={detail.aliases} />}
      >
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/repositories">Repositories</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={repoHref(repository)} className="font-mono">
                  {repository}
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="font-mono">{reference}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Size" value={formatBytes(detail.size)} hint={detail.kind === "index" ? "All platforms, compressed" : "Compressed"} />
        <StatCard label="Created" value={<TimeAgo value={detail.created} />} hint={formatDate(detail.created)} />
        <StatCard label="Platforms" value={images.length} hint={images.map((p) => p.platform).join(", ") || "—"} />
        <StatCard label="Layers" value={layerCount} hint={detail.kind === "index" ? `on ${images[0]?.platform ?? "first platform"}` : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Pull">
          <div className="space-y-2">
            <CommandLine command={`docker pull ${env.registryPublicHost}/${repository}:${reference}`} />
            <CommandLine command={`docker pull ${env.registryPublicHost}/${repository}@${detail.digest}`} />
          </div>
        </Section>
        <Section title="Image">
          <KeyValue
            items={[
              ["Manifest type", <Mono key="m">{detail.mediaType}</Mono>],
              ["Kind", detail.kind === "index" ? "Multi-platform index" : detail.kind === "image" ? "Single image" : detail.kind],
              [
                "Same image as",
                detail.aliases.length ? (
                  <span key="a" className="flex flex-wrap gap-1">
                    {detail.aliases.map((a) => (
                      <Link key={a} href={tagHref(repository, a)}>
                        <Badge variant="secondary" className="font-mono hover:underline">
                          {a}
                        </Badge>
                      </Link>
                    ))}
                  </span>
                ) : (
                  <span key="a" className="text-muted-foreground">No other tags</span>
                ),
              ],
              ["Attestations", attestations.length ? `${attestations.length} (provenance / SBOM)` : "None"],
            ]}
          />
        </Section>
      </div>

      {images.length === 0 && (
        <Alert>
          <AlertTitle>No image platforms</AlertTitle>
          <AlertDescription>This manifest has no runnable image (it may be an artifact or its children are missing).</AlertDescription>
        </Alert>
      )}

      {images.length > 0 && (
        <Tabs defaultValue={images[0].digest}>
          {images.length > 1 && (
            <TabsList>
              {images.map((p) => (
                <TabsTrigger key={p.digest} value={p.digest} className="font-mono">
                  {p.platform}
                </TabsTrigger>
              ))}
            </TabsList>
          )}
          {images.map((p) => (
            <TabsContent key={p.digest} value={p.digest} className="mt-4 space-y-4">
              <PlatformView repository={repository} platform={p} multi={images.length > 1} />
            </TabsContent>
          ))}
        </Tabs>
      )}

      <Section title="Tag history" description={`Digests '${reference}' has pointed to, from push events`}>
        {timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">No push events recorded for this tag.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Digest</TableHead>
                <TableHead>Pushed by</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {timeline.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Mono>{shortDigest(e.digest, 16)}</Mono>
                      {e.digest === detail.digest && <Badge>current</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">{e.actor ?? "anonymous"}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    <TimeAgo value={e.ts} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section title="Raw manifest" description={detail.mediaType}>
        <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 font-mono text-xs">{prettyJson(detail.raw)}</pre>
      </Section>
    </div>
  );
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function PlatformView({ repository, platform: p, multi }: { repository: string; platform: PlatformDetail; multi: boolean }) {
  const cfg = p.config?.config ?? {};
  const layers = p.manifest?.layers ?? [];
  const history = p.config?.history ?? [];
  // Non-empty history entries line up with layers, in order.
  const layerSteps = history.filter((h) => !h.empty_layer);
  const labels = Object.entries(cfg.Labels ?? {});
  const env = cfg.Env ?? [];

  return (
    <>
      {multi && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          Platform manifest <Mono>{p.digest}</Mono> <CopyButton value={p.digest} label="Copy platform digest" /> · {formatBytes(p.size)}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Runtime">
          <KeyValue
            items={[
              ["Platform", <Mono key="p">{p.platform}</Mono>],
              ["Entrypoint", cfg.Entrypoint?.length ? <Mono key="e">{JSON.stringify(cfg.Entrypoint)}</Mono> : "—"],
              ["Command", cfg.Cmd?.length ? <Mono key="c">{JSON.stringify(cfg.Cmd)}</Mono> : "—"],
              ["Working dir", cfg.WorkingDir ? <Mono key="w">{cfg.WorkingDir}</Mono> : "—"],
              ["User", cfg.User || "root (default)"],
              ["Exposed ports", Object.keys(cfg.ExposedPorts ?? {}).join(", ") || "—"],
              ["Volumes", Object.keys(cfg.Volumes ?? {}).join(", ") || "—"],
              ["Stop signal", cfg.StopSignal || "—"],
              ["Healthcheck", cfg.Healthcheck?.Test ? <Mono key="h">{cfg.Healthcheck.Test.join(" ")}</Mono> : "—"],
            ]}
          />
        </Section>
        <Section title={`Labels (${labels.length})`}>
          {labels.length === 0 ? (
            <p className="text-sm text-muted-foreground">No labels.</p>
          ) : (
            <div className="max-h-72 space-y-1 overflow-auto">
              {labels.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 text-xs">
                  <Mono className="truncate text-muted-foreground" title={k}>
                    {k}
                  </Mono>
                  <Mono className="break-all">{v}</Mono>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      <Section title={`Environment (${env.length})`}>
        {env.length === 0 ? (
          <p className="text-sm text-muted-foreground">No environment variables.</p>
        ) : (
          <div className="max-h-72 space-y-1 overflow-auto">
            {env.map((e, i) => {
              const at = e.indexOf("=");
              return (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,3fr)] gap-3 text-xs">
                  <Mono className="truncate font-medium">{at > 0 ? e.slice(0, at) : e}</Mono>
                  <Mono className="break-all text-muted-foreground">{at > 0 ? e.slice(at + 1) : ""}</Mono>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title={`Layers (${layers.length})`} description={`Config ${shortDigest(p.manifest?.config?.digest)} · ${formatBytes(layers.reduce((n, l) => n + l.size, 0))} total`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Instruction</TableHead>
              <TableHead>Digest</TableHead>
              <TableHead className="text-right">Size</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {layers.map((l, i) => (
              <TableRow key={`${l.digest}-${i}`}>
                <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                <TableCell className="max-w-0 w-full">
                  <Mono className="block truncate" title={layerSteps[i]?.created_by}>
                    {cleanStep(layerSteps[i]?.created_by) || "—"}
                  </Mono>
                </TableCell>
                <TableCell>
                  <Mono className="text-muted-foreground">{shortDigest(l.digest)}</Mono>
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatBytes(l.size)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title={`Build history (${history.length} steps)`} description="Dockerfile instructions recorded in the image config">
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">This image has no build history.</p>
        ) : (
          <ol className="space-y-1.5">
            {history.map((h, i) => (
              <li key={i} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-2 text-xs">
                <span className="text-muted-foreground tabular-nums">{i + 1}</span>
                <Mono className={h.empty_layer ? "break-all text-muted-foreground" : "break-all"}>{cleanStep(h.created_by) || h.comment || "—"}</Mono>
                <span className="whitespace-nowrap text-muted-foreground">{h.empty_layer ? "metadata" : "layer"}</span>
              </li>
            ))}
          </ol>
        )}
      </Section>
      <p className="text-xs text-muted-foreground">
        Repository <Link href={repoHref(repository)} className="font-mono hover:underline">{repository}</Link>
      </p>
    </>
  );
}

function cleanStep(s?: string): string {
  if (!s) return "";
  return s
    .replace(/^\/bin\/sh -c #\(nop\)\s*/, "")
    .replace(/^\/bin\/sh -c /, "RUN ")
    .replace(/\s*# buildkit$/, "")
    .trim();
}
