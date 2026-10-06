import Link from "next/link";
import { notFound } from "next/navigation";
import { CommandLine, RefreshButton, TimeAgo } from "@/components/client-bits";
import { ActionBadge, Mono, PageHeader, Section, StatCard } from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { listEvents } from "@/lib/events";
import { formatBytes, shortDigest, tagHref } from "@/lib/format";
import { getRepository } from "@/lib/registry/snapshot";
import { TagsTable, type TagRow } from "./tags-table";

export async function generateMetadata({ params }: PageProps<"/repositories/[...name]">) {
  const { name } = await params;
  return { title: name.map(decodeURIComponent).join("/") };
}

export default async function RepositoryPage({ params }: PageProps<"/repositories/[...name]">) {
  const user = await requireUser();
  const name = (await params).name.map(decodeURIComponent).join("/");
  const repo = await getRepository(name);
  if (!repo) notFound();

  const events = listEvents({ repository: name, limit: 100 });
  const digestCounts = new Map<string, number>();
  for (const t of repo.tags) if (t.digest) digestCounts.set(t.digest, (digestCounts.get(t.digest) ?? 0) + 1);
  const rows: TagRow[] = repo.tags.map((t) => ({
    tag: t.tag,
    digest: t.digest,
    kind: t.kind,
    size: t.size,
    created: t.created,
    platforms: t.platforms,
    shared: (digestCounts.get(t.digest) ?? 0) > 1,
    error: t.error ?? null,
  }));
  const segments = name.split("/");

  return (
    <div className="space-y-6">
      <PageHeader
        title={<span className="font-mono">{name}</span>}
        description={`${repo.tags.length} tags · ${digestCounts.size} unique images · ${formatBytes(repo.size)}`}
        actions={<RefreshButton path={`/repositories`} />}
      >
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/repositories">Repositories</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {segments.map((s, i) => (
              <span key={i} className="contents">
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  {i === segments.length - 1 ? <BreadcrumbPage className="font-mono">{s}</BreadcrumbPage> : <span className="font-mono">{s}</span>}
                </BreadcrumbItem>
              </span>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </PageHeader>

      {repo.error && (
        <Alert variant="destructive">
          <AlertDescription>{repo.error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Tags" value={repo.tags.length} />
        <StatCard label="Unique images" value={digestCounts.size} />
        <StatCard label="Size" value={formatBytes(repo.size)} hint="Deduplicated" />
        <StatCard label="Last built" value={<TimeAgo value={repo.lastUpdated} />} />
      </div>

      <Section title="Pull" description="Latest tag shown; any tag works">
        <CommandLine command={`docker pull ${env.registryPublicHost}/${name}:${repo.tags[0]?.tag ?? "latest"}`} />
      </Section>

      <Tabs defaultValue="tags">
        <TabsList>
          <TabsTrigger value="tags">Tags ({repo.tags.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity ({events.total})</TabsTrigger>
        </TabsList>
        <TabsContent value="tags" className="mt-4">
          <TagsTable repository={name} rows={rows} canDelete={user.role === "admin"} />
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <Section title="Repository activity" description="From registry notifications">
            {events.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events recorded for this repository.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Tag</TableHead>
                    <TableHead>Digest</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.rows.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <ActionBadge action={e.action} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {e.tag ? (
                          <Link href={tagHref(name, e.tag)} className="hover:underline">
                            {e.tag}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <Mono className="text-muted-foreground">{shortDigest(e.digest)}</Mono>
                      </TableCell>
                      <TableCell className="text-xs">{e.actor ?? "anonymous"}</TableCell>
                      <TableCell className="max-w-48 truncate text-xs text-muted-foreground" title={e.user_agent ?? ""}>
                        {e.source_addr ?? "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        <TimeAgo value={e.ts} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
