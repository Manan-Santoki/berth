"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EyeIcon, Loader2Icon, PlayIcon, RulerIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { getJobAction, measureDiskAction, pruneEmptyReposAction, runGcAction } from "@/app/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Job } from "@/lib/jobs";
import { JobStatus } from "./jobs-table";

export function GcPanel({ canRun, running }: { canRun: boolean; running: boolean }) {
  const router = useRouter();
  const [deleteUntagged, setDeleteUntagged] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const outRef = useRef<HTMLPreElement>(null);

  const poll = (id: number) => {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(async () => {
      const j = await getJobAction(id);
      setJob(j);
      if (j && j.status !== "running") {
        clearInterval(timer.current!);
        timer.current = null;
        if (j.status === "succeeded") toast.success(j.summary ?? "Garbage collection finished");
        else toast.error(j.summary ?? "Garbage collection failed");
        router.refresh();
      }
    }, 1000);
  };

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);
  useEffect(() => {
    outRef.current?.scrollTo({ top: outRef.current.scrollHeight });
  }, [job?.output]);

  const launch = (dryRun: boolean) =>
    start(async () => {
      const res = await runGcAction(dryRun, deleteUntagged);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setJob({ id: res.jobId, status: "running", type: "gc", dry_run: dryRun ? 1 : 0, actor: "you", started_at: Date.now(), finished_at: null, summary: null, output: null });
      poll(res.jobId);
    });

  const busy = pending || running || job?.status === "running";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Switch id="untagged" checked={deleteUntagged} onCheckedChange={setDeleteUntagged} disabled={!canRun} />
        <Label htmlFor="untagged" className="flex flex-col items-start gap-0.5">
          <span>Delete untagged manifests</span>
          <span className="text-xs font-normal text-muted-foreground">Also removes images no tag points to (old digests of overwritten tags).</span>
        </Label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!canRun || busy} onClick={() => launch(true)}>
          {busy ? <Loader2Icon className="animate-spin" /> : <EyeIcon />} Dry run
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={!canRun || busy}>
              <PlayIcon /> Run garbage collection
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Run garbage collection?</AlertDialogTitle>
              <AlertDialogDescription>
                Unreferenced blobs are permanently deleted from disk. Avoid pushing images while it runs: a layer uploaded mid-collection can be removed and corrupt that push.
                {deleteUntagged && " Untagged manifests will be deleted too."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => launch(false)}>
                Run now
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {job && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <JobStatus status={job.status} />
            <span className="text-muted-foreground">{job.summary ?? (job.dry_run ? "Dry run in progress…" : "Collecting…")}</span>
          </div>
          <pre ref={outRef} className="max-h-72 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
            {job.output ?? "Waiting for output…"}
          </pre>
        </div>
      )}
    </div>
  );
}

export function MeasureButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await measureDiskAction();
          if (!res.ok) toast.error(res.error);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <RulerIcon />} Measure now
    </Button>
  );
}

export function PruneEmptyButton({ names }: { names: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending || names.length === 0}>
          {pending ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />} Remove {names.length} empty
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {names.length} empty repositories?</AlertDialogTitle>
          <AlertDialogDescription>
            Their folders are deleted from storage so they disappear from the catalog. They have no tags, so nothing pullable is lost. Run garbage collection afterwards to free their layers.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              start(async () => {
                const res = await pruneEmptyReposAction(names);
                if (!res.ok) toast.error(res.error);
                else toast.success(`Removed ${res.removed.length} repositories`);
                router.refresh();
              })
            }
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
