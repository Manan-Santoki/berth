import { RefreshButton } from "@/components/client-bits";
import { PageHeader } from "@/components/shared";
import { repoActivity } from "@/lib/events";
import { formatBytes } from "@/lib/format";
import { getSnapshot } from "@/lib/registry/snapshot";
import { RepoBrowser, type RepoRow } from "./repo-browser";

export const metadata = { title: "Repositories" };

export default async function RepositoriesPage() {
  const snap = await getSnapshot();
  const activity = repoActivity();
  const rows: RepoRow[] = snap.repos.map((r) => {
    const a = activity.get(r.name);
    return {
      name: r.name,
      tags: r.tags.length,
      size: r.size,
      lastUpdated: r.lastUpdated,
      lastPull: a?.lastPull ?? null,
      pulls30d: a?.pulls30d ?? 0,
      platforms: [...new Set(r.tags.flatMap((t) => t.platforms))].sort(),
      error: r.error ?? null,
    };
  });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Repositories"
        description={`${snap.totals.repos} repositories · ${snap.totals.tags} tags · ${formatBytes(snap.totals.size)} referenced`}
        actions={<RefreshButton path="/repositories" />}
      />
      <RepoBrowser rows={rows} />
    </div>
  );
}
