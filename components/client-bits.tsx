"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, CopyIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { refreshAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function CopyButton({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={cn("shrink-0", className)}
          aria-label={label}
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              toast.error("Clipboard is unavailable (needs HTTPS or localhost).");
            }
          }}
        >
          {copied ? <CheckIcon className="text-emerald-500" /> : <CopyIcon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copied" : label}</TooltipContent>
    </Tooltip>
  );
}

/** A command line with a copy button, e.g. `docker pull …`. */
export function CommandLine({ command }: { command: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/50 py-1 pr-1 pl-3">
      <code className="min-w-0 flex-1 truncate font-mono text-xs" title={command}>
        {command}
      </code>
      <CopyButton value={command} label="Copy command" />
    </div>
  );
}

export function RefreshButton({ path = "/" }: { path?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await refreshAction(path);
          router.refresh();
        })
      }
    >
      <RefreshCwIcon className={cn(pending && "animate-spin")} />
      Rescan
    </Button>
  );
}

/** Renders a relative time on the client so it stays correct for cached HTML. */
export function TimeAgo({ value }: { value: string | number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  const t = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(t) || t <= 0) return <span className="text-muted-foreground">—</span>;
  const iso = new Date(t).toISOString();
  return (
    <time dateTime={iso} title={iso.replace("T", " ").slice(0, 19) + " UTC"} suppressHydrationWarning>
      {relative(t)}
    </time>
  );
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function relative(t: number): string {
  const s = Math.round((t - Date.now()) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return rtf.format(s, "second");
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(s / 3600), "hour");
  if (abs < 86_400 * 30) return rtf.format(Math.round(s / 86_400), "day");
  if (abs < 86_400 * 365) return rtf.format(Math.round(s / (86_400 * 30)), "month");
  return rtf.format(Math.round(s / (86_400 * 365)), "year");
}
