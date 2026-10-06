"use client";

import { Fragment, useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import { TimeAgo } from "@/components/client-bits";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Job } from "@/lib/jobs";
import { cn } from "@/lib/utils";

export function JobStatus({ status }: { status: string }) {
  return <Badge variant={status === "failed" ? "destructive" : status === "running" ? "outline" : "secondary"}>{status}</Badge>;
}

export function JobsTable({ jobs }: { jobs: Job[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (jobs.length === 0) return <p className="text-sm text-muted-foreground">No runs yet.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead>Status</TableHead>
          <TableHead>Summary</TableHead>
          <TableHead>By</TableHead>
          <TableHead className="text-right">Started</TableHead>
          <TableHead className="text-right">Duration</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {jobs.map((j) => (
          <Fragment key={j.id}>
            <TableRow className="cursor-pointer" onClick={() => setOpen(open === j.id ? null : j.id)}>
              <TableCell>
                <ChevronRightIcon className={cn("size-4 transition-transform", open === j.id && "rotate-90")} />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <JobStatus status={j.status} />
                  {j.dry_run ? <Badge variant="outline">dry run</Badge> : null}
                </div>
              </TableCell>
              <TableCell className="max-w-96 truncate text-sm">{j.summary ?? "…"}</TableCell>
              <TableCell className="text-xs">{j.actor}</TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">
                <TimeAgo value={j.started_at} />
              </TableCell>
              <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                {j.finished_at ? `${((j.finished_at - j.started_at) / 1000).toFixed(1)}s` : "—"}
              </TableCell>
            </TableRow>
            {open === j.id && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6}>
                  <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap">{j.output || "No output."}</pre>
                </TableCell>
              </TableRow>
            )}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
}
