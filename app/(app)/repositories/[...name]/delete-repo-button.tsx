"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { deleteRepositoryAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DeleteRepositoryButton({ repository, tagCount, size = "sm" }: { repository: string; tagCount: number; size?: "sm" | "default" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        setOpen(o);
        if (!o) setTyped("");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive" size={size}>
          <Trash2Icon /> Delete repository
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {repository}?</DialogTitle>
          <DialogDescription>
            {tagCount > 0
              ? `All ${tagCount} tag(s) are deleted and the repository is removed from the catalog. Anything pulling these images will break. This can't be undone.`
              : "The empty repository is removed from the catalog."}{" "}
            Run garbage collection afterwards to free the disk space.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-repo">
            Type <span className="font-mono font-semibold">{repository}</span> to confirm
          </Label>
          <Input id="confirm-repo" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="font-mono" />
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={pending || typed !== repository}
            onClick={() =>
              start(async () => {
                const res = await deleteRepositoryAction(repository);
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                toast.success(`Deleted ${repository}`, {
                  description: res.deletedImages ? `${res.deletedImages} image(s) removed. Run garbage collection to free space.` : undefined,
                });
                setOpen(false);
                router.push("/repositories");
                router.refresh();
              })
            }
          >
            {pending && <Loader2Icon className="animate-spin" />} Delete repository
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
