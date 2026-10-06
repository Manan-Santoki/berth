import { apiError, json, withApi } from "@/lib/api";
import { getPolicy, runPolicy } from "@/lib/cleanup";

/** POST /api/v1/policies/:id/run {"dryRun": true} — runs a cleanup policy. */
export const POST = withApi<RouteContext<"/api/v1/policies/[id]/run">>("admin", async (req, principal, ctx) => {
  const { id } = await ctx.params;
  const policy = getPolicy(Number(id));
  if (!policy) return apiError("Policy not found", 404);
  const body = (await req.json().catch(() => ({}))) as { dryRun?: boolean };
  const result = await runPolicy(policy, principal.username, body.dryRun !== false);
  return json(result);
});
