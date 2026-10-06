"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BoxIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { repoHref } from "@/lib/format";

type Repo = { name: string; tags: number };

/** ⌘K / Ctrl+K jump-to-repository palette. Loads the repository list on first open. */
export function CommandSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [repos, setRepos] = useState<Repo[] | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open || repos) return;
    fetch("/api/v1/repositories")
      .then((r) => r.json())
      .then((d: { repositories?: Repo[] }) => setRepos(d.repositories ?? []))
      .catch(() => setRepos([]));
  }, [open, repos]);

  return (
    <>
      <Button variant="outline" size="sm" className="w-full justify-start text-muted-foreground sm:w-64" onClick={() => setOpen(true)}>
        <SearchIcon />
        <span className="flex-1 text-left">Search repositories…</span>
        <kbd className="pointer-events-none hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">Ctrl K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search repositories" description="Jump to a repository">
        <Command>
        <CommandInput placeholder="Type a repository name…" />
        <CommandList>
          <CommandEmpty>{repos ? "No repositories found." : "Loading…"}</CommandEmpty>
          {repos && repos.length > 0 && (
            <CommandGroup heading="Repositories">
              {repos.map((r) => (
                <CommandItem
                  key={r.name}
                  value={r.name}
                  onSelect={() => {
                    setOpen(false);
                    router.push(repoHref(r.name));
                  }}
                >
                  <BoxIcon />
                  <span className="font-mono">{r.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{r.tags} tags</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
