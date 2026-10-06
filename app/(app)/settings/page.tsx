import { TimeAgo } from "@/components/client-bits";
import { KeyValue, Mono, PageHeader, Section } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/session";
import { kvGet } from "@/lib/db";
import { env, features } from "@/lib/env";
import { ping } from "@/lib/registry/client";
import { listTokens } from "@/lib/tokens";
import { VERSION } from "@/lib/version";
import { CreateTokenButton, RetentionForm, RevokeTokenButton } from "./settings-client";

export const metadata = { title: "Settings" };

const API = [
  ["GET", "/api/v1/repositories", "All repositories with tag counts and sizes (?fresh=1 to rescan)"],
  ["GET", "/api/v1/repository?name=", "One repository with every tag"],
  ["GET", "/api/v1/image?repository=&reference=", "Manifest, platforms, config and history of a tag or digest"],
  ["DELETE", "/api/v1/image?repository=&reference=", "Delete an image (admin)"],
  ["GET", "/api/v1/events?repository=&action=&limit=", "Registry events"],
  ["POST", "/api/v1/gc", 'Start garbage collection, body {"dryRun":false} (admin)'],
  ["POST", "/api/v1/policies/:id/run", 'Run a cleanup policy, body {"dryRun":false} (admin)'],
  ["GET", "/api/v1/jobs/:id", "Status and output of a job"],
  ["GET", "/api/health", "Liveness probe (no auth)"],
] as const;

function Feature({ on }: { on: boolean }) {
  return <Badge variant={on ? "default" : "outline"}>{on ? "enabled" : "off"}</Badge>;
}

export default async function SettingsPage() {
  const user = await requireUser();
  const admin = user.role === "admin";
  const health = await ping();
  const tokens = admin ? listTokens() : [];
  const retention = kvGet<number>("event_retention_days") ?? 90;

  const webhookYaml = `notifications:
  endpoints:
    - name: berth
      url: http://berth:3000/api/registry/events
      headers:
        Authorization: [Bearer <WEBHOOK_TOKEN>]
      timeout: 5s
      threshold: 5
      backoff: 10s
      ignoredmediatypes:
        - application/octet-stream`;

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description={`Berth v${VERSION}`} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Registry connection">
          <KeyValue
            items={[
              ["Status", <Badge key="s" variant={health.ok ? "default" : "destructive"}>{health.ok ? `up · ${health.latencyMs} ms` : "unreachable"}</Badge>],
              ["Internal URL", <Mono key="u">{env.registryUrl}</Mono>],
              ["Public host", <Mono key="h">{env.registryPublicHost}</Mono>],
              ["API version", health.apiVersion ?? "—"],
              ["Service account", <Mono key="a">{env.adminUsername}</Mono>],
            ]}
          />
          {health.error && <p className="mt-3 text-sm text-destructive">{health.error}</p>}
        </Section>
        <Section title="Features" description="Each one switches on when its setting is present">
          <KeyValue
            items={[
              ["User management", <span key="u" className="flex items-center gap-2"><Feature on={features.userManagement} /><Mono>HTPASSWD_PATH</Mono></span>],
              ["Garbage collection", <span key="g" className="flex items-center gap-2"><Feature on={features.garbageCollection} /><Mono>REGISTRY_STORAGE_PATH + REGISTRY_CONFIG_PATH</Mono></span>],
              ["Disk usage", <span key="d" className="flex items-center gap-2"><Feature on={features.diskUsage} /><Mono>REGISTRY_STORAGE_PATH</Mono></span>],
              ["Activity webhooks", <span key="w" className="flex items-center gap-2"><Feature on={features.webhooks} /><Mono>WEBHOOK_TOKEN</Mono></span>],
              ["Metrics", <span key="m" className="flex items-center gap-2"><Feature on={features.metrics} /><Mono>REGISTRY_METRICS_URL</Mono></span>],
            ]}
          />
        </Section>
      </div>

      <Section title="Activity webhooks" description="Add this to the registry config so pushes, pulls and deletes are recorded (the bundled compose already does)">
        <pre className="overflow-auto rounded-md bg-muted p-4 font-mono text-xs">{webhookYaml}</pre>
        {admin && (
          <div className="mt-4">
            <RetentionForm days={retention} />
          </div>
        )}
      </Section>

      {admin && (
        <Section title="API tokens" description="Use with Authorization: Bearer <token> for CI and scripts" actions={<CreateTokenButton />}>
          {tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tokens yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>
                      <Mono className="text-muted-foreground">{t.prefix}…</Mono>
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.role === "admin" ? "default" : "secondary"}>{t.role}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <TimeAgo value={t.created_at} /> by {t.created_by}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <TimeAgo value={t.last_used_at} />
                    </TableCell>
                    <TableCell className="text-right">
                      <RevokeTokenButton id={t.id} name={t.name} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      )}

      <Section title="REST API" description="Authenticate with a session cookie or an API token">
        <Table>
          <TableBody>
            {API.map(([method, path, desc]) => (
              <TableRow key={`${method} ${path}`}>
                <TableCell className="w-20">
                  <Badge variant={method === "DELETE" ? "destructive" : method === "POST" ? "default" : "secondary"} className="font-mono">
                    {method}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">{path}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{desc}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </div>
  );
}
