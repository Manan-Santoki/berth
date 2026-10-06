import { TimeAgo } from "@/components/client-bits";
import { Mono, PageHeader } from "@/components/shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/session";
import { env, features } from "@/lib/env";
import { listUsers } from "@/lib/users";
import { CreateUserButton, UserActions } from "./users-client";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const me = await requireUser();
  const admin = me.role === "admin";
  const users = listUsers();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Registry accounts (docker login) and their dashboard role. Viewers can browse; admins can delete and manage."
        actions={admin && features.userManagement && <CreateUserButton host={env.registryPublicHost} />}
      />

      {!features.userManagement && (
        <Alert>
          <AlertTitle>Accounts are managed outside Berth</AlertTitle>
          <AlertDescription>
            Set <Mono>HTPASSWD_PATH</Mono> to the htpasswd file your registry uses to create users and reset passwords here. People can still sign in with their
            registry credentials, and you can change their role.
          </AlertDescription>
        </Alert>
      )}

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Registry access</TableHead>
              <TableHead>Last dashboard login</TableHead>
              {admin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.username}>
                <TableCell className="font-mono text-sm">
                  {u.username}
                  {u.username === me.username && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                  {u.bootstrap && (
                    <Badge variant="outline" className="ml-2">
                      bootstrap
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={u.role === "admin" ? "default" : "secondary"} className="capitalize">
                    {u.role}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">{u.registryAccess ? "push & pull" : <span className="text-muted-foreground">dashboard only</span>}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  <TimeAgo value={u.last_login} />
                </TableCell>
                {admin && (
                  <TableCell className="text-right">
                    {!u.bootstrap && <UserActions username={u.username} role={u.role} self={u.username === me.username} canSetPassword={features.userManagement} host={env.registryPublicHost} />}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <p className="text-xs text-muted-foreground">
        The bootstrap admin <Mono>{env.adminUsername}</Mono> comes from <Mono>ADMIN_USERNAME</Mono>/<Mono>ADMIN_PASSWORD</Mono> and is also the account Berth uses to talk to
        the registry.
      </p>
    </div>
  );
}
