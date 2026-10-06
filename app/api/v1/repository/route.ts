import { apiError, json, withApi } from "@/lib/api";
import { summarizeRepository } from "@/lib/registry/snapshot";

/** GET /api/v1/repository?name=team/app — one repository with all tags. */
export const GET = withApi("viewer", async (req) => {
  const name = new URL(req.url).searchParams.get("name");
  if (!name) return apiError("Query parameter 'name' is required", 400);
  const repo = await summarizeRepository(name);
  if (repo.error) return apiError(repo.error, 502);
  return json({
    name: repo.name,
    size: repo.size,
    lastUpdated: repo.lastUpdated,
    tags: repo.tags.map((t) => ({ ...t, blobs: undefined })),
  });
});
