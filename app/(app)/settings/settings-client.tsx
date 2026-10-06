"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRoundIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { createTokenAction, revokeTokenAction, setEventRetentionAction } from "@/app/actions";
import { CommandLine } from "@/components/client-bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CreateTokenButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<"viewer" | "admin">("viewer");
  const [token, setToken] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setName("");
          setRole("viewer");
          setToken(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <KeyRoundIcon /> New token
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create API token</DialogTitle>
          <DialogDescription>Tokens authenticate to Berth&apos;s REST API, not to docker push/pull.</DialogDescription>
        </DialogHeader>
        {token ? (
          <div className="space-y-2">
            <p className="text-sm">Copy the token now. It won&apos;t be shown again.</p>
            <CommandLine command={token} />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="token-name">Name</Label>
              <Input id="token-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="github-actions" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as "viewer" | "admin")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer: read only</SelectItem>
                  <SelectItem value="admin">Admin: can delete and run jobs</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <DialogFooter>
          {token ? (
            <Button onClick={() => setOpen(false)}>Done</Button>
          ) : (
            <Button
              disabled={pending || !name.trim()}
              onClick={() =>
                start(async () => {
                  const res = await createTokenAction(name, role);
                  if (!res.ok) toast.error(res.error);
                  else setToken(res.token);
                  router.refresh();
                })
              }
            >
              {pending && <Loader2Icon className="animate-spin" />} Create token
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RevokeTokenButton({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Revoke ${name}`}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await revokeTokenAction(id);
          if (!res.ok) toast.error(res.error);
          else toast.success(`Revoked ${name}`);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <Trash2Icon className="text-muted-foreground" />}
    </Button>
  );
}

export function RetentionForm({ days }: { days: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(days));
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await setEventRetentionAction(Number(value));
          if (!res.ok) toast.error(res.error);
          else toast.success("Retention saved");
          router.refresh();
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="retention">Keep events for (days, 0 = forever)</Label>
        <Input id="retention" type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} className="w-40" />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" />} Save
      </Button>
    </form>
  );
}
