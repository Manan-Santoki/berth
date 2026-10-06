"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EyeIcon, Loader2Icon, MoreHorizontalIcon, PencilIcon, PlayIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { deletePolicyAction, previewPolicyAction, runPolicyAction, savePolicyAction } from "@/app/actions";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PlanItem, Policy } from "@/lib/cleanup";
import { formatBytes, shortDigest } from "@/lib/format";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function PolicyEditor({ policy, trigger }: { policy?: Policy; trigger?: React.ReactNode }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<PlanItem[] | null>(null);
  const [schedule, setSchedule] = useState<string>(policy?.schedule ?? "manual");
  const [enabled, setEnabled] = useState(policy ? Boolean(policy.enabled) : true);
  const [previewing, startPreview] = useTransition();
  const [saving, startSave] = useTransition();

  const formData = () => {
    const fd = new FormData(formRef.current!);
    fd.set("schedule", schedule);
    fd.set("enabled", enabled ? "on" : "off");
    return fd;
  };

  const deletes = plan?.filter((p) => p.action === "delete") ?? [];
  const reclaim = new Map(deletes.map((d) => [`${d.repository}@${d.digest}`, d.size]));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setPlan(null);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <PlusIcon /> New policy
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{policy ? "Edit policy" : "New cleanup policy"}</DialogTitle>
          <DialogDescription>Tags are sorted newest first by image creation date. Protected tags and tags sharing an image with a kept tag are never deleted.</DialogDescription>
        </DialogHeader>
        <form ref={formRef} className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()} onChange={() => setPlan(null)}>
          <div className="sm:col-span-2">
            <Field label="Name">
              <Input name="name" defaultValue={policy?.name ?? ""} placeholder="Keep last 10 builds" required />
            </Field>
          </div>
          <Field label="Repositories" hint="Glob: * one level, ** any depth, comma for several">
            <Input name="repo_pattern" defaultValue={policy?.repo_pattern ?? "**"} className="font-mono" />
          </Field>
          <Field label="Tags (regex)" hint="Only matching tags are considered">
            <Input name="tag_pattern" defaultValue={policy?.tag_pattern ?? ".*"} className="font-mono" />
          </Field>
          <Field label="Protected tags (regex)" hint="Never deleted">
            <Input name="protect_pattern" defaultValue={policy?.protect_pattern ?? "^(latest|main|master|stable|prod)$"} className="font-mono" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Keep newest">
              <Input name="keep_last" type="number" min={0} defaultValue={policy?.keep_last ?? 10} />
            </Field>
            <Field label="Older than (days)" hint="Optional">
              <Input name="older_than_days" type="number" min={1} defaultValue={policy?.older_than_days ?? ""} placeholder="any age" />
            </Field>
          </div>
          <Field label="Schedule">
            <Select value={schedule} onValueChange={setSchedule}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual only</SelectItem>
                <SelectItem value="daily">Daily (automatic)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-center gap-3 pt-6">
            <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
            <Label htmlFor="enabled">Enabled</Label>
          </div>
        </form>

        {plan && (
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">Preview:</span>
              <Badge variant="destructive">{deletes.length} delete</Badge>
              <Badge variant="secondary">{plan.filter((p) => p.action === "keep").length} keep</Badge>
              <Badge variant="outline">{plan.filter((p) => p.action === "skip").length} skip</Badge>
              <span className="text-muted-foreground">≈ {formatBytes([...reclaim.values()].reduce((a, b) => a + b, 0))} unreferenced (before GC dedup)</span>
            </div>
            <div className="max-h-72 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Image</TableHead>
                    <TableHead>Digest</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plan
                    .slice()
                    .sort((a, b) => (a.action === "delete" ? -1 : 0) - (b.action === "delete" ? -1 : 0))
                    .slice(0, 300)
                    .map((p) => (
                      <TableRow key={`${p.repository}:${p.tag}`}>
                        <TableCell className="font-mono text-xs">
                          {p.repository}:{p.tag}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{shortDigest(p.digest)}</TableCell>
                        <TableCell>
                          <Badge variant={p.action === "delete" ? "destructive" : p.action === "keep" ? "secondary" : "outline"}>{p.action}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.reason}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            disabled={previewing}
            onClick={() =>
              startPreview(async () => {
                const res = await previewPolicyAction(formData());
                if (!res.ok) toast.error(res.error);
                else setPlan(res.plan);
              })
            }
          >
            {previewing ? <Loader2Icon className="animate-spin" /> : <EyeIcon />} Preview
          </Button>
          <Button
            disabled={saving}
            onClick={() =>
              startSave(async () => {
                const res = await savePolicyAction(policy?.id ?? null, formData());
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                toast.success(policy ? "Policy updated" : "Policy created");
                setOpen(false);
                router.refresh();
              })
            }
          >
            {saving && <Loader2Icon className="animate-spin" />} Save policy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PolicyActions({ policy }: { policy: Policy }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<"run" | "delete" | null>(null);

  const run = (dryRun: boolean) =>
    start(async () => {
      const res = await runPolicyAction(policy.id, dryRun);
      if (!res.ok) toast.error(res.error);
      else toast.success(res.summary);
      setConfirm(null);
      router.refresh();
    });

  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="outline" size="sm" disabled={pending} onClick={() => run(true)}>
        {pending ? <Loader2Icon className="animate-spin" /> : <EyeIcon />} Dry run
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="More actions">
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setConfirm("run")}>
            <PlayIcon /> Run now
          </DropdownMenuItem>
          <PolicyEditor
            policy={policy}
            trigger={
              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                <PencilIcon /> Edit
              </DropdownMenuItem>
            }
          />
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("delete")}>
            <Trash2Icon /> Delete policy
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && !pending && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "run" ? `Run “${policy.name}” now?` : `Delete policy “${policy.name}”?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "run"
                ? "Matching tags are deleted from the registry immediately. Run a dry run first if you haven't."
                : "The policy is removed. Images are not affected."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                if (confirm === "run") run(false);
                else
                  start(async () => {
                    const res = await deletePolicyAction(policy.id);
                    if (!res.ok) toast.error(res.error);
                    setConfirm(null);
                    router.refresh();
                  });
              }}
            >
              {pending && <Loader2Icon className="animate-spin" />}
              {confirm === "run" ? "Delete matching tags" : "Delete policy"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
