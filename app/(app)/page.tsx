import Link from "next/link";
import { BoxesIcon, CircleAlertIcon, DatabaseIcon, HardDriveIcon, LayersIcon, TagsIcon } from "lucide-react";
import { CommandLine, RefreshButton, TimeAgo } from "@/components/client-bits";
import { ActionBadge, Mono, PageHeader, Section, StatCard } from "@/components/shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { env, features } from "@/lib/env";
import { dailyActivity, listEvents } from "@/lib/events";
import { formatBytes, formatNumber, repoHref, shortDigest, tagHref } from "@/lib/format";
import { diskUsage } from "@/lib/maintenance";
import { ping } from "@/lib/registry/client";
import { getSnapshot } from "@/lib/registry/snapshot";
import { ActivityChart } from "./activity-chart";

export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const health = await ping();
  if (!health.ok) {
    return (
      <div className="space-y-6">
        <PageHeader title="Overview" />
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Registry unreachable</AlertTitle>
          <AlertDescription>
            {health.error}. Check REGISTRY_URL ({env.registryUrl}) and that ADMIN_USERNAME / ADMIN_PASSWORD are valid registry credentials.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const [snap, disk] = await Promise.all([getSnapshot(), diskUsage().catch(() => null)]);
  const activity = dailyActivity(30);
  const recent = listEvents({ limit: 8 }).rows;
  const recentTags = snap.repos
    .flatMap((r) => r.tags.filter((t) => t.created).map((t) => ({ repo: r.name, ...t })))
    .sort((a, b) => Date.parse(b.created!) - Date.parse(a.created!))
    .slice(0, 8);
  const largest = [...snap.repos].sort((a, b) => b.size - a.size).slice(0, 6);
  const maxSize = largest[0]?.size || 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={
          <>
            Registry v2 API {health.apiVersion ? `(${health.apiVersion})` : ""} · {health.latencyMs} ms · scanned <TimeAgo value={snap.generatedAt} /> in {snap.durationMs} ms
          </>
        }
        actions={<RefreshButton />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Repositories" value={formatNumber(snap.totals.repos)} icon={BoxesIcon} />
        <StatCard label="Tags" value={formatNumber(snap.totals.tags)} hint={`${formatNumber(snap.totals.manifests)} unique images`} icon={TagsIcon} />
        <StatCard label="Referenced data" value={formatBytes(snap.totals.size)} hint="Deduplicated across all tags" icon={LayersIcon} />
        {disk ? (
          <StatCard
            label="Disk usage"
            value={formatBytes(disk.bytes)}
            hint={disk.bytes > snap.totals.size * 1.05 ? `${formatBytes(Math.max(0, disk.blobBytes - snap.totals.size))} reclaimable by GC (est.)` : "Measured on the volume"}
            icon={HardDriveIcon}
          />
        ) : (
          <StatCard label="Storage" value="—" hint="Mount the registry volume to measure disk use" icon={HardDriveIcon} />
        )}
      </div>

      {snap.errors.length > 0 && (
        <Alert>
          <CircleAlertIcon />
          <AlertTitle>{snap.errors.length} item(s) could not be read</AlertTitle>
          <AlertDescription>
            <ul className="list-inside list-disc font-mono text-xs">
              {snap.errors.slice(0, 5).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Section
          className="lg:col-span-2"
          title="Activity"
          description={features.webhooks ? "Pushes, pulls and deletes over the last 30 days" : "Enable registry notifications (WEBHOOK_TOKEN) to record activity"}
        >
          <ActivityChart data={activity} />
        </Section>
        <Section title="Quick start" description="Authenticate, then push and pull">
          <div className="space-y-2">
            <CommandLine command={`docker login ${env.registryPublicHost}`} />
            <CommandLine command={`docker tag my-app ${env.registryPublicHost}/my-app:1.0`} />
            <CommandLine command={`docker push ${env.registryPublicHost}/my-app:1.0`} />
            <CommandLine command={`docker pull ${env.registryPublicHost}/my-app:1.0`} />
          </div>
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Recently built" description="Newest images by creation date">
          {recentTags.length === 0 ? (
            <p className="text-sm text-muted-foreground">No images yet.</p>
          ) : (
            <Table>
              <TableBody>
                {recentTags.map((t) => (
                  <TableRow key={`${t.repo}:${t.tag}`}>
                    <TableCell className="max-w-0 w-full">
                      <Link href={tagHref(t.repo, t.tag)} className="block truncate font-mono text-xs hover:underline">
                        {t.repo}:<span className="font-semibold">{t.tag}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{formatBytes(t.size)}</TableCell>
                    <TableCell className="text-right text-xs whitespace-nowrap text-muted-foreground">
                      <TimeAgo value={t.created} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>

        <Section title="Largest repositories" description="Deduplicated size per repository">
          <div className="space-y-3">
            {largest.map((r) => (
              <div key={r.name} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <Link href={repoHref(r.name)} className="truncate font-mono text-xs hover:underline">
                    {r.name}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {formatBytes(r.size)} · {r.tags.length} tags
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (r.size / maxSize) * 100)}%` }} />
                </div>
              </div>
            ))}
            {largest.length === 0 && <p className="text-sm text-muted-foreground">No repositories yet.</p>}
          </div>
        </Section>
      </div>

      <Section
        title="Recent events"
        description="Latest registry notifications"
        actions={
          <Link href="/activity" className="text-sm text-muted-foreground hover:underline">
            View all
          </Link>
        }
      >
        {recent.length === 0 ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <DatabaseIcon className="size-4" />
            {features.webhooks ? "No events recorded yet. Push an image to see it here." : "Webhooks are not configured."}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Image</TableHead>
                <TableHead>Digest</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <ActionBadge action={e.action} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {e.repository}
                    {e.tag ? `:${e.tag}` : ""}
                  </TableCell>
                  <TableCell>
                    <Mono className="text-muted-foreground">{shortDigest(e.digest)}</Mono>
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
    </div>
  );
}
