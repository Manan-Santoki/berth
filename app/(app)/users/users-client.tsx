"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRoundIcon, Loader2Icon, MoreHorizontalIcon, ShieldIcon, Trash2Icon, UserPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { createUserAction, deleteUserAction, resetPasswordAction, setRoleAction } from "@/app/actions";
import { CommandLine } from "@/components/client-bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function RevealPassword({ username, password, host }: { username: string; password: string; host: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm">Copy the password now. It won&apos;t be shown again.</p>
      <CommandLine command={password} />
      <p className="text-xs text-muted-foreground">Then sign in with:</p>
      <CommandLine command={`docker login -u ${username} ${host}`} />
    </div>
  );
}

export function CreateUserButton({ host }: { host: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"viewer" | "admin">("viewer");
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);
  const [pending, start] = useTransition();

  const reset = () => {
    setUsername("");
    setPassword("");
    setRole("viewer");
    setCreated(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlusIcon /> Add user
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add registry user</DialogTitle>
          <DialogDescription>The account can push and pull immediately. Its role controls what it can do in this dashboard.</DialogDescription>
        </DialogHeader>
        {created ? (
          <RevealPassword username={created.username} password={created.password} host={host} />
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-username">Username</Label>
              <Input id="new-username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ci-bot" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Password</Label>
              <Input id="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave empty to generate one" />
            </div>
            <div className="space-y-1.5">
              <Label>Dashboard role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as "viewer" | "admin")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer: browse only</SelectItem>
                  <SelectItem value="admin">Admin: delete, cleanup, users</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <DialogFooter>
          {created ? (
            <Button onClick={() => setOpen(false)}>Done</Button>
          ) : (
            <Button
              disabled={pending || !username.trim()}
              onClick={() =>
                start(async () => {
                  const res = await createUserAction(username, password, role);
                  if (!res.ok) {
                    toast.error(res.error);
                    return;
                  }
                  setCreated({ username: username.trim(), password: res.password });
                  router.refresh();
                })
              }
            >
              {pending && <Loader2Icon className="animate-spin" />} Create user
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UserActions({ username, role, self, canSetPassword, host }: { username: string; role: string; self: boolean; canSetPassword: boolean; host: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<"password" | "delete" | null>(null);
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);

  const close = () => {
    setDialog(null);
    setPassword("");
    setRevealed(null);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${username}`} disabled={pending}>
            {pending ? <Loader2Icon className="animate-spin" /> : <MoreHorizontalIcon />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={self}
            onSelect={() =>
              start(async () => {
                const res = await setRoleAction(username, role === "admin" ? "viewer" : "admin");
                if (!res.ok) toast.error(res.error);
                router.refresh();
              })
            }
          >
            <ShieldIcon /> Make {role === "admin" ? "viewer" : "admin"}
          </DropdownMenuItem>
          {canSetPassword && (
            <DropdownMenuItem onSelect={() => setDialog("password")}>
              <KeyRoundIcon /> Reset password
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={self} onSelect={() => setDialog("delete")}>
            <Trash2Icon /> Delete user
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === "delete" ? `Delete ${username}?` : `Reset password for ${username}`}</DialogTitle>
            <DialogDescription>
              {dialog === "delete"
                ? "They lose registry access right away. Images they pushed are kept."
                : "Existing docker logins with the old password stop working immediately."}
            </DialogDescription>
          </DialogHeader>
          {dialog === "password" &&
            (revealed ? (
              <RevealPassword username={username} password={revealed} host={host} />
            ) : (
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave empty to generate one" />
            ))}
          <DialogFooter>
            {revealed ? (
              <Button onClick={close}>Done</Button>
            ) : (
              <Button
                variant={dialog === "delete" ? "destructive" : "default"}
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    if (dialog === "delete") {
                      const res = await deleteUserAction(username);
                      if (!res.ok) toast.error(res.error);
                      else toast.success(`Deleted ${username}`);
                      close();
                    } else {
                      const res = await resetPasswordAction(username, password);
                      if (!res.ok) toast.error(res.error);
                      else setRevealed(res.password);
                    }
                    router.refresh();
                  })
                }
              >
                {pending && <Loader2Icon className="animate-spin" />}
                {dialog === "delete" ? "Delete user" : "Set password"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
