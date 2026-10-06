"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownWideNarrowIcon, BoxIcon, ChevronRightIcon, FolderIcon, ListIcon, ListTreeIcon, SearchIcon, TriangleAlertIcon } from "lucide-react";
import { TimeAgo } from "@/components/client-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBytes, repoHref } from "@/lib/format";
import { cn } from "@/lib/utils";

export type RepoRow = {
  name: string;
  tags: number;
  size: number;
  lastUpdated: string | null;
  lastPull: number | null;
  pulls30d: number;
  platforms: string[];
  error: string | null;
};

type Sort = "name" | "updated" | "size" | "tags" | "pulls";

const sorters: Record<Sort, (a: RepoRow, b: RepoRow) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  updated: (a, b) => (b.lastUpdated ? Date.parse(b.lastUpdated) : 0) - (a.lastUpdated ? Date.parse(a.lastUpdated) : 0),
  size: (a, b) => b.size - a.size,
  tags: (a, b) => b.tags - a.tags,
  pulls: (a, b) => b.pulls30d - a.pulls30d,
};

export function RepoBrowser({ rows }: { rows: RepoRow[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [grouped, setGrouped] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => !q || r.name.toLowerCase().includes(q)).sort(sorters[sort]);
  }, [rows, query, sort]);

  const groups = useMemo(() => {
    const map = new Map<string, RepoRow[]>();
    for (const r of filtered) {
      const ns = r.name.includes("/") ? r.name.slice(0, r.name.indexOf("/")) : "";
      map.set(ns, [...(map.get(ns) ?? []), r]);
    }
    // Top-level repos first, then namespaces alphabetically.
    return [...map.entries()].sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
  }, [filtered]);

  const toggle = (ns: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(ns)) n.delete(ns);
      else n.add(ns);
      return n;
    });

  if (rows.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BoxIcon />
          </EmptyMedia>
          <EmptyTitle>No repositories yet</EmptyTitle>
          <EmptyDescription>Push an image to the registry and it will show up here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const renderRow = (r: RepoRow, indent: boolean) => (
    <TableRow key={r.name} className="group">
      <TableCell className={cn("max-w-0 w-full", indent && "pl-10")}>
        <Link href={repoHref(r.name)} className="flex items-center gap-2 font-mono text-sm group-hover:underline">
          <BoxIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{indent ? r.name.slice(r.name.indexOf("/") + 1) : r.name}</span>
          {r.error && (
            <Tooltip>
              <TooltipTrigger asChild>
                <TriangleAlertIcon className="size-4 shrink-0 text-amber-500" />
              </TooltipTrigger>
              <TooltipContent>{r.error}</TooltipContent>
            </Tooltip>
          )}
        </Link>
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <div className="flex flex-wrap gap-1">
          {r.platforms.slice(0, 3).map((p) => (
            <Badge key={p} variant="outline" className="font-mono text-[10px]">
              {p}
            </Badge>
          ))}
          {r.platforms.length > 3 && <Badge variant="outline">+{r.platforms.length - 3}</Badge>}
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">{r.tags === 0 ? <span className="text-muted-foreground">empty</span> : r.tags}</TableCell>
      <TableCell className="text-right tabular-nums">{formatBytes(r.size)}</TableCell>
      <TableCell className="hidden text-right tabular-nums md:table-cell">{r.pulls30d || <span className="text-muted-foreground">0</span>}</TableCell>
      <TableCell className="text-right whitespace-nowrap text-muted-foreground">
        <TimeAgo value={r.lastUpdated} />
      </TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter repositories…" className="pl-8" />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="w-full sm:w-48">
            <ArrowDownWideNarrowIcon />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="updated">Recently updated</SelectItem>
            <SelectItem value="size">Largest</SelectItem>
            <SelectItem value="tags">Most tags</SelectItem>
            <SelectItem value="pulls">Most pulled (30d)</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex rounded-md border p-0.5">
          <Button variant={grouped ? "secondary" : "ghost"} size="sm" onClick={() => setGrouped(true)}>
            <ListTreeIcon /> Grouped
          </Button>
          <Button variant={grouped ? "ghost" : "secondary"} size="sm" onClick={() => setGrouped(false)}>
            <ListIcon /> Flat
          </Button>
        </div>
      </div>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Repository</TableHead>
              <TableHead className="hidden lg:table-cell">Platforms</TableHead>
              <TableHead className="text-right">Tags</TableHead>
              <TableHead className="text-right">Size</TableHead>
              <TableHead className="hidden text-right md:table-cell">Pulls 30d</TableHead>
              <TableHead className="text-right">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No repositories match “{query}”.
                </TableCell>
              </TableRow>
            )}
            {!grouped && filtered.map((r) => renderRow(r, false))}
            {grouped &&
              groups.map(([ns, items]) =>
                ns === "" || items.length === 1 && items[0].name === ns
                  ? items.map((r) => renderRow(r, false))
                  : [
                      <TableRow key={`ns:${ns}`} className="cursor-pointer bg-muted/40 hover:bg-muted" onClick={() => toggle(ns)}>
                        <TableCell colSpan={2} className="font-mono text-sm font-medium">
                          <div className="flex items-center gap-2">
                            <ChevronRightIcon className={cn("size-4 transition-transform", !collapsed.has(ns) && "rotate-90")} />
                            <FolderIcon className="size-4 text-muted-foreground" />
                            {ns}/
                            <span className="text-xs font-normal text-muted-foreground">{items.length} repositories</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{items.reduce((n, r) => n + r.tags, 0)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{formatBytes(items.reduce((n, r) => n + r.size, 0))}</TableCell>
                        <TableCell className="hidden md:table-cell" />
                        <TableCell />
                      </TableRow>,
                      ...(collapsed.has(ns) ? [] : items.map((r) => renderRow(r, true))),
                    ],
              )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
