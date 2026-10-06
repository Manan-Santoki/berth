import { BrushCleaningIcon } from "lucide-react";
import { TimeAgo } from "@/components/client-bits";
import { PageHeader, Section } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/session";
import { listPolicies } from "@/lib/cleanup";
import { listJobs } from "@/lib/jobs";
import { JobsTable } from "../maintenance/jobs-table";
import { PolicyActions, PolicyEditor } from "./policy-client";

export const metadata = { title: "Cleanup policies" };

export default async function CleanupPage() {
  const user = await requireUser();
  const admin = user.role === "admin";
  const policies = listPolicies();
  const jobs = listJobs("cleanup", 20);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cleanup policies"
        description="Retention rules that delete old tags. Preview before running; daily policies run automatically."
        actions={admin && <PolicyEditor />}
      />

      {policies.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BrushCleaningIcon />
            </EmptyMedia>
            <EmptyTitle>No cleanup policies</EmptyTitle>
            <EmptyDescription>
              Create a policy such as &ldquo;keep the newest 10 tags of every repository, never touch latest&rdquo; and preview exactly what it would delete.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Section title="Policies" className="py-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Repositories</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Rule</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Last run</TableHead>
                {admin && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {policies.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.name}
                    {!p.enabled && (
                      <Badge variant="outline" className="ml-2">
                        disabled
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.repo_pattern}</TableCell>
                  <TableCell className="font-mono text-xs">
                    <div>{p.tag_pattern}</div>
                    {p.protect_pattern && <div className="text-muted-foreground">protect {p.protect_pattern}</div>}
                  </TableCell>
                  <TableCell className="text-xs">
                    Keep newest {p.keep_last}
                    {p.older_than_days ? `, delete older than ${p.older_than_days}d` : ""}
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.schedule === "daily" ? "default" : "secondary"}>{p.schedule}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <TimeAgo value={p.last_run_at} />
                  </TableCell>
                  {admin && (
                    <TableCell className="text-right">
                      <PolicyActions policy={p} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      )}

      <Section title="Recent runs" description="Dry runs and real runs, newest first">
        <JobsTable jobs={jobs} />
      </Section>
    </div>
  );
}
