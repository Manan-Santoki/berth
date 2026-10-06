"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { deleteImagesAction } from "@/app/actions";
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
import { repoHref } from "@/lib/format";

export function DeleteImageButton({ repository, reference, aliases }: { repository: string; reference: string; aliases: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2Icon /> Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {repository}:{reference}?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>The manifest is removed from the registry and can&apos;t be pulled any more. This can&apos;t be undone.</p>
              {aliases.length > 0 && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-foreground">
                  <p className="font-medium">These tags point at the same image and will also be removed:</p>
                  <p className="mt-1 font-mono text-xs">{aliases.join(", ")}</p>
                </div>
              )}
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
              start(async () => {
                const res = await deleteImagesAction(repository, [reference]);
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                toast.success(`Deleted ${res.results.flatMap((r) => r.removedTags).join(", ") || reference}`);
                setOpen(false);
                router.push(repoHref(repository));
                router.refresh();
              });
            }}
          >
            {pending && <Loader2Icon className="animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
