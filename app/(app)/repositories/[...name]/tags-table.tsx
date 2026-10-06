"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LinkIcon, Loader2Icon, SearchIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { deleteImagesAction } from "@/app/actions";
import { CopyButton, TimeAgo } from "@/components/client-bits";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBytes, shortDigest, tagHref } from "@/lib/format";

export type TagRow = {
  tag: string;
  digest: string;
  kind: string;
  size: number;
  created: string | null;
  platforms: string[];
  shared: boolean;
  error: string | null;
};

export function TagsTable({ repository, rows, canDelete }: { repository: string; rows: TagRow[]; canDelete: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [pending, start] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => !q || r.tag.toLowerCase().includes(q) || r.digest.includes(q));
  }, [rows, query]);

  // Deleting is per digest: show every tag that will disappear, not just the selected ones.
  const impact = useMemo(() => {
    if (!confirm) return [];
    const digests = new Set(rows.filter((r) => confirm.includes(r.tag)).map((r) => r.digest));
    return rows.filter((r) => digests.has(r.digest));
  }, [confirm, rows]);
  const collateral = impact.filter((r) => !confirm?.includes(r.tag));

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.tag));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map((r) => r.tag)));
  const toggle = (tag: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(tag)) n.delete(tag);
      else n.add(tag);
      return n;
    });

  const runDelete = () => {
    if (!confirm) return;
    const tags = confirm;
    start(async () => {
      const res = await deleteImagesAction(repository, tags);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const removed = res.results.flatMap((r) => r.removedTags);
      toast.success(`Deleted ${res.results.length} image(s)`, { description: removed.length ? `Removed tags: ${removed.join(", ")}` : undefined });
      setSelected(new Set());
      setConfirm(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by tag or digest…" className="pl-8" />
        </div>
        {canDelete && (
          <Button variant="destructive" size="sm" disabled={selected.size === 0} onClick={() => setConfirm([...selected])}>
            <Trash2Icon /> Delete {selected.size > 0 ? `${selected.size} tag(s)` : "selected"}
          </Button>
        )}
      </div>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              {canDelete && (
                <TableHead className="w-8">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                </TableHead>
              )}
              <TableHead>Tag</TableHead>
              <TableHead>Digest</TableHead>
              <TableHead className="hidden md:table-cell">Platforms</TableHead>
              <TableHead className="text-right">Size</TableHead>
              <TableHead className="text-right">Created</TableHead>
              {canDelete && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  {rows.length === 0 ? "This repository has no tags." : "No tags match."}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((r) => (
              <TableRow key={r.tag} data-state={selected.has(r.tag) ? "selected" : undefined}>
                {canDelete && (
                  <TableCell>
                    <Checkbox checked={selected.has(r.tag)} onCheckedChange={() => toggle(r.tag)} aria-label={`Select ${r.tag}`} />
                  </TableCell>
                )}
                <TableCell className="max-w-64">
                  <div className="flex items-center gap-2">
                    <Link href={tagHref(repository, r.tag)} className="truncate font-mono text-sm font-medium hover:underline">
                      {r.tag}
                    </Link>
                    {r.kind === "index" && (
                      <Badge variant="outline" className="text-[10px]">
                        multi-arch
                      </Badge>
                    )}
                    {r.error && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <TriangleAlertIcon className="size-4 shrink-0 text-amber-500" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm">{r.error}</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-xs text-muted-foreground">{shortDigest(r.digest)}</span>
                    {r.digest && <CopyButton value={r.digest} label="Copy digest" />}
                    {r.shared && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <LinkIcon className="size-3.5 text-sky-500" />
                        </TooltipTrigger>
                        <TooltipContent>Other tags point at this same image</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {r.platforms.map((p) => (
                      <Badge key={p} variant="secondary" className="font-mono text-[10px]">
                        {p}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatBytes(r.size)}</TableCell>
                <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                  <TimeAgo value={r.created} />
                </TableCell>
                {canDelete && (
                  <TableCell>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${r.tag}`} disabled={!r.digest} onClick={() => setConfirm([r.tag])}>
                      <Trash2Icon className="text-muted-foreground" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && !pending && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirm?.length === 1 ? `${repository}:${confirm[0]}` : `${confirm?.length} tags`}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>The image manifest is deleted from the registry. This can&apos;t be undone; anything still using these tags will fail to pull.</p>
                {collateral.length > 0 && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-foreground">
                    <p className="font-medium">These tags share the same image and will also be removed:</p>
                    <p className="mt-1 font-mono text-xs">{collateral.map((c) => c.tag).join(", ")}</p>
                  </div>
                )}
                <p>Disk space is freed after the next garbage collection.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                runDelete();
              }}
            >
              {pending && <Loader2Icon className="animate-spin" />}
              Delete {impact.length} tag(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
