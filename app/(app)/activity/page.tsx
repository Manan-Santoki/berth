import Link from "next/link";
import { TimeAgo } from "@/components/client-bits";
import { ActionBadge, Mono, PageHeader } from "@/components/shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAudit } from "@/lib/audit";
import { features } from "@/lib/env";
import { listEvents } from "@/lib/events";
import { repoHref, shortDigest, tagHref } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Activity" };

const PAGE = 50;
const ACTIONS = ["push", "pull", "delete"] as const;

function href(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])));
  const s = sp.toString();
  return `/activity${s ? `?${s}` : ""}`;
}

export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const view = one(sp.view) === "audit" ? "audit" : "events";
  const action = one(sp.action);
  const repository = one(sp.repository);
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const base = { view: view === "audit" ? "audit" : undefined, action, repository };

  return (
    <div className="space-y-6">
      <PageHeader title="Activity" description="Registry events from notifications, and every change made through Berth" />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border p-0.5">
          <Button asChild size="sm" variant={view === "events" ? "secondary" : "ghost"}>
            <Link href={href({})}>Registry events</Link>
          </Button>
          <Button asChild size="sm" variant={view === "audit" ? "secondary" : "ghost"}>
            <Link href={href({ view: "audit" })}>Audit log</Link>
          </Button>
        </div>
        {view === "events" && (
          <div className="flex flex-wrap items-center gap-1">
            <Button asChild size="sm" variant={!action ? "outline" : "ghost"}>
              <Link href={href({ repository })}>All</Link>
            </Button>
            {ACTIONS.map((a) => (
              <Button key={a} asChild size="sm" variant={action === a ? "outline" : "ghost"} className="capitalize">
                <Link href={href({ action: a, repository })}>{a}</Link>
              </Button>
            ))}
            {repository && (
              <Badge variant="secondary" className="ml-2 font-mono">
                {repository}
                <Link href={href({ action })} className="ml-1 text-muted-foreground hover:text-foreground" aria-label="Clear repository filter">
                  ×
                </Link>
              </Badge>
            )}
          </div>
        )}
      </div>

      {view === "events" ? <EventsView action={action} repository={repository} page={page} base={base} /> : <AuditView page={page} />}
    </div>
  );
}

function Pager({ page, total, base }: { page: number; total: number; base: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / PAGE));
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        {total} total · page {page} of {pages}
      </span>
      <div className="flex gap-2">
        <Button asChild size="sm" variant="outline" className={cn(page <= 1 && "pointer-events-none opacity-50")}>
          <Link href={href({ ...base, page: String(page - 1) })}>Previous</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className={cn(page >= pages && "pointer-events-none opacity-50")}>
          <Link href={href({ ...base, page: String(page + 1) })}>Next</Link>
        </Button>
      </div>
    </div>
  );
}

function EventsView({ action, repository, page, base }: { action?: string; repository?: string; page: number; base: Record<string, string | undefined> }) {
  const { rows, total } = listEvents({ action, repository, limit: PAGE, offset: (page - 1) * PAGE });
  return (
    <div className="space-y-3">
      {!features.webhooks && (
        <Alert>
          <AlertTitle>Registry notifications are not configured</AlertTitle>
          <AlertDescription>
            Set WEBHOOK_TOKEN on Berth and add a notifications endpoint to the registry config. See Settings for the snippet.
          </AlertDescription>
        </Alert>
      )}
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead>Repository</TableHead>
              <TableHead>Tag</TableHead>
              <TableHead>Digest</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead className="hidden lg:table-cell">Client</TableHead>
              <TableHead className="text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No events.
                </TableCell>
              </TableRow>
            )}
            {rows.map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  <ActionBadge action={e.action} />
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {e.repository ? (
                    <Link href={href({ action, repository: e.repository })} className="hover:underline">
                      {e.repository}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {e.tag && e.repository ? (
                    <Link href={tagHref(e.repository, e.tag)} className="hover:underline">
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
                <TableCell className="hidden max-w-64 truncate text-xs text-muted-foreground lg:table-cell" title={e.user_agent ?? ""}>
                  {e.source_addr ?? ""} {e.user_agent ? `· ${e.user_agent.split(" ")[0]}` : ""}
                </TableCell>
                <TableCell className="text-right text-xs whitespace-nowrap text-muted-foreground">
                  <TimeAgo value={e.ts} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Pager page={page} total={total} base={base} />
      {repository && (
        <p className="text-xs text-muted-foreground">
          Open <Link href={repoHref(repository)} className="font-mono hover:underline">{repository}</Link>
        </p>
      )}
    </div>
  );
}

function AuditView({ page }: { page: number }) {
  const rows = listAudit(PAGE + 1, (page - 1) * PAGE);
  const hasMore = rows.length > PAGE;
  return (
    <div className="space-y-3">
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>By</TableHead>
              <TableHead className="hidden lg:table-cell">Detail</TableHead>
              <TableHead className="text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Nothing has been changed through Berth yet.
                </TableCell>
              </TableRow>
            )}
            {rows.slice(0, PAGE).map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Badge variant={r.action.includes("delete") || r.action.includes("prune") ? "destructive" : "secondary"} className="font-mono">
                    {r.action}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-72 truncate font-mono text-xs" title={r.target ?? ""}>
                  {r.target ?? "—"}
                </TableCell>
                <TableCell className="text-xs">{r.actor}</TableCell>
                <TableCell className="hidden max-w-72 truncate font-mono text-xs text-muted-foreground lg:table-cell" title={r.detail ?? ""}>
                  {r.detail ?? ""}
                </TableCell>
                <TableCell className="text-right text-xs whitespace-nowrap text-muted-foreground">
                  <TimeAgo value={r.ts} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <div className="flex justify-end gap-2">
        <Button asChild size="sm" variant="outline" className={cn(page <= 1 && "pointer-events-none opacity-50")}>
          <Link href={href({ view: "audit", page: String(page - 1) })}>Previous</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className={cn(!hasMore && "pointer-events-none opacity-50")}>
          <Link href={href({ view: "audit", page: String(page + 1) })}>Next</Link>
        </Button>
      </div>
    </div>
  );
}
