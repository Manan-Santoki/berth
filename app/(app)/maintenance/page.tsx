import { TimeAgo } from "@/components/client-bits";
import { KeyValue, Mono, PageHeader, Section } from "@/components/shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/session";
import { env, features } from "@/lib/env";
import { formatBytes, formatNumber } from "@/lib/format";
import { listJobs } from "@/lib/jobs";
import { diskUsage, findEmptyRepositories, gcRunning, registryMetrics } from "@/lib/maintenance";
import { getSnapshot } from "@/lib/registry/snapshot";
import { GcPanel, MeasureButton, PruneEmptyButton } from "./maintenance-client";
import { JobsTable } from "./jobs-table";

export const metadata = { title: "Maintenance" };

export default async function MaintenancePage() {
  const user = await requireUser();
  const admin = user.role === "admin";
  const [disk, snap, empty, metrics] = await Promise.all([
    diskUsage().catch(() => null),
    getSnapshot(),
    findEmptyRepositories().catch(() => []),
    registryMetrics().catch((e: Error) => e),
  ]);
  const jobs = listJobs("gc", 20);
  // Catalog repos with no tags also count as empty even when Berth can't see the disk.
  const emptyInCatalog = snap.repos.filter((r) => r.tags.length === 0).map((r) => r.name);
  const reclaimable = disk ? Math.max(0, disk.blobBytes - snap.totals.size) : null;

  const requestRows =
    metrics && !(metrics instanceof Error)
      ? Object.values(
          metrics.requests.reduce<Record<string, { handler: string; ok: number; err: number }>>((acc, r) => {
            const k = r.handler || "other";
            acc[k] ??= { handler: k, ok: 0, err: 0 };
            if (r.code.startsWith("2") || r.code.startsWith("3")) acc[k].ok += r.count;
            else acc[k].err += r.count;
            return acc;
          }, {}),
        ).sort((a, b) => b.ok + b.err - (a.ok + a.err))
      : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Maintenance" description="Reclaim disk space, tidy the catalog and inspect registry health" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Storage" description={disk ? <>Measured <TimeAgo value={disk.measuredAt} /></> : "Disk usage needs the registry volume"} actions={features.diskUsage && <MeasureButton />}>
          {disk ? (
            <KeyValue
              items={[
                ["On disk", <span key="d" className="font-semibold">{formatBytes(disk.bytes)}</span>],
                ["Blob data", `${formatBytes(disk.blobBytes)} in ${formatNumber(disk.blobs)} blobs`],
                ["Referenced by tags", formatBytes(snap.totals.size)],
                [
                  "Reclaimable (est.)",
                  <span key="r" className={reclaimable && reclaimable > 0 ? "font-semibold text-amber-600 dark:text-amber-400" : ""}>
                    {formatBytes(reclaimable)}
                  </span>,
                ],
                ["Repository folders", formatNumber(disk.repositories)],
              ]}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Mount the registry data volume into Berth and set <Mono>REGISTRY_STORAGE_PATH</Mono> to see disk usage. The bundled docker-compose does this for you.
            </p>
          )}
        </Section>

        <Section
          title="Empty repositories"
          description="Repositories with no tags that still show up in the catalog"
          actions={admin && features.diskUsage && <PruneEmptyButton names={empty} />}
        >
          {(features.diskUsage ? empty : emptyInCatalog).length === 0 ? (
            <p className="text-sm text-muted-foreground">None. The catalog is clean.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(features.diskUsage ? empty : emptyInCatalog).map((n) => (
                <Mono key={n} className="rounded border px-1.5 py-0.5">
                  {n}
                </Mono>
              ))}
            </div>
          )}
          {!features.diskUsage && emptyInCatalog.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">Removing them needs access to the registry volume.</p>
          )}
        </Section>
      </div>

      <Section
        title="Garbage collection"
        description="Deleting a tag only removes the reference. Garbage collection deletes the layers nothing points to and frees the disk space."
      >
        {!features.garbageCollection ? (
          <Alert>
            <AlertTitle>Not available in this setup</AlertTitle>
            <AlertDescription>
              Berth runs <Mono>registry garbage-collect</Mono> itself, so it needs the registry volume (<Mono>REGISTRY_STORAGE_PATH</Mono>) and config (
              <Mono>REGISTRY_CONFIG_PATH</Mono>). Use the bundled docker-compose, or run it manually: <Mono>docker exec &lt;registry&gt; registry garbage-collect /etc/distribution/config.yml</Mono>
            </AlertDescription>
          </Alert>
        ) : (
          <GcPanel canRun={admin} running={gcRunning()} />
        )}
      </Section>

      <Section title="Garbage collection history">
        <JobsTable jobs={jobs} />
      </Section>

      <Section title="Registry metrics" description={features.metrics ? <Mono>{env.registryMetricsUrl}</Mono> : "Set REGISTRY_METRICS_URL to the registry debug endpoint"}>
        {metrics instanceof Error ? (
          <p className="text-sm text-destructive">{metrics.message}</p>
        ) : requestRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{features.metrics ? "No request metrics yet." : "Metrics are disabled."}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Handler</TableHead>
                <TableHead className="text-right">Successful</TableHead>
                <TableHead className="text-right">Errors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requestRows.map((r) => (
                <TableRow key={r.handler}>
                  <TableCell className="font-mono text-xs">{r.handler}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(r.ok)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.err ? <span className="text-destructive">{formatNumber(r.err)}</span> : 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </div>
  );
}
