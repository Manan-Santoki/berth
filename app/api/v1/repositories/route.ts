import { json, withApi } from "@/lib/api";
import { getSnapshot } from "@/lib/registry/snapshot";

/** GET /api/v1/repositories?fresh=1 — every repository with tag counts and sizes. */
export const GET = withApi("viewer", async (req) => {
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  const snap = await getSnapshot({ fresh });
  return json({
    generatedAt: new Date(snap.generatedAt).toISOString(),
    totals: snap.totals,
    repositories: snap.repos.map((r) => ({
      name: r.name,
      tags: r.tags.length,
      size: r.size,
      lastUpdated: r.lastUpdated,
      error: r.error,
    })),
    errors: snap.errors,
  });
});
