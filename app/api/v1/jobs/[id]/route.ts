import { apiError, json, withApi } from "@/lib/api";
import { getJob } from "@/lib/jobs";

/** GET /api/v1/jobs/:id — status and output of a GC or cleanup job. */
export const GET = withApi<RouteContext<"/api/v1/jobs/[id]">>("viewer", async (_req, _p, ctx) => {
  const { id } = await ctx.params;
  const job = getJob(Number(id));
  if (!job) return apiError("Job not found", 404);
  return json(job);
});
